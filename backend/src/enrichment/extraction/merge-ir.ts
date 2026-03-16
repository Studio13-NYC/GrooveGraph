/**
 * Merge two ExtractionIRs (ensemble/dual_run). Dedupes mentions by span,
 * remaps ids, merges relations. Used when multiple engines run on the same input.
 */

import type { ExtractionIR, ExtractionMention, ExtractionRelation } from "../types";

function spanKey(m: ExtractionMention): string {
  const s = m.span;
  if (s) return `${s.start}:${s.end}`;
  return `:${m.text}`;
}

/**
 * Merge two IRs into one: same-span mentions become one (keep higher confidence or first),
 * relations remapped to merged mention ids and deduped by (from, to, type).
 */
export function mergeExtractionIR(a: ExtractionIR, b: ExtractionIR): ExtractionIR {
  const mentionById = new Map<string, ExtractionMention>();
  const spanToMention = new Map<string, ExtractionMention>();
  const oldIdToNewId = new Map<string, string>();

  const addMention = (m: ExtractionMention) => {
    const key = spanKey(m);
    const existing = spanToMention.get(key);
    const newId = `merged-${spanToMention.size}`;
    if (existing) {
      oldIdToNewId.set(m.id, existing.id);
      return;
    }
    const merged: ExtractionMention = {
      ...m,
      id: newId,
      confidence: m.confidence ?? "medium",
    };
    spanToMention.set(key, merged);
    mentionById.set(newId, merged);
    oldIdToNewId.set(m.id, newId);
  };

  for (const m of a.mentions) addMention(m);
  for (const m of b.mentions) addMention(m);

  const mentions = Array.from(mentionById.values());

  const seenRelations = new Set<string>();
  const relations: ExtractionRelation[] = [];

  const addRelation = (r: ExtractionRelation) => {
    const from = oldIdToNewId.get(r.fromMentionId) ?? r.fromMentionId;
    const to = oldIdToNewId.get(r.toMentionId) ?? r.toMentionId;
    if (!mentionById.has(from) || !mentionById.has(to)) return;
    const key = `${from}\t${to}\t${r.type}`;
    if (seenRelations.has(key)) return;
    seenRelations.add(key);
    relations.push({
      ...r,
      id: `rel-${relations.length}`,
      fromMentionId: from,
      toMentionId: to,
    });
  };

  for (const r of a.relations) addRelation(r);
  for (const r of b.relations) addRelation(r);

  return {
    mentions,
    relations,
    sourceId: a.sourceId ?? b.sourceId,
    documents: [...(a.documents ?? []), ...(b.documents ?? [])],
    chunks: [...(a.chunks ?? []), ...(b.chunks ?? [])],
  };
}
