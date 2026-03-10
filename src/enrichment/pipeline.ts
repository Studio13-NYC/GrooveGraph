/**
 * Enrichment pipeline: resolve entity → collect (adapters) → verify → load.
 */

import type { GraphStore } from "../store/index.js";
import { getSourcesForEntityType } from "./sources/registry.js";
import { fetchArtistByName } from "./adapters/musicbrainz.js";
import { fetchSummaryByName } from "./adapters/wikipedia.js";
import type { RawEnrichmentPayload } from "./types.js";
import { verifyPayload } from "./verify.js";
import { loadVerifiedRecord } from "./load.js";

function getNodeDisplayName(node: {
  labels: string[];
  properties: Record<string, unknown>;
}): string {
  const label = node.labels[0] ?? "";
  const name = node.properties.name ?? node.properties.title ?? node.properties.venue;
  return String(name ?? node.properties.id ?? "");
}

/**
 * Run adapters for the given source adapter ids and entity display name.
 * Only calls implemented adapters (musicbrainz, wikipedia for Artist).
 */
async function collectFromAdapters(
  adapterIds: string[],
  entityType: string,
  displayName: string
): Promise<RawEnrichmentPayload[]> {
  const results: RawEnrichmentPayload[] = [];
  if (entityType !== "Artist") return results;
  for (const id of adapterIds) {
    try {
      if (id === "musicbrainz") {
        const payloads = await fetchArtistByName(displayName);
        results.push(...payloads);
      } else if (id === "wikipedia") {
        const payloads = await fetchSummaryByName(displayName);
        results.push(...payloads);
      }
    } catch (e) {
      console.error(`enrichment adapter ${id} failed:`, e);
    }
  }
  return results;
}

export interface EnrichmentResult {
  nodeId: string;
  sourcesUsed: string[];
  propertiesAdded: number;
  confidence: string[];
  nodesCreated: number;
  edgesCreated: number;
}

/**
 * Run the full enrichment pipeline for a graph node: collect from implemented sources,
 * verify, load. Returns a summary.
 */
export async function runEnrichmentPipeline(
  store: GraphStore,
  nodeId: string
): Promise<EnrichmentResult> {
  const node = await store.getNode(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }
  const entityType = node.labels[0] ?? "";
  const displayName = getNodeDisplayName(node);
  const sources = getSourcesForEntityType(entityType, true);
  const adapterIds = [...new Set(sources.map((s) => s.adapterId))];
  const rawPayloads = await collectFromAdapters(adapterIds, entityType, displayName);
  const verified: Array<{ record: NonNullable<Awaited<ReturnType<typeof verifyPayload>>> }> = [];
  for (const raw of rawPayloads) {
    const record = verifyPayload(raw, displayName);
    if (record != null) verified.push({ record });
  }
  const sourcesUsed: string[] = [];
  const confidence: string[] = [];
  let propertiesAdded = 0;
  let nodesCreated = 0;
  let edgesCreated = 0;
  for (const { record } of verified) {
    const loadResult = await loadVerifiedRecord(store, nodeId, record);
    sourcesUsed.push(record.source_name);
    confidence.push(record.confidence);
    propertiesAdded += Object.keys(record.properties).length;
    nodesCreated += loadResult.nodesCreated;
    edgesCreated += loadResult.edgesCreated;
  }
  return {
    nodeId,
    sourcesUsed: [...new Set(sourcesUsed)],
    propertiesAdded,
    confidence,
    nodesCreated,
    edgesCreated,
  };
}
