import type { GraphEdge } from "../domain/GraphEdge.js";
import type { GraphNode } from "../domain/GraphNode.js";
import { Neo4jGraphStore } from "../store/Neo4jGraphStore.js";
import type { GraphStore } from "../store/types.js";
import {
  getEntityDisplayName,
  getEntityDisplayPropertyKeys,
  getNodeDisplayName,
} from "./entity-config.js";
import type {
  GraphLinkPayload,
  GraphNodePayload,
  PropertyFact,
  QueryResultPayload,
  RelatedEntityPreview,
} from "./exploration-types.js";

const FACT_LABELS: Record<string, string> = {
  country: "Country",
  active_years: "Active years",
  biography: "Biography",
  genres: "Genres",
  role: "Role",
  brand: "Brand",
  model: "Model",
  year: "Year",
  city: "City",
  founded: "Founded",
  venue: "Venue",
};

function normalizeFactValue(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const parts = value.map((item) => String(item).trim()).filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  if (typeof value === "string") {
    return value.trim() || null;
  }
  return String(value);
}

function formatFactLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function compareDisplayNames(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base" });
}

export function toGraphNodePayload(node: GraphNode): GraphNodePayload {
  const label = node.labels[0] ?? "Node";
  const payload: GraphNodePayload = {
    id: node.id,
    label,
    name: getNodeDisplayName(node),
  };
  const biography = normalizeFactValue(node.properties.biography);
  const country = normalizeFactValue(node.properties.country);
  const activeYears = normalizeFactValue(node.properties.active_years);
  if (biography) payload.biography = biography;
  if (country) payload.country = country;
  if (activeYears) payload.active_years = activeYears;
  if (typeof node.meta?.enrichment_source === "string") {
    payload.enrichment_source = node.meta.enrichment_source;
  }
  return payload;
}

export function toGraphLinkPayload(edge: GraphEdge): GraphLinkPayload {
  return {
    source: edge.fromNodeId,
    target: edge.toNodeId,
    type: edge.type,
  };
}

export async function resolveEntityNode(
  store: GraphStore,
  entityType: string,
  query: string
): Promise<GraphNode | null> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return null;

  if (store instanceof Neo4jGraphStore) {
    return store.findBestNodeMatch(entityType, trimmedQuery);
  }

  const propertyKeys = getEntityDisplayPropertyKeys(entityType);
  for (const propertyKey of propertyKeys) {
    const exact = await store.findNodes({
      label: entityType,
      propertyKey,
      propertyValue: trimmedQuery,
      maxResults: 1,
    });
    if (exact.length > 0) {
      return exact[0];
    }
  }

  const all = await store.findNodes({ label: entityType, maxResults: 20000 });
  const lowerQuery = trimmedQuery.toLowerCase();
  const exactFallback = all.find((node) =>
    propertyKeys.some((key) => String(node.properties[key] ?? "").toLowerCase() === lowerQuery)
  );
  if (exactFallback) return exactFallback;

  const partialMatches = all
    .filter((node) =>
      propertyKeys.some((key) => String(node.properties[key] ?? "").toLowerCase().includes(lowerQuery))
    )
    .sort((a, b) => compareDisplayNames(getNodeDisplayName(a), getNodeDisplayName(b)));

  return partialMatches[0] ?? null;
}

export async function collectNodeNeighborhood(
  store: GraphStore,
  seedNodeId: string,
  maxDepth = 2,
  maxNodes = 120
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const seedNode = await store.getNode(seedNodeId);
  if (!seedNode) {
    return { nodes: [], edges: [] };
  }

  const nodes = new Map<string, GraphNode>([[seedNode.id, seedNode]]);
  const edges = new Map<string, GraphEdge>();
  const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: seedNode.id, depth: 0 }];
  const visited = new Set<string>();

  while (queue.length > 0 && nodes.size <= maxNodes) {
    const current = queue.shift();
    if (!current || visited.has(current.nodeId)) continue;
    visited.add(current.nodeId);

    const adjacentEdges = await store.getAdjacentEdges(current.nodeId, "both");
    for (const edge of adjacentEdges) {
      edges.set(edge.id, edge);
      for (const nextNodeId of [edge.fromNodeId, edge.toNodeId]) {
        if (!nodes.has(nextNodeId)) {
          const nextNode = await store.getNode(nextNodeId);
          if (nextNode) {
            nodes.set(nextNodeId, nextNode);
          }
        }
        if (current.depth < maxDepth && !visited.has(nextNodeId) && nodes.size <= maxNodes) {
          queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
        }
      }
    }
  }

  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  };
}

function buildPropertyFacts(node: GraphNode): PropertyFact[] {
  const displayKeys = getEntityDisplayPropertyKeys(node.labels[0] ?? "");
  const priorityKeys = [
    "country",
    "active_years",
    "genres",
    "role",
    "brand",
    "model",
    "year",
    "city",
    "founded",
    "venue",
    "biography",
  ];
  const uniqueKeys = [...new Set(priorityKeys)].filter(
    (key) => key in node.properties && !displayKeys.includes(key)
  );
  return uniqueKeys
    .map((key) => {
      const value = normalizeFactValue(node.properties[key]);
      if (!value) return null;
      return {
        key,
        label: FACT_LABELS[key] ?? formatFactLabel(key),
        value,
      };
    })
    .filter((fact): fact is PropertyFact => fact !== null)
    .slice(0, 6);
}

export async function buildQueryResultPayload(
  store: GraphStore,
  node: GraphNode,
  query: string
): Promise<QueryResultPayload> {
  const adjacentEdges = await store.getAdjacentEdges(node.id, "both");
  const relationshipCounts = new Map<string, number>();
  const relatedEntityCounts = new Map<string, number>();
  const relatedItems: RelatedEntityPreview[] = [];
  const seenRelated = new Set<string>();
  const previewItems =
    store instanceof Neo4jGraphStore ? await store.getNodePreview(node.id) : null;

  if (previewItems) {
    for (const item of previewItems) {
      relationshipCounts.set(item.relationshipType, (relationshipCounts.get(item.relationshipType) ?? 0) + 1);
      relatedEntityCounts.set(item.label, (relatedEntityCounts.get(item.label) ?? 0) + 1);
      if (seenRelated.has(item.id)) continue;
      seenRelated.add(item.id);
      relatedItems.push(item);
    }
  } else {
    for (const edge of adjacentEdges) {
      relationshipCounts.set(edge.type, (relationshipCounts.get(edge.type) ?? 0) + 1);
      const isOutbound = edge.fromNodeId === node.id;
      const relatedNodeId = isOutbound ? edge.toNodeId : edge.fromNodeId;
      const relatedNode = await store.getNode(relatedNodeId);
      if (!relatedNode) continue;
      const relatedLabel = relatedNode.labels[0] ?? "Node";
      relatedEntityCounts.set(relatedLabel, (relatedEntityCounts.get(relatedLabel) ?? 0) + 1);
      if (seenRelated.has(relatedNode.id)) continue;
      seenRelated.add(relatedNode.id);
      relatedItems.push({
        id: relatedNode.id,
        label: relatedLabel,
        name: getNodeDisplayName(relatedNode),
        relationshipType: edge.type,
        direction: isOutbound ? "outbound" : "inbound",
      });
    }
  }

  relatedItems.sort((a, b) => compareDisplayNames(a.name, b.name));
  const relatedEntitySummaries = [...relatedEntityCounts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || compareDisplayNames(a.key, b.key));
  const relationshipSummaries = [...relationshipCounts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || compareDisplayNames(a.key, b.key));

  const sourceBadges = [
    ...(typeof node.meta?.enrichment_source === "string" ? [node.meta.enrichment_source] : []),
    ...(typeof node.meta?.enrichment_confidence === "string" ? [node.meta.enrichment_confidence] : []),
  ];

  return {
    id: node.id,
    entityType: node.labels[0] ?? "Node",
    name: getNodeDisplayName(node),
    query,
    summary:
      adjacentEdges.length > 0
        ? `${getNodeDisplayName(node)} connects to ${adjacentEdges.length} relationship${adjacentEdges.length === 1 ? "" : "s"} across ${relatedEntitySummaries.length} entity type${relatedEntitySummaries.length === 1 ? "" : "s"}.`
        : `${getNodeDisplayName(node)} is in the graph but currently has no connected relationships.`,
    sourceBadges: [...new Set(sourceBadges)],
    relatedEntityCounts: relatedEntitySummaries,
    relationshipCounts: relationshipSummaries,
    relatedItems: relatedItems.slice(0, 12),
    propertyFacts: buildPropertyFacts(node),
  };
}
