/**
 * Load step: apply verified enrichment to the graph with provenance in meta.
 */

import type { GraphStore } from "../store/index.js";
import type { VerifiedEnrichmentRecord } from "./types.js";
import { GraphNode } from "../domain/GraphNode.js";
import { GraphEdge } from "../domain/GraphEdge.js";

class EnrichedNode extends GraphNode {
  constructor(
    id: string,
    labels: string[],
    properties: Record<string, unknown>,
    meta?: Record<string, unknown>
  ) {
    super(id, labels, properties, meta);
  }
}

class EnrichedEdge extends GraphEdge {
  constructor(
    id: string,
    type: string,
    fromNodeId: string,
    toNodeId: string,
    properties: Record<string, unknown> = {},
    meta?: Record<string, unknown>
  ) {
    super(id, type, fromNodeId, toNodeId, properties, meta);
  }
}

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
): Promise<{ nodesCreated: number; edgesCreated: number }> {
  const existing = await store.getNode(nodeId);
  if (!existing) return { nodesCreated: 0, edgesCreated: 0 };
  const existingMeta = (existing.meta ?? {}) as Record<string, unknown>;
  const provenanceMeta = buildProvenanceMeta(record);
  const mergedMeta = { ...existingMeta, ...provenanceMeta };
  await store.updateNode(nodeId, {
    properties: record.properties,
    meta: mergedMeta,
  });

  let nodesCreated = 0;
  let edgesCreated = 0;
  for (const node of record.relatedNodes ?? []) {
    const current = await store.getNode(node.id);
    if (current) {
      await store.updateNode(node.id, {
        labels: node.labels,
        properties: node.properties,
        meta: node.meta ?? current.meta,
      });
      continue;
    }
    await store.createNode(new EnrichedNode(node.id, node.labels, node.properties, node.meta));
    nodesCreated += 1;
  }

  for (const edge of record.relatedEdges ?? []) {
    const current = await store.getEdge(edge.id);
    if (current) {
      await store.updateEdge(edge.id, {
        properties: edge.properties,
        meta: edge.meta ?? current.meta,
      });
      continue;
    }
    await store.createEdge(
      new EnrichedEdge(
        edge.id,
        edge.type,
        edge.fromNodeId,
        edge.toNodeId,
        edge.properties ?? {},
        edge.meta
      )
    );
    edgesCreated += 1;
  }

  return { nodesCreated, edgesCreated };
}
