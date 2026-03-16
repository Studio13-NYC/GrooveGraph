/**
 * Simple Album CONTAINS Track pipeline: ask LLM for matches only, derive nodes and CONTAINS edges in code.
 * No edgeCandidates from the LLM — we know the relationship is CONTAINS.
 */

import type { GraphStore } from "../../store/types";
import type { ResearchBundle, ReviewTargetEntity } from "../types";
import type { TripletSpec } from "../triplet";
import { buildResearchOntologyContext } from "../llm/ontology-context";
import { validateResearchBundle } from "../llm/validate-bundle";
import { getLlmOnlyProvenance } from "./llm-only-schema";
import { fetchWithRetry } from "../llm/fetch-with-retry";
import { getTextFromResponsesOutput, type ResponsesApiPayload } from "../llm/responses-api";

const LOG_PREFIX = "[album-contains-track]";

export type AlbumContainsTrackMatch = {
  artist: string;
  album: string;
  tracks: string[];
};

export type AlbumContainsTrackResponse = {
  normalizedScopeName?: string;
  matches?: AlbumContainsTrackMatch[];
};

function getApiKey(): string {
  return (
    process.env.OPENAI_API_KEY?.trim() || process.env.ENRICHMENT_LLM_API_KEY?.trim() || ""
  );
}

function getBaseUrl(): string {
  return (
    process.env.OPENAI_BASE_URL?.trim() ||
    process.env.ENRICHMENT_LLM_BASE_URL?.trim() ||
    "https://api.openai.com/v1"
  );
}

function getModel(): string {
  return (
    process.env.OPENAI_MODEL?.trim() ||
    process.env.ENRICHMENT_LLM_MODEL?.trim() ||
    process.env.TRIPLET_LLM_MODEL?.trim() ||
    "gpt-5.4"
  );
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function albumCandidateId(albumName: string): string {
  return `album-${slug(albumName)}`;
}

function trackCandidateId(trackName: string): string {
  return `track-${slug(trackName)}`;
}

/**
 * Turn simple matches into a ResearchBundle: nodeCandidates for each Album and Track,
 * edgeCandidates for CONTAINS (album -> track) and PLAYED_ON (scope -> album).
 */
export function matchesToBundle(
  sessionId: string,
  scopeTargetId: string,
  scopeLabel: string,
  scopeName: string,
  matches: AlbumContainsTrackMatch[]
): ResearchBundle {
  const provenance = [getLlmOnlyProvenance()];
  const nodeCandidates: ResearchBundle["nodeCandidates"] = [];
  const edgeCandidates: ResearchBundle["edgeCandidates"] = [];
  const seenAlbums = new Set<string>();
  const seenTracks = new Set<string>();

  for (const m of matches) {
    const albumId = albumCandidateId(m.album);
    if (!seenAlbums.has(albumId)) {
      seenAlbums.add(albumId);
      nodeCandidates.push({
        candidateId: albumId,
        label: "Album",
        labels: ["Album"],
        name: m.album,
        canonicalKey: `album:${m.album.toLowerCase()}`,
        confidence: "high",
        provenance,
        matchStatus: "create_new",
        reviewStatus: "pending",
      });
    }
    for (const trackName of m.tracks) {
      const trackId = trackCandidateId(trackName);
      if (!seenTracks.has(trackId)) {
        seenTracks.add(trackId);
        nodeCandidates.push({
          candidateId: trackId,
          label: "Track",
          labels: ["Track"],
          name: trackName,
          canonicalKey: `track:${trackName.toLowerCase()}`,
          confidence: "high",
          provenance,
          matchStatus: "create_new",
          reviewStatus: "pending",
        });
      }
      edgeCandidates.push({
        candidateId: `contains-${albumId}-${trackId}`,
        type: "CONTAINS",
        fromRef: { kind: "candidate", id: albumId },
        toRef: { kind: "candidate", id: trackId },
        confidence: "high",
        provenance,
        matchStatus: "create_new",
        reviewStatus: "pending",
      });
    }
    edgeCandidates.push({
      candidateId: `played-on-${scopeTargetId}-${albumId}`,
      type: "PLAYED_ON",
      fromRef: { kind: "target", id: scopeTargetId },
      toRef: { kind: "candidate", id: albumId },
      confidence: "high",
      provenance,
      matchStatus: "create_new",
      reviewStatus: "pending",
    });
  }

  return {
    sessionId,
    generatedAt: new Date().toISOString(),
    summary: `Album CONTAINS Track for ${scopeName}: ${matches.length} album(s), ${nodeCandidates.length} node(s), ${edgeCandidates.length} edge(s).`,
    targets: [{ id: scopeTargetId, label: scopeLabel, name: scopeName }],
    propertyChanges: [],
    nodeCandidates,
    edgeCandidates,
    metadata: {
      generator: "llm",
      provider: "OpenAI",
      model: getModel(),
      promptVersion: "2026-03-album-contains",
      evidenceRecordCount: 0,
      sourceCount: 1,
      notes: "Simple album/track list; edges derived in code.",
    },
  };
}

function extractJsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const candidates: string[] = [];
  if (trimmed.startsWith("{")) {
    candidates.push(trimmed);
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}") + 1;
    if (lastBrace > firstBrace) {
      candidates.push(trimmed.slice(firstBrace, lastBrace));
    }
  }
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    candidates.push(codeBlockMatch[1].trim());
  }
  const anyBrace = trimmed.indexOf("{");
  if (anyBrace >= 0) {
    const afterBrace = trimmed.slice(anyBrace);
    const lastBrace = afterBrace.lastIndexOf("}") + 1;
    if (lastBrace > 0) {
      candidates.push(afterBrace.slice(0, lastBrace));
    }
  }
  return [...new Set(candidates)];
}

function tryParseJson(text: string): AlbumContainsTrackResponse | null {
  const candidates = extractJsonCandidates(text);
  for (const candidate of candidates) {
    if (!candidate.startsWith("{")) continue;
    try {
      return JSON.parse(candidate) as AlbumContainsTrackResponse;
    } catch {
      const repaired = candidate
        .replace(/,\s*]/g, "]")
        .replace(/,\s*}/g, "}");
      try {
        return JSON.parse(repaired) as AlbumContainsTrackResponse;
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

async function callResponsesApi(
  apiKey: string,
  baseUrl: string,
  model: string,
  system: string,
  user: string,
  options: { expectJson: boolean }
): Promise<string> {
  const url = `${baseUrl}/responses`;
  const body: Record<string, unknown> = {
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (options.expectJson) {
    body.text = { format: { type: "json_object" } };
  }
  const response = await fetchWithRetry(
    () =>
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      }),
    { logPrefix: LOG_PREFIX }
  );
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Album CONTAINS Track request failed: ${response.status}. ${errText.slice(0, 300)}`);
  }
  const payload = (await response.json()) as ResponsesApiPayload;
  const rawText = getTextFromResponsesOutput(payload);
  if (!rawText) {
    throw new Error("Album CONTAINS Track: empty response.");
  }
  return rawText;
}

/**
 * Two-step pipeline: (1) LLM searches and lists albums/tracks; (2) LLM reviews that list and outputs valid JSON.
 */
export async function runAlbumContainsTrackPipeline(
  sessionId: string,
  triplet: TripletSpec,
  targets: ReviewTargetEntity[],
  options: { scopeTarget: ReviewTargetEntity }
): Promise<{ bundle: ResearchBundle }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Album CONTAINS Track pipeline requires OPENAI_API_KEY or ENRICHMENT_LLM_API_KEY.");
  }

  const scopeName = options.scopeTarget.name;
  const model = getModel();
  const baseUrl = getBaseUrl().replace(/\/$/, "");

  // Step 1: LLM does the search — free-form list (no JSON) to avoid malformed output.
  console.log(`${LOG_PREFIX} step 1: search for albums and tracks scope=${scopeName}`);
  const searchSystem = `You are a music knowledge expert. Your task is to list albums by a given artist and each album's track list.

Respond with a clear, structured list. You can use plain text or markdown. For each album, list its title and then the track titles in order. Be accurate and use standard release track listings. Include major studio albums.`;
  const searchUser = `List albums and their track lists for the artist: ${scopeName}.`;
  const searchResponse = await callResponsesApi(apiKey, baseUrl, model, searchSystem, searchUser, {
    expectJson: false,
  });

  // Step 2: LLM reviews the search results and formats as strict JSON.
  console.log(`${LOG_PREFIX} step 2: review and format as JSON`);
  const reviewSystem = `You are a music data formatter. You will receive a previous response listing albums and tracks for an artist.

Your tasks:
1. Review the list: fix any errors, remove duplicates, ensure track titles match standard releases.
2. Output ONLY valid JSON in this exact shape. No trailing commas. No markdown. No commentary.
{
  "normalizedScopeName": "Canonical artist name (e.g. The Who)",
  "matches": [
    { "artist": "Artist Name", "album": "Album Title", "tracks": ["Track 1", "Track 2"] }
  ]
}

Rules: normalizedScopeName is the canonical artist name. Each match has artist, album, and tracks (array of strings). Output nothing but the JSON object.`;
  const reviewUser = `Review the following research and output the JSON format described in your instructions.

Previous response to review:
---
${searchResponse.slice(0, 12000)}
---`;
  const formatResponse = await callResponsesApi(apiKey, baseUrl, model, reviewSystem, reviewUser, {
    expectJson: true,
  });

  const parsed = tryParseJson(formatResponse);
  const scopeTargetId = options.scopeTarget.id;
  if (!parsed) {
    const snippet = formatResponse.slice(0, 400).replace(/\n/g, " ");
    console.warn(
      `${LOG_PREFIX} review step returned invalid JSON; using empty matches. Raw length=${formatResponse.length} first400=${snippet}`
    );
    const emptyBundle = matchesToBundle(
      sessionId,
      scopeTargetId,
      options.scopeTarget.label,
      options.scopeTarget.name,
      []
    );
    const ontology = buildResearchOntologyContext();
    const validated = validateResearchBundle(emptyBundle, {
      sessionId,
      targets,
      ontology,
    });
    return { bundle: validated };
  }

  const matches = Array.isArray(parsed.matches) ? parsed.matches : [];
  if (matches.length === 0) {
    console.warn(`${LOG_PREFIX} LLM returned 0 matches for ${scopeName}`);
  }

  const bundle = matchesToBundle(
    sessionId,
    scopeTargetId,
    options.scopeTarget.label,
    options.scopeTarget.name,
    matches
  );

  const ontology = buildResearchOntologyContext();
  const validated = validateResearchBundle(bundle, {
    sessionId,
    targets,
    ontology,
  });

  console.log(
    `${LOG_PREFIX} done nodes=${validated.nodeCandidates.length} edges=${validated.edgeCandidates.length}`
  );

  return { bundle: validated };
}
