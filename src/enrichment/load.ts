/**
 * Load step: apply verified enrichment to the graph with provenance in meta.
 */

import type { GraphStore } from "../store/index.js";
import type { VerifiedEnrichmentRecord } from "./types.js";

/**
 * Build node meta for provenance (per FUNCTIONAL_SPEC §5.2 and DOMAIN_MODEL §3.4).
 */
function buildProvenanceMeta(record: VerifiedEnrichmentRecord): Record<string, unknown> {
  return {
    enrichment_source: record.source_id,
    enrichment_url: record.url,
    enrichment_date: record.retrieved_at,
    ...(record.excerpt != null && { enrichment_excerpt: record.excerpt }),
    enrichment_confidence: record.confidence,
  };
}

/**
 * Apply a verified enrichment record to a graph node: merge properties and set provenance in meta.
 */
export async function loadVerifiedRecord(
  store: GraphStore,
  nodeId: string,
  record: VerifiedEnrichmentRecord
): Promise<void> {
  const existing = await store.getNode(nodeId);
  if (!existing) return;
  const existingMeta = (existing.meta ?? {}) as Record<string, unknown>;
  const provenanceMeta = buildProvenanceMeta(record);
  const mergedMeta = { ...existingMeta, ...provenanceMeta };
  await store.updateNode(nodeId, {
    properties: record.properties,
    meta: mergedMeta,
  });
}
