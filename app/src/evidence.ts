import puppeteer from "puppeteer";

import { getEnvValue } from "./env.ts";
import type { SourceQueryPlan } from "./query-planner.ts";

interface SourceChunk {
  source: string;
  ok: boolean;
  detail?: string;
  request_sample?: Record<string, unknown>;
  response_sample?: Record<string, unknown>;
  snippets: Array<{
    name: string;
    snippet: string;
    source_url?: string;
    source?: string;
  }>;
  items: Array<Record<string, unknown>>;
}

export interface EvidenceBundle {
  summary_text: string;
  extract_text: string;
  plan: SourceQueryPlan;
  sources: {
    graph_context: SourceChunk;
    wikipedia: SourceChunk;
    musicbrainz: SourceChunk;
    discogs: SourceChunk;
    web: SourceChunk;
  };
}

const FETCH_CACHE = new Map<string, { expires_at: number; value: unknown }>();
const BRAVE_WEB_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const WIKIPEDIA_PAGE_MAX_CHARS = 50_000;
const WEB_PAGE_MAX_CHARS = 40_000;

function defaultHeaders(): Record<string, string> {
  const userAgent =
    getEnvValue("GROOVEGRAPH_HTTP_USER_AGENT", "").trim() ||
    "GrooveGraphReset/0.2 (+https://github.com/Studio13-NYC/GrooveGraph)";
  return {
    "User-Agent": userAgent,
    "Api-User-Agent": userAgent,
    Accept: "application/json",
  };
}

function compact(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function dedupeStrings(values: Array<unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const cleaned = compact(value);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string, headers: Record<string, string> = {}, retries = 2): Promise<any> {
  const cached = FETCH_CACHE.get(url);
  if (cached && cached.expires_at > Date.now()) {
    return cached.value;
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { ...defaultHeaders(), ...headers } });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < retries) {
          await sleep(350 * (attempt + 1));
          continue;
        }
        throw new Error(`${response.status} ${response.statusText}${body ? `: ${body.slice(0, 180)}` : ""}`);
      }
      const value = await response.json();
      FETCH_CACHE.set(url, { expires_at: Date.now() + 15 * 60_000, value });
      return value;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("fetch_error");
      if (attempt < retries) {
        await sleep(350 * (attempt + 1));
        continue;
      }
    }
  }
  throw lastError ?? new Error("fetch_failed");
}

async function searchWikipediaTitle(query: string): Promise<{ title: string; summary: any; search_url: string; summary_url: string } | null> {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`;
  const search = await fetchJson(searchUrl);
  const hit = Array.isArray(search?.query?.search) ? search.query.search[0] : null;
  if (!hit?.title) {
    return null;
  }
  const title = String(hit.title);
  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const summary = await fetchJson(summaryUrl, {}, 3);
  return { title, summary, search_url: searchUrl, summary_url: summaryUrl };
}

async function fetchWikipediaPageExtract(title: string): Promise<{ extract: string; fullurl: string }> {
  const pageUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts|info&explaintext=true&redirects=1&inprop=url&titles=${encodeURIComponent(title)}`;
  const page = await fetchJson(pageUrl, {}, 3);
  const pages = (page?.query || {}).pages || {};
  const first = typeof pages === "object" ? Object.values(pages)[0] : null;
  if (!first || typeof first !== "object") {
    throw new Error("wikipedia_page_missing");
  }
  return {
    extract: compact(String((first as any).extract || "")).slice(0, WIKIPEDIA_PAGE_MAX_CHARS),
    fullurl: String((first as any).fullurl || ""),
  };
}

function buildWikipediaQueries(plan: SourceQueryPlan): Array<{ kind: "artist" | "recording" | "fallback"; query: string }> {
  const ordered = [
    ...plan.artist_candidates.map((query) => ({ kind: "artist" as const, query })),
    ...plan.recording_candidates.map((query) => ({ kind: "recording" as const, query })),
    ...plan.source_queries.wikipedia.map((query) => ({ kind: "fallback" as const, query })),
  ];
  const seen = new Set<string>();
  return ordered.filter((entry) => {
    const key = entry.query.toLowerCase();
    if (!entry.query || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function fetchWikipedia(plan: SourceQueryPlan): Promise<SourceChunk> {
  const plannedQueries = buildWikipediaQueries(plan);
  const items: Array<Record<string, unknown>> = [];
  const snippets: SourceChunk["snippets"] = [];
  const requestSample = {
    planner_summary: plan.summary,
    artist_queries: plan.artist_candidates,
    recording_queries: plan.recording_candidates,
    fallback_queries: plan.source_queries.wikipedia,
    matched_queries: [] as Array<Record<string, string>>,
  };
  let lastError = "no_results";

  for (const planned of plannedQueries) {
    try {
      const match = await searchWikipediaTitle(planned.query);
      if (!match) {
        lastError = "no_results";
        continue;
      }
      const page = await fetchWikipediaPageExtract(match.title);
      const snippet = compact(String(match.summary?.extract || page.extract || "")).slice(0, 1600);
      const sourceUrl = String(page.fullurl || match.summary?.content_urls?.desktop?.page || "");
      const fullExtract = compact(page.extract || "");
      if (!fullExtract) {
        lastError = "empty_page_extract";
        continue;
      }

      requestSample.matched_queries.push({
        kind: planned.kind,
        query: planned.query,
        title: match.title,
      });
      snippets.push({
        name: match.title,
        snippet,
        source_url: sourceUrl,
        source: "wikipedia",
      });
      items.push({
        kind: planned.kind,
        query: planned.query,
        title: match.title,
        description: match.summary?.description || "",
        extract: fullExtract,
        content_url: sourceUrl,
        search_url: match.search_url,
        summary_url: match.summary_url,
      });

      if (planned.kind !== "fallback" && requestSample.matched_queries.filter((entry) => entry.kind === planned.kind).length >= 1) {
        continue;
      }
      if (items.length >= 2) {
        break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "wikipedia_error";
    }
  }

  return {
    source: "wikipedia",
    ok: items.length > 0,
    detail: items.length > 0 ? "separate_artist_and_recording_pages" : lastError,
    request_sample: requestSample,
    response_sample: {
      titles: items.map((item) => item.title),
      urls: items.map((item) => item.content_url),
    },
    snippets,
    items,
  };
}

async function queryMusicBrainz(endpoint: "artist" | "recording", query: string): Promise<any> {
  const url = `https://musicbrainz.org/ws/2/${endpoint}/?query=${encodeURIComponent(query)}&fmt=json&limit=3`;
  return fetchJson(url, {}, 2);
}

async function fetchMusicBrainz(plan: SourceQueryPlan): Promise<SourceChunk> {
  let topArtist: any | null = null;
  let matchedArtistQuery = "";
  let artistResults: any[] = [];
  for (const query of plan.source_queries.musicbrainz_artist) {
    try {
      const json = await queryMusicBrainz("artist", query);
      const artists = Array.isArray(json?.artists) ? json.artists : [];
      if (artists.length) {
        topArtist = artists[0];
        artistResults = artists;
        matchedArtistQuery = query;
        break;
      }
    } catch {
      // Try the next query.
    }
  }

  let topRecording: any | null = null;
  let matchedRecordingQuery = "";
  let recordingResults: any[] = [];
  for (const query of plan.source_queries.musicbrainz_recording) {
    try {
      const json = await queryMusicBrainz("recording", query);
      const recordings = Array.isArray(json?.recordings) ? json.recordings : [];
      if (recordings.length) {
        topRecording = recordings[0];
        recordingResults = recordings;
        matchedRecordingQuery = query;
        break;
      }
    } catch {
      // Try the next query.
    }
  }

  const snippets = dedupeStrings([topArtist?.name, topRecording?.title]).map((name) => {
    const artistMatch = artistResults.find((artist: any) => artist.name === name);
    if (artistMatch) {
      return {
        name,
        snippet: compact([artistMatch.disambiguation, artistMatch.country, artistMatch.type].filter(Boolean).join(" • ")),
        source_url: artistMatch.id ? `https://musicbrainz.org/artist/${artistMatch.id}` : "",
        source: "musicbrainz",
      };
    }
    const recordingMatch = recordingResults.find((recording: any) => recording.title === name);
    return {
      name,
      snippet: compact([recordingMatch?.disambiguation, recordingMatch?.["first-release-date"]].filter(Boolean).join(" • ")),
      source_url: recordingMatch?.id ? `https://musicbrainz.org/recording/${recordingMatch.id}` : "",
      source: "musicbrainz",
    };
  });

  return {
    source: "musicbrainz",
    ok: Boolean(topArtist || topRecording),
    detail: topArtist || topRecording ? "planned_lookup" : "no_results",
    request_sample: {
      artist_queries: plan.source_queries.musicbrainz_artist,
      recording_queries: plan.source_queries.musicbrainz_recording,
      matched_artist_query: matchedArtistQuery || null,
      matched_recording_query: matchedRecordingQuery || null,
    },
    response_sample: {
      top_artist: topArtist
        ? {
            id: topArtist.id,
            name: topArtist.name,
            country: topArtist.country,
            type: topArtist.type,
          }
        : null,
      top_recording: topRecording
        ? {
            id: topRecording.id,
            title: topRecording.title,
            first_release_date: topRecording["first-release-date"],
          }
        : null,
    },
    snippets,
    items: [
      ...artistResults.map((artist: any) => ({
        id: artist.id,
        entity_type: "Artist",
        name: artist.name,
        disambiguation: artist.disambiguation,
        country: artist.country,
        type: artist.type,
        source_url: artist.id ? `https://musicbrainz.org/artist/${artist.id}` : "",
      })),
      ...recordingResults.map((recording: any) => ({
        id: recording.id,
        entity_type: "Recording",
        name: recording.title,
        disambiguation: recording.disambiguation,
        first_release_date: recording["first-release-date"],
        source_url: recording.id ? `https://musicbrainz.org/recording/${recording.id}` : "",
      })),
    ],
  };
}

async function fetchDiscogs(plan: SourceQueryPlan): Promise<SourceChunk> {
  const token = getEnvValue("DISCOGS_TOKEN", "").trim();
  const artistQueries = dedupeStrings(plan.artist_candidates).slice(0, 4);
  const releaseQueries = dedupeStrings(
    plan.recording_candidates.flatMap((recording) => [
      plan.artist_candidates[0] ? `${recording} ${plan.artist_candidates[0]}` : recording,
      recording,
    ]),
  ).slice(0, 6);

  if (!token) {
    return {
      source: "discogs",
      ok: false,
      detail: "missing_DISCOGS_TOKEN",
      request_sample: { artist_queries: artistQueries, release_queries: releaseQueries },
      response_sample: {},
      snippets: [],
      items: [],
    };
  }

  async function searchDiscogs(type: "artist" | "release", query: string): Promise<any[]> {
    const url = `https://api.discogs.com/database/search?type=${encodeURIComponent(type)}&per_page=3&q=${encodeURIComponent(query)}`;
    const json = await fetchJson(url, { Authorization: `Discogs token=${token}` }, 2);
    return Array.isArray(json?.results) ? json.results : [];
  }

  let artistResults: any[] = [];
  let matchedArtistQuery = "";
  for (const query of artistQueries) {
    try {
      const results = await searchDiscogs("artist", query);
      if (results.length) {
        artistResults = results;
        matchedArtistQuery = query;
        break;
      }
    } catch {
      // Try the next query.
    }
  }

  let releaseResults: any[] = [];
  let matchedReleaseQuery = "";
  for (const query of releaseQueries) {
    try {
      const results = await searchDiscogs("release", query);
      if (results.length) {
        releaseResults = results;
        matchedReleaseQuery = query;
        break;
      }
    } catch {
      // Try the next query.
    }
  }

  const snippets = [
    ...artistResults.slice(0, 2).map((result: any) => ({
      name: compact(result.title || result.resource_url || "Discogs artist"),
      snippet: compact([result.country, result.year, result.type].filter(Boolean).join(" • ")),
      source_url: String(result.resource_url || result.uri || ""),
      source: "discogs",
    })),
    ...releaseResults.slice(0, 2).map((result: any) => ({
      name: compact(result.title || result.resource_url || "Discogs release"),
      snippet: compact([result.country, result.year, result.format].filter(Boolean).join(" • ")),
      source_url: String(result.resource_url || result.uri || ""),
      source: "discogs",
    })),
  ];

  return {
    source: "discogs",
    ok: artistResults.length > 0 || releaseResults.length > 0,
    detail: artistResults.length > 0 || releaseResults.length > 0 ? "separate_artist_and_release_searches" : "no_results",
    request_sample: {
      artist_queries: artistQueries,
      release_queries: releaseQueries,
      matched_artist_query: matchedArtistQuery || null,
      matched_release_query: matchedReleaseQuery || null,
    },
    response_sample: {
      artist_count: artistResults.length,
      release_count: releaseResults.length,
    },
    snippets,
    items: [
      ...artistResults.map((result: any) => ({
        entity_type: "Artist",
        title: result.title,
        country: result.country,
        year: result.year,
        resource_url: result.resource_url,
        uri: result.uri,
      })),
      ...releaseResults.map((result: any) => ({
        entity_type: "Release",
        title: result.title,
        country: result.country,
        year: result.year,
        format: result.format,
        resource_url: result.resource_url,
        uri: result.uri,
      })),
    ],
  };
}

async function searchBrave(plan: SourceQueryPlan): Promise<any> {
  const apiKey = getEnvValue("BRAVE_API_KEY", "").trim() || getEnvValue("BraveSearchApiKey", "").trim();
  if (!apiKey) {
    return { ok: false, detail: "missing_api_key", queries: plan.source_queries.brave };
  }

  let lastResult: any = { ok: false, detail: "no_results" };
  for (const query of plan.source_queries.brave) {
    try {
      const url = `${BRAVE_WEB_SEARCH_URL}?q=${encodeURIComponent(query)}&count=5`;
      const body = await fetchJson(
        url,
        {
          "X-Subscription-Token": apiKey,
          Accept: "application/json",
        },
        2,
      );
      const results = Array.isArray(body?.web?.results) ? body.web.results : [];
      if (results.length) {
        return { ok: true, query, body };
      }
      lastResult = { ok: false, detail: "no_results", query };
    } catch (error) {
      lastResult = { ok: false, detail: error instanceof Error ? error.message : "brave_error", query };
    }
  }
  return lastResult;
}

async function fetchRenderedPage(url: string): Promise<{ title: string; text: string; url: string; headings: string[] }> {
  const cached = FETCH_CACHE.get(url);
  if (cached && cached.expires_at > Date.now()) {
    return cached.value as { title: string; text: string; url: string; headings: string[] };
  }

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(defaultHeaders()["User-Agent"]);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 });
    await page.waitForTimeout(500);
    const result = await page.evaluate((maxChars) => {
      const removeSelectors = [
        "script",
        "style",
        "noscript",
        "svg",
        "nav",
        "header",
        "footer",
        "aside",
        "form",
        "iframe",
        ".cookie",
        ".cookies",
        ".consent",
        ".advert",
        ".ads",
        ".promo",
        ".newsletter",
        ".related",
        ".social",
      ];
      for (const selector of removeSelectors) {
        document.querySelectorAll(selector).forEach((node) => node.remove());
      }

      const root =
        document.querySelector("article") ||
        document.querySelector("main") ||
        document.body;

      const blocks = Array.from(root.querySelectorAll("h1,h2,h3,p,li"))
        .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
        .filter((text) => text.length >= 40)
        .filter((text) => !/^(home|menu|share|subscribe|newsletter|advertisement)$/i.test(text));

      const headings = Array.from(root.querySelectorAll("h1,h2,h3"))
        .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 12);

      return {
        title: (document.title || "").replace(/\s+/g, " ").trim(),
        url: window.location.href,
        headings,
        text: blocks.join("\n\n").slice(0, maxChars),
      };
    }, WEB_PAGE_MAX_CHARS);

    FETCH_CACHE.set(url, { expires_at: Date.now() + 10 * 60_000, value: result });
    return result;
  } finally {
    await browser.close();
  }
}

async function fetchWeb(plan: SourceQueryPlan): Promise<SourceChunk> {
  const brave = await searchBrave(plan);
  if (!brave.ok) {
    return {
      source: "web",
      ok: false,
      detail: String(brave.detail || "brave_failed"),
      request_sample: {
        brave_queries: plan.source_queries.brave,
        web_queries: plan.source_queries.web,
      },
      response_sample: {},
      snippets: [],
      items: [],
    };
  }

  const results = Array.isArray(brave.body?.web?.results) ? brave.body.web.results : [];
  const topResults = results
    .filter((result: any) => typeof result?.url === "string" && /^https?:\/\//.test(result.url))
    .slice(0, 5);

  const pageSamples: Array<Record<string, unknown>> = [];
  for (const result of topResults.slice(0, 3)) {
    try {
      const rendered = await fetchRenderedPage(String(result.url));
      if (!rendered.text) {
        continue;
      }
      pageSamples.push({
        url: rendered.url,
        title: compact(rendered.title || result.title || rendered.url),
        headings: rendered.headings,
        extracted_text: compact(rendered.text),
      });
    } catch {
      // Keep only discovery results when render fails.
    }
  }

  return {
    source: "web",
    ok: pageSamples.length > 0,
    detail: pageSamples.length > 0 ? "puppeteer_rendered_pages" : "no_rendered_pages",
    request_sample: {
      brave_queries: plan.source_queries.brave,
      matched_brave_query: brave.query,
      selected_urls: topResults.map((result: any) => result.url),
    },
    response_sample: {
      top_urls: topResults.map((result: any) => ({
        title: result.title,
        url: result.url,
      })),
      fetched_pages: pageSamples.map((sample) => sample.url),
    },
    snippets: pageSamples.map((sample) => ({
      name: compact(sample.title || sample.url || "web page"),
      snippet: compact(sample.extracted_text || "").slice(0, 1600),
      source_url: String(sample.url || ""),
      source: "web_page",
    })),
    items: [
      ...topResults.map((result: any) => ({
        title: result.title,
        description: result.description,
        url: result.url,
        source: "brave_result",
      })),
      ...pageSamples,
    ],
  };
}

function buildExtractionText(question: string, graphContext: any, sources: EvidenceBundle["sources"]): string {
  const sections: string[] = [
    `Question: ${question}`,
    `Graph context summary: ${JSON.stringify(graphContext?.view ?? {})}`,
  ];

  const wikipediaText = (sources.wikipedia.items || [])
    .map((item: any) => compact(item.extract || ""))
    .filter(Boolean)
    .join("\n\n");
  if (wikipediaText) {
    sections.push(`--- Wikipedia page text ---\n${wikipediaText}`);
  }

  const musicbrainzText = (sources.musicbrainz.items || [])
    .map((item: any) => compact([item.name, item.disambiguation, item.first_release_date, item.country, item.type].filter(Boolean).join(" • ")))
    .filter(Boolean)
    .join("\n");
  if (musicbrainzText) {
    sections.push(`--- MusicBrainz structured evidence ---\n${musicbrainzText}`);
  }

  const discogsText = (sources.discogs.items || [])
    .filter((item: any) => item.entity_type)
    .map((item: any) => compact([item.title, item.country, item.year, item.format].filter(Boolean).join(" • ")))
    .filter(Boolean)
    .join("\n");
  if (discogsText) {
    sections.push(`--- Discogs structured evidence ---\n${discogsText}`);
  }

  const webPageText = (sources.web.items || [])
    .filter((item: any) => typeof item?.extracted_text === "string" && item.extracted_text.trim())
    .map((item: any) => `URL: ${item.url}\nTITLE: ${item.title}\n${compact(item.extracted_text)}`)
    .join("\n\n---\n\n");
  if (webPageText) {
    sections.push(`--- Browser-rendered web page text ---\n${webPageText}`);
  }

  return sections.join("\n\n");
}

function graphContextChunk(graphContext: any): SourceChunk {
  const nodes = Array.isArray(graphContext?.nodes) ? graphContext.nodes.slice(0, 6) : [];
  return {
    source: "graph_context",
    ok: nodes.length > 0,
    detail: nodes.length ? "existing_graph_context" : "no_existing_graph_hits",
    request_sample: {
      focal_ids: graphContext?.view?.focal_ids ?? [],
      filters: graphContext?.view?.filters ?? [],
    },
    response_sample: {
      nodes: nodes.map((node: any) => ({ label: node.label, type: node.type, status: node.status })),
      edges: Array.isArray(graphContext?.edges) ? graphContext.edges.slice(0, 6) : [],
    },
    snippets: nodes.map((node: any) => ({
      name: String(node.label || node.id || "graph-node"),
      snippet: String(node.metadata_preview?.summary || node.metadata_preview?.draft_status || node.type || ""),
      source: "graph_context",
    })),
    items: [graphContext],
  };
}

function summarizeSource(chunk: SourceChunk): string {
  if (!chunk.ok) {
    return `${chunk.source}: ${chunk.detail ?? "unavailable"}`;
  }
  const firstSnippet = chunk.snippets[0];
  return `${chunk.source}: ${firstSnippet ? `${firstSnippet.name} — ${firstSnippet.snippet}` : "available"}`;
}

export async function collectEvidence(question: string, graphContext: any, plan: SourceQueryPlan): Promise<EvidenceBundle> {
  const [wikipedia, musicbrainz, discogs, web] = await Promise.all([
    fetchWikipedia(plan),
    fetchMusicBrainz(plan),
    fetchDiscogs(plan),
    fetchWeb(plan),
  ]);

  const graphChunk = graphContextChunk(graphContext);
  const summaryText = [
    `Question: ${question}`,
    `Planner: ${plan.provider} (${plan.planner_status})`,
    `Interpretation: ${plan.interpretations.join(" | ") || "none"}`,
    summarizeSource(graphChunk),
    summarizeSource(wikipedia),
    summarizeSource(musicbrainz),
    summarizeSource(discogs),
    summarizeSource(web),
  ].join("\n");
  const extractText = buildExtractionText(question, graphContext, {
    graph_context: graphChunk,
    wikipedia,
    musicbrainz,
    discogs,
    web,
  });

  return {
    summary_text: summaryText,
    extract_text: extractText,
    plan,
    sources: {
      graph_context: graphChunk,
      wikipedia,
      musicbrainz,
      discogs,
      web,
    },
  };
}
