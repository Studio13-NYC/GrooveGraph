/**
 * Ontology normalization for ExtractionIR (Phase 3). Constrains mentions and
 * relations to allowed labels and relationship types; sets canonicalKey for
 * alias/canonical matching before bundle creation.
 */

import type {
  ExtractionIR,
  ExtractionMention,
  ExtractionRelation,
  ResearchOntologyContext,
} from "../types";

function slugForCanonicalKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "unknown";
}

/**
 * Normalize IR to ontology: coerce mention labels to allowedEntityLabels;
 * set canonicalKey on mentions for downstream matching; keep only relations
 * whose type is in allowedRelationshipTypes and whose from/to mention ids exist.
 */
export function normalizeExtractionIR(
  ir: ExtractionIR,
  ontology: ResearchOntologyContext
): ExtractionIR {
  const allowedLabels = new Set(
    [...(ontology.allowedEntityLabels ?? []), ...(ontology.syntheticLabels ?? [])]
  );
  const allowedRelations = new Set(ontology.allowedRelationshipTypes ?? []);
  const defaultLabel =
    ontology.allowedEntityLabels?.length ? ontology.allowedEntityLabels[0] : "Artist";

  const mentions: ExtractionMention[] = ir.mentions.map((m) => {
    const labelCoerced = !allowedLabels.has(m.label);
    const needsDisambiguation =
      labelCoerced || m.needsDisambiguation === true || m.confidence === "low";
    return {
      ...m,
      label: labelCoerced ? defaultLabel : m.label,
      canonicalKey: m.canonicalKey ?? slugForCanonicalKey(m.text),
      ...(needsDisambiguation ? { needsDisambiguation: true } : {}),
    };
  });
  const mentionIds = new Set(mentions.map((m) => m.id));

  const relations: ExtractionRelation[] = ir.relations.filter(
    (r) =>
      allowedRelations.has(r.type) &&
      mentionIds.has(r.fromMentionId) &&
      mentionIds.has(r.toMentionId)
  );

  return {
    mentions,
    relations,
    sourceId: ir.sourceId,
  };
}
