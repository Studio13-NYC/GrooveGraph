import { getEnvValue } from "./env.ts";

export interface SourceQueryPlan {
  provider: string;
  planner_status: "ok" | "fallback";
  summary: string;
  interpretations: string[];
  artist_candidates: string[];
  recording_candidates: string[];
  source_queries: {
    wikipedia: string[];
    musicbrainz_artist: string[];
    musicbrainz_recording: string[];
    discogs: string[];
    brave: string[];
    web: string[];
  };
}

const REQUIRED_QUERY_KEYS = [
  "summary",
  "interpretations",
  "artist_candidates",
  "recording_candidates",
  "source_queries",
] as const;

const CONNECTOR_WORDS = new Set(["a", "an", "and", "at", "for", "from", "in", "of", "on", "the", "to", "with"]);

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

function capitalizePhrase(word: string): boolean {
  return /^[A-Z0-9][A-Za-z0-9'&.-]*$/.test(word);
}

function titleishPhrases(question: string): string[] {
  const tokens = question.match(/[A-Za-z0-9'&.-]+/g) ?? [];
  const phrases: string[] = [];
  let current: string[] = [];

  const flush = () => {
    const phrase = compact(current.join(" "));
    if (phrase.split(/\s+/).length >= 2) {
      phrases.push(phrase);
    }
    current = [];
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const lower = token.toLowerCase();
    if (capitalizePhrase(token)) {
      current.push(token);
      continue;
    }
    if (current.length > 0 && CONNECTOR_WORDS.has(lower) && capitalizePhrase(tokens[index + 1] || "")) {
      current.push(lower);
      continue;
    }
    flush();
  }
  flush();
  return dedupeStrings(phrases);
}

function sliceCandidates(phrase: string, fromStart: boolean): string[] {
  const words = phrase.split(/\s+/);
  const candidates: string[] = [];
  if (words.length < 2) {
    return candidates;
  }

  for (const length of [2, 3, 4, 5]) {
    if (words.length < length) {
      continue;
    }
    const slice = fromStart ? words.slice(0, length) : words.slice(words.length - length);
    candidates.push(slice.join(" "));
  }
  return candidates;
}

function buildFallbackPlan(question: string, graphContext: any, reason: string): SourceQueryPlan {
  const graphNodes = Array.isArray(graphContext?.nodes) ? graphContext.nodes : [];
  const artistNodes = graphNodes.filter((node: any) => node.type === "Artist").map((node: any) => node.label);
  const recordingNodes = graphNodes.filter((node: any) => node.type === "Recording").map((node: any) => node.label);
  const phrases = titleishPhrases(question);
  const artistCandidates = dedupeStrings([
    ...artistNodes,
    ...phrases.flatMap((phrase) => sliceCandidates(phrase, true)),
  ]).slice(0, 5);
  const recordingCandidates = dedupeStrings([
    ...recordingNodes,
    ...phrases.flatMap((phrase) => sliceCandidates(phrase, false)),
  ]).slice(0, 5);

  return {
    provider: "fallback",
    planner_status: "fallback",
    summary: `Using deterministic fallback query planning. ${reason}`.trim(),
    interpretations: [question],
    artist_candidates: artistCandidates,
    recording_candidates: recordingCandidates,
    source_queries: {
      wikipedia: dedupeStrings([
        ...recordingCandidates.map((recording) => `${recording} album`),
        ...recordingCandidates,
        ...artistCandidates,
        question,
      ]).slice(0, 8),
      musicbrainz_artist: dedupeStrings([...artistCandidates, question]).slice(0, 5),
      musicbrainz_recording: dedupeStrings([
        ...recordingCandidates.map((recording) =>
          artistCandidates[0] ? `recording:"${recording}" AND artist:"${artistCandidates[0]}"` : recording,
        ),
        ...recordingCandidates,
        question,
      ]).slice(0, 6),
      discogs: dedupeStrings([
        ...artistCandidates.map((artist) => `${artist} ${recordingCandidates[0] || ""}`),
        question,
      ]).slice(0, 5),
      brave: dedupeStrings([
        `${question} studio gear`,
        `${question} recording studio`,
        ...recordingCandidates.map((recording) => `${recording} recording studio`),
        question,
      ]).slice(0, 6),
      web: dedupeStrings([
        `${question} interview`,
        `${question} recording studio`,
        `${question} producer engineer`,
      ]).slice(0, 6),
    },
  };
}

function isValidQueryPlan(value: any): boolean {
  if (!value || !REQUIRED_QUERY_KEYS.every((key) => Object.prototype.hasOwnProperty.call(value, key))) {
    return false;
  }
  if (!Array.isArray(value.interpretations) || !Array.isArray(value.artist_candidates) || !Array.isArray(value.recording_candidates)) {
    return false;
  }
  const queries = value.source_queries;
  return Boolean(
    queries &&
    Array.isArray(queries.wikipedia) &&
    Array.isArray(queries.musicbrainz_artist) &&
    Array.isArray(queries.musicbrainz_recording) &&
    Array.isArray(queries.discogs) &&
    Array.isArray(queries.brave) &&
    Array.isArray(queries.web),
  );
}

function sanitizePlan(value: any): SourceQueryPlan {
  return {
    provider: "openai",
    planner_status: "ok",
    summary: compact(value.summary),
    interpretations: dedupeStrings(value.interpretations).slice(0, 6),
    artist_candidates: dedupeStrings(value.artist_candidates).slice(0, 6),
    recording_candidates: dedupeStrings(value.recording_candidates).slice(0, 6),
    source_queries: {
      wikipedia: dedupeStrings(value.source_queries.wikipedia).slice(0, 8),
      musicbrainz_artist: dedupeStrings(value.source_queries.musicbrainz_artist).slice(0, 6),
      musicbrainz_recording: dedupeStrings(value.source_queries.musicbrainz_recording).slice(0, 8),
      discogs: dedupeStrings(value.source_queries.discogs).slice(0, 6),
      brave: dedupeStrings(value.source_queries.brave).slice(0, 8),
      web: dedupeStrings(value.source_queries.web).slice(0, 8),
    },
  };
}

export async function planSourceQueries(question: string, graphContext: any): Promise<SourceQueryPlan> {
  const apiKey = getEnvValue("OPENAI_API_KEY", "").trim();
  const model = getEnvValue("OPENAI_QUERY_PLANNER_MODEL", "gpt-5.4-mini").trim();
  if (!apiKey) {
    return buildFallbackPlan(question, graphContext, "OPENAI_API_KEY is not configured.");
  }

  const prompt = {
    question,
    graph_context: {
      nodes: Array.isArray(graphContext?.nodes)
        ? graphContext.nodes.slice(0, 12).map((node: any) => ({
            label: node.label,
            type: node.type,
            status: node.status,
          }))
        : [],
      focal_ids: graphContext?.view?.focal_ids ?? [],
    },
    instructions: [
      "Interpret the user's music-research prompt and produce source-specific search queries.",
      "Use different query wording for Wikipedia, MusicBrainz artist search, MusicBrainz recording search, Discogs, Brave search, and general web lookups.",
      "Prefer precise artist and recording names over generic restatements.",
      "Return JSON only.",
    ],
    required_shape: {
      summary: "string",
      interpretations: ["string"],
      artist_candidates: ["string"],
      recording_candidates: ["string"],
      source_queries: {
        wikipedia: ["string"],
        musicbrainz_artist: ["string"],
        musicbrainz_recording: ["string"],
        discogs: ["string"],
        brave: ["string"],
        web: ["string"],
      },
    },
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Return JSON only.",
              'Required keys: "summary", "interpretations", "artist_candidates", "recording_candidates", "source_queries".',
              'The "source_queries" object must contain arrays for "wikipedia", "musicbrainz_artist", "musicbrainz_recording", "discogs", "brave", and "web".',
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify(prompt),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`OpenAI query planning failed with ${response.status}${errorBody ? `: ${errorBody}` : ""}`);
    }

    const body = await response.json();
    const text = String(body?.choices?.[0]?.message?.content || "");
    if (!text) {
      throw new Error("OpenAI query planning returned no message content");
    }
    const parsed = JSON.parse(text);
    if (!isValidQueryPlan(parsed)) {
      throw new Error("OpenAI query planning returned invalid schema");
    }
    return sanitizePlan(parsed);
  } catch (error) {
    return buildFallbackPlan(
      question,
      graphContext,
      error instanceof Error ? error.message : "OpenAI query planning failed.",
    );
  }
}
