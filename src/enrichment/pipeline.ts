/**
 * Enrichment pipeline: resolve entity → collect (adapters) → verify → load.
 */

import type { GraphStore } from "../store/index.js";
import {
  getGraphEntityLabels,
  getPrimaryEntityLabel,
  getSearchLabelsForEntityType,
} from "../lib/entity-identity.js";
import { getSourcesForEntityType } from "./sources/registry.js";
import type { SourceDefinition } from "./sources/registry.js";
import { executeSourceAdapter } from "./adapters/index.js";
import type {
  PersistedEdgeChange,
  PersistedNodeChange,
  PersistedPropertyChange,
  RawEnrichmentPayload,
  SourceRuntimeRoute,
  VerifiedEnrichmentRecord,
} from "./types.js";
import { verifyPayload } from "./verify.js";
import { loadVerifiedRecord } from "./load.js";

function getNodeDisplayName(node: {
  labels: string[];
  properties: Record<string, unknown>;
}): string {
  const label = getPrimaryEntityLabel(node.labels);
  const name = node.properties.name ?? node.properties.title ?? node.properties.venue;
  return String(name ?? node.properties.id ?? "");
}

/**
 * Run adapters for the given source definitions and entity display name.
 */
async function collectFromSources(
  sources: SourceDefinition[],
  nodeId: string,
  entityType: string,
  displayName: string
): Promise<{
  payloads: RawEnrichmentPayload[];
  attemptedSourceIds: string[];
  attemptedSourceRoutes: Array<{ sourceId: string; route: SourceRuntimeRoute }>;
}> {
  const results = await Promise.all(
    sources.map((source) =>
      executeSourceAdapter({
        source,
        entityType,
        displayName,
        targetNodeId: nodeId,
      })
    )
  );
  return {
    payloads: results.flatMap((result) => result.payloads),
    attemptedSourceIds: results.filter((result) => result.attempted).map((result) => result.sourceId),
    attemptedSourceRoutes: results
      .filter((result) => result.attempted)
      .map((result) => ({ sourceId: result.sourceId, route: result.route })),
  };
}

export interface EnrichmentResult {
  nodeId: string;
  sourcesUsed: string[];
  propertiesAdded: number;
  confidence: string[];
  nodesCreated: number;
  edgesCreated: number;
  propertyChanges: PersistedPropertyChange[];
  nodeChanges: PersistedNodeChange[];
  edgeChanges: PersistedEdgeChange[];
}

export interface EnrichmentPreviewResult {
  nodeId: string;
  entityType: string;
  displayName: string;
  sourcesUsed: string[];
  sourceIdsUsed: string[];
  checkedSourceIds: string[];
  checkedSourceRoutes: Array<{ sourceId: string; route: SourceRuntimeRoute }>;
  availableSources: SourceDefinition[];
  verifiedRecords: VerifiedEnrichmentRecord[];
}

export async function previewEnrichmentPipeline(
  store: GraphStore,
  nodeId: string
): Promise<EnrichmentPreviewResult> {
  const node = await store.getNode(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }
  const entityType = getPrimaryEntityLabel(node.labels);
  const displayName = getNodeDisplayName(node);
  const graphEntityLabels = getGraphEntityLabels(node.labels);
  const relevantEntityTypes = graphEntityLabels.includes("Artist") || graphEntityLabels.includes("Person")
    ? getSearchLabelsForEntityType("Artist")
    : [...new Set(graphEntityLabels)];
  const availableSources = Array.from(
    new Map(
      relevantEntityTypes.flatMap((label) => getSourcesForEntityType(label, false)).map((source) => [source.id, source])
    ).values()
  );
  const sources = Array.from(
    new Map(
      relevantEntityTypes.flatMap((label) => getSourcesForEntityType(label, true)).map((source) => [source.id, source])
    ).values()
  );
  const { payloads: rawPayloads, attemptedSourceIds, attemptedSourceRoutes } = await collectFromSources(
    sources,
    nodeId,
    entityType,
    displayName
  );
  const verifiedRecords: VerifiedEnrichmentRecord[] = [];
  for (const raw of rawPayloads) {
    const record = verifyPayload(raw, displayName);
    if (record != null) {
      verifiedRecords.push(record);
    }
  }
  return {
    nodeId,
    entityType,
    displayName,
    sourcesUsed: [...new Set(verifiedRecords.map((record) => record.source_name))],
    sourceIdsUsed: [...new Set(verifiedRecords.map((record) => record.source_id))],
    checkedSourceIds: [...new Set(attemptedSourceIds)],
    checkedSourceRoutes: attemptedSourceRoutes.filter(
      (value, index, items) => items.findIndex((item) => item.sourceId === value.sourceId) === index
    ),
    availableSources,
    verifiedRecords,
  };
}

/**
 * Run the full enrichment pipeline for a graph node: collect from implemented sources,
 * verify, load. Returns a summary.
 */
export async function runEnrichmentPipeline(
  store: GraphStore,
  nodeId: string
): Promise<EnrichmentResult> {
  const preview = await previewEnrichmentPipeline(store, nodeId);
  const sourcesUsed: string[] = [];
  const confidence: string[] = [];
  const propertyChanges = new Map<string, PersistedPropertyChange>();
  const nodeChanges = new Map<string, PersistedNodeChange>();
  const edgeChanges = new Map<string, PersistedEdgeChange>();
  let nodesCreated = 0;
  let edgesCreated = 0;
  for (const record of preview.verifiedRecords) {
    const loadResult = await loadVerifiedRecord(store, nodeId, record);
    sourcesUsed.push(record.source_name);
    confidence.push(record.confidence);
    for (const change of loadResult.propertyChanges) {
      propertyChanges.set(`${change.targetId}:${change.key}`, change);
    }
    for (const change of loadResult.nodeChanges) {
      nodeChanges.set(change.id, change);
    }
    for (const change of loadResult.edgeChanges) {
      edgeChanges.set(change.id, change);
    }
    nodesCreated += loadResult.nodesCreated;
    edgesCreated += loadResult.edgesCreated;
  }
  return {
    nodeId,
    sourcesUsed: [...new Set(sourcesUsed)],
    propertiesAdded: propertyChanges.size,
    confidence,
    nodesCreated,
    edgesCreated,
    propertyChanges: [...propertyChanges.values()],
    nodeChanges: [...nodeChanges.values()],
    edgeChanges: [...edgeChanges.values()],
  };
}
