/**
 * Load step: apply verified enrichment to the graph with provenance in meta.
 */

import type { GraphStore } from "../store/index";
import type {
  PersistedEdgeChange,
  PersistedNodeChange,
  PersistedPropertyChange,
  VerifiedEnrichmentRecord,
} from "./types";
import { GraphNode } from "../domain/GraphNode";
import { GraphEdge } from "../domain/GraphEdge";

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

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function getDisplayName(node: {
  id: string;
  properties: Record<string, unknown>;
}): string {
  return String(
    node.properties.name ??
      node.properties.title ??
      node.properties.venue ??
      node.id
  );
}

function getTargetLabel(node: { labels: string[] }): string {
  return node.labels[0] ?? "Node";
}

/**
 * Apply a verified enrichment record to a graph node: merge properties and set provenance in meta.
 */
export async function loadVerifiedRecord(
  store: GraphStore,
  nodeId: string,
  record: VerifiedEnrichmentRecord
): Promise<{
  propertyChanges: PersistedPropertyChange[];
  nodeChanges: PersistedNodeChange[];
  edgeChanges: PersistedEdgeChange[];
  nodesCreated: number;
  edgesCreated: number;
}> {
  const existing = await store.getNode(nodeId);
  if (!existing) {
    return {
      propertyChanges: [],
      nodeChanges: [],
      edgeChanges: [],
      nodesCreated: 0,
      edgesCreated: 0,
    };
  }
  const existingMeta = (existing.meta ?? {}) as Record<string, unknown>;
  const provenanceMeta = buildProvenanceMeta(record);
  const mergedMeta = { ...existingMeta, ...provenanceMeta };
  const propertyChanges: PersistedPropertyChange[] = Object.entries(record.properties)
    .filter(([key, value]) => !valuesEqual(existing.properties[key], value))
    .map(([key, value]) => ({
      key,
      value,
      action: existing.properties[key] === undefined ? "created" : "updated",
      targetId: existing.id,
      targetLabel: getTargetLabel(existing),
    }));

  await store.updateNode(nodeId, {
    properties: record.properties,
    meta: mergedMeta,
  });

  const nodeChanges: PersistedNodeChange[] = [];
  const edgeChanges: PersistedEdgeChange[] = [];
  let nodesCreated = 0;
  let edgesCreated = 0;
  for (const node of record.relatedNodes ?? []) {
    const current = await store.getNode(node.id);
    if (current) {
      const changedProperties = Object.entries(node.properties)
        .filter(([key, value]) => !valuesEqual(current.properties[key], value))
        .map(([key]) => key);
      await store.updateNode(node.id, {
        labels: node.labels,
        properties: node.properties,
        meta: node.meta ?? current.meta,
      });
      nodeChanges.push({
        id: node.id,
        label: node.labels[0] ?? current.labels[0] ?? "Node",
        name: getDisplayName({ id: node.id, properties: node.properties }),
        action: changedProperties.length > 0 ? "updated_existing" : "matched_existing",
        changedProperties,
      });
      continue;
    }
    await store.createNode(new EnrichedNode(node.id, node.labels, node.properties, node.meta));
    nodesCreated += 1;
    nodeChanges.push({
      id: node.id,
      label: node.labels[0] ?? "Node",
      name: getDisplayName({ id: node.id, properties: node.properties }),
      action: "created",
      changedProperties: Object.keys(node.properties),
    });
  }

  for (const edge of record.relatedEdges ?? []) {
    const current = await store.getEdge(edge.id);
    const fromNode = await store.getNode(edge.fromNodeId);
    const toNode = await store.getNode(edge.toNodeId);
    const changedProperties = Object.entries(edge.properties ?? {})
      .filter(([key, value]) => !valuesEqual(current?.properties[key], value))
      .map(([key]) => key);
    if (current) {
      await store.updateEdge(edge.id, {
        properties: edge.properties,
        meta: edge.meta ?? current.meta,
      });
      edgeChanges.push({
        id: edge.id,
        type: edge.type,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        fromName: fromNode ? getDisplayName(fromNode) : edge.fromNodeId,
        toName: toNode ? getDisplayName(toNode) : edge.toNodeId,
        action: changedProperties.length > 0 ? "updated_existing" : "matched_existing",
        changedProperties,
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
    edgeChanges.push({
      id: edge.id,
      type: edge.type,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      fromName: fromNode ? getDisplayName(fromNode) : edge.fromNodeId,
      toName: toNode ? getDisplayName(toNode) : edge.toNodeId,
      action: "created",
      changedProperties,
    });
  }

  return { propertyChanges, nodeChanges, edgeChanges, nodesCreated, edgesCreated };
}
