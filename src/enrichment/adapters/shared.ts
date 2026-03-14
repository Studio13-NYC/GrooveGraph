import type { RawEnrichmentPayload, SourceMetadata } from "../types";
import type { SourceDefinition } from "../sources/registry";

export const USER_AGENT = "GrooveGraph/1.0 (https://github.com/Studio13-NYC/GrooveGraph)";
const SEARCH_URL = "https://html.duckduckgo.com/html/";

export interface SearchResult {
  url: string;
  title: string;
  snippet?: string;
}

export interface PageSummary {
  url: string;
  title?: string;
  description?: string;
  paragraphs: string[];
}

function withTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

export async function fetchText(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        ...(init.headers ?? {}),
      },
      signal: init.signal ?? withTimeoutSignal(timeoutMs),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000
): Promise<T | null> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
        ...(init.headers ?? {}),
      },
      signal: init.signal ?? withTimeoutSignal(timeoutMs),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export function stripHtml(value: string): string {
  return normalizeWhitespace(decodeHtmlEntities(value.replace(/<[^>]+>/g, " ")));
}

export function stripMarkdown(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[`*_>#~-]/g, " ")
  );
}

export function extractDomain(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

function unwrapDuckDuckGoUrl(value: string): string {
  if (!value) return value;
  if (value.startsWith("//")) {
    return `https:${value}`;
  }
  if (!value.includes("duckduckgo.com/l/?")) {
    return decodeURIComponent(value);
  }
  try {
    const wrapped = value.startsWith("http") ? value : `https:${value}`;
    const parsed = new URL(wrapped);
    const uddg = parsed.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : value;
  } catch {
    return value;
  }
}

export async function searchDuckDuckGo(
  query: string,
  options?: { siteDomain?: string; maxResults?: number }
): Promise<SearchResult[]> {
  const searchQuery = options?.siteDomain ? `${query} site:${options.siteDomain}` : query;
  const body = new URLSearchParams({ q: searchQuery, kl: "us-en" });
  const html = await fetchText(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!html) return [];

  const matches = Array.from(
    html.matchAll(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)
  );
  const results: SearchResult[] = [];
  for (const match of matches) {
    const url = unwrapDuckDuckGoUrl(match[1] ?? "");
    if (!url.startsWith("http")) continue;
    if (options?.siteDomain) {
      const domain = extractDomain(url);
      if (domain && domain !== options.siteDomain && !domain.endsWith(`.${options.siteDomain}`)) {
        continue;
      }
    }
    results.push({
      url,
      title: stripHtml(match[2] ?? ""),
    });
    if (results.length >= (options?.maxResults ?? 5)) break;
  }
  return results;
}

export async function fetchPageSummary(url: string): Promise<PageSummary | null> {
  const html = await fetchText(url);
  if (!html) return null;
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescriptionMatch = html.match(
    /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i
  );
  const paragraphMatches = Array.from(html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi));
  const paragraphs = paragraphMatches
    .map((match) => stripHtml(match[1] ?? ""))
    .filter((paragraph) => paragraph.length >= 60)
    .slice(0, 4);
  return {
    url,
    title: titleMatch ? stripHtml(titleMatch[1]) : undefined,
    description: metaDescriptionMatch ? stripHtml(metaDescriptionMatch[1]) : undefined,
    paragraphs,
  };
}

function getFirecrawlApiKey(): string | null {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  return apiKey ? apiKey : null;
}

function markdownToParagraphs(markdown?: string, maxParagraphs = 4): string[] {
  if (!markdown) return [];
  return markdown
    .split(/\n{2,}/)
    .map((section) => stripMarkdown(section))
    .filter((section) => section.length >= 60)
    .slice(0, maxParagraphs);
}

export async function searchFirecrawl(
  query: string,
  options?: { maxResults?: number }
): Promise<PageSummary[]> {
  const apiKey = getFirecrawlApiKey();
  if (!apiKey) return [];

  try {
    const response = await fetchJson<{
      success?: boolean;
      data?: Array<{
        url?: string;
        markdown?: string;
        metadata?: {
          sourceURL?: string;
          title?: string;
          description?: string;
        };
      }>;
    }>("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: options?.maxResults ?? 3,
        scrapeOptions: {
          formats: ["markdown"],
          onlyMainContent: true,
        },
      }),
    });
    if (!response?.success || !response.data) return [];

    return response.data
      .map((document): PageSummary | null => {
        const sourceUrl = document.url ?? document.metadata?.sourceURL;
        if (!sourceUrl) return null;
        const description = document.metadata?.description
          ? normalizeWhitespace(document.metadata.description)
          : undefined;
        return {
          url: sourceUrl,
          title: document.metadata?.title,
          description,
          paragraphs: markdownToParagraphs(document.markdown),
        } satisfies PageSummary;
      })
      .filter((value): value is PageSummary => value !== null);
  } catch {
    return [];
  }
}

export async function scrapeFirecrawlPageSummary(url: string): Promise<PageSummary | null> {
  const apiKey = getFirecrawlApiKey();
  if (!apiKey) return null;

  try {
    const response = await fetchJson<{
      success?: boolean;
      data?: {
        markdown?: string;
        metadata?: {
          sourceURL?: string;
          title?: string;
          description?: string;
        };
      };
    }>("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });
    const sourceUrl = response?.data?.metadata?.sourceURL ?? url;
    return {
      url: sourceUrl,
      title: response?.data?.metadata?.title,
      description: response?.data?.metadata?.description
        ? normalizeWhitespace(response.data.metadata.description)
        : undefined,
      paragraphs: markdownToParagraphs(response?.data?.markdown),
    };
  } catch {
    return null;
  }
}

export function buildSourceMetadata(
  source: SourceDefinition,
  url: string,
  excerpt?: string,
  methodOverride?: SourceMetadata["source_type"]
): SourceMetadata {
  return {
    source_id: source.id,
    source_name: source.name,
    source_type: methodOverride ?? source.method,
    url,
    retrieved_at: new Date().toISOString(),
    ...(excerpt ? { excerpt } : {}),
  };
}

export function buildNarrativePayload(
  source: SourceDefinition,
  sourceUrl: string,
  sourceDisplayName: string,
  narrative: string,
  propertyKey: "biography" | "summary" | "notes" = "notes",
  methodOverride?: SourceMetadata["source_type"]
): RawEnrichmentPayload[] {
  const cleaned = normalizeWhitespace(narrative);
  if (!cleaned) return [];
  return [
    {
      source: buildSourceMetadata(source, sourceUrl, cleaned.slice(0, 500), methodOverride),
      sourceDisplayName,
      properties: {
        [propertyKey]: cleaned,
      },
    },
  ];
}

export function buildSummaryNarrative(page: PageSummary): string {
  return [page.description, ...page.paragraphs]
    .map((value) => (value ? normalizeWhitespace(value) : ""))
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .join(" ");
}
