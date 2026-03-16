/**
 * Rule-based mention extraction (Phase 2). Deterministic pass: find capitalized
 * and multi-word spans as candidate mentions. No NLP deps; replace or
 * complement with wink-nlp/compromise later.
 */

import type { ConfidenceLevel } from "../types";
import type { ExtractionMention } from "../types";
import type { ResearchOntologyContext } from "../types";

/** Minimum character length for a mention span (avoids "I", "A"). */
const MIN_MENTION_LENGTH = 2;

/** Default entity label when ontology is not used for disambiguation. */
const DEFAULT_MENTION_LABEL = "Artist";

/**
 * Find spans that look like proper nouns: one or more consecutive words
 * starting with an uppercase letter (Latin). Returns mentions with byte offsets.
 */
export function extractMentionsFromText(
  text: string,
  ontology: ResearchOntologyContext,
  options?: {
    defaultLabel?: string;
    confidence?: ConfidenceLevel;
    sourceId?: string;
  }
): ExtractionMention[] {
  const defaultLabel =
    options?.defaultLabel ??
    (ontology.allowedEntityLabels?.length ? ontology.allowedEntityLabels[0] : DEFAULT_MENTION_LABEL);
  const confidence = options?.confidence ?? "low";
  const sourceId = options?.sourceId;

  const mentions: ExtractionMention[] = [];
  // Match one or more consecutive "words" that start with uppercase (Latin).
  const regex = /\b([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)*)\b/g;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = regex.exec(text)) !== null) {
    const spanText = match[1];
    if (spanText.length < MIN_MENTION_LENGTH) continue;
    const start = match.index;
    const end = start + spanText.length;
    mentions.push({
      id: `mention-${index}`,
      text: spanText.trim(),
      label: defaultLabel,
      span: { start, end },
      sourceId,
      confidence,
    });
    index += 1;
  }
  return mentions;
}
