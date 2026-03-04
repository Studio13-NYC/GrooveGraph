/**
 * Verification step: validate payload shape, score entity match, sanitize.
 * Produces VerifiedEnrichmentRecord for loading.
 */

import type {
  RawEnrichmentPayload,
  VerifiedEnrichmentRecord,
  ConfidenceLevel,
} from "./types.js";

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Score how well the source display name matches the graph node's display name.
 * Returns a confidence level.
 */
function scoreEntityMatch(
  sourceName: string | undefined,
  nodeDisplayName: string
): ConfidenceLevel {
  if (!sourceName?.trim()) return "low";
  const a = normalizeForMatch(sourceName);
  const b = normalizeForMatch(nodeDisplayName);
  if (a === b) return "high";
  if (a.includes(b) || b.includes(a)) return "medium";
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = new Set(b.split(/\s+/));
  const overlap = [...wordsA].filter((w) => wordsB.has(w)).length;
  const minWords = Math.min(wordsA.size, wordsB.size);
  if (minWords > 0 && overlap / minWords >= 0.8) return "medium";
  return "low";
}

/** Sanitize a string for storage: trim, max length. */
function sanitizeString(value: unknown, maxLen: number = 10000): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s.length === 0 ? undefined : s.slice(0, maxLen);
}

/** Sanitize properties: only allow known types; trim strings. */
function sanitizeProperties(
  properties: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(properties)) {
    if (v == null) continue;
    if (typeof v === "string") {
      const trimmed = sanitizeString(v);
      if (trimmed !== undefined) out[k] = trimmed;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = v;
    } else if (Array.isArray(v)) {
      const arr = v.filter((x) => typeof x === "string").map((x) => String(x).trim()).filter(Boolean);
      if (arr.length > 0) out[k] = arr;
    } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Verify a raw enrichment payload: schema (has at least one property), entity match, sanitization.
 * Returns a verified record or null if rejected.
 */
export function verifyPayload(
  raw: RawEnrichmentPayload,
  nodeDisplayName: string
): VerifiedEnrichmentRecord | null {
  const props = raw.properties;
  if (!props || typeof props !== "object" || Object.keys(props).length === 0) {
    return null;
  }
  const confidence = scoreEntityMatch(raw.sourceDisplayName, nodeDisplayName);
  const sanitized = sanitizeProperties(props);
  if (Object.keys(sanitized).length === 0) return null;
  return {
    properties: sanitized,
    source_id: raw.source.source_id,
    source_name: raw.source.source_name,
    url: raw.source.url,
    retrieved_at: raw.source.retrieved_at,
    excerpt: raw.source.excerpt ? sanitizeString(raw.source.excerpt, 2000) : undefined,
    confidence,
  };
}
