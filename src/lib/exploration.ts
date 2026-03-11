import type { GraphEdge } from "../domain/GraphEdge.js";
import type { GraphNode } from "../domain/GraphNode.js";
import { Neo4jGraphStore } from "../store/Neo4jGraphStore.js";
import type { GraphStore } from "../store/types.js";
import {
  getPrimaryEntityLabel,
  getSearchLabelsForEntityType,
} from "./entity-identity.js";
import {
  getEntityDisplayName,
  getEntityDisplayPropertyKeys,
  getNodeDisplayName,
} from "./entity-config.js";
import type {
  GraphPayload,
  GraphLinkPayload,
  GraphNodePayload,
  PropertyFact,
  QueryResultPayload,
  RelatedEntityPreview,
} from "./exploration-types.js";
import {
  getTypeHubNodeId,
  IS_A_RELATIONSHIP_TYPE,
  isTypeHubNodeLabels,
} from "./type-hubs.js";

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

function getRelatedItemPriority(item: RelatedEntityPreview): number {
  if (item.relationshipType === "MEMBER_OF") return 0;
  if (item.label === "Person") return 1;
  if (item.relationshipType === "COLLABORATED_WITH") return 2;
  return 3;
}

type DirectRelation = {
  edge: GraphEdge;
  relatedNode: GraphNode;
  direction: "inbound" | "outbound";
};

type IdentityCluster = {
  canonicalNode: GraphNode;
  aliasNodes: GraphNode[];
  mergedLabels: string[];
};

function isMeaningfulRelationship(edge: GraphEdge): boolean {
  return edge.type !== IS_A_RELATIONSHIP_TYPE;
}

function canHaveIdentityAliases(node: GraphNode): boolean {
  const primaryLabel = getPrimaryEntityLabel(node.labels);
  return primaryLabel === "Artist" || primaryLabel === "Person";
}

async function getNodeDegree(store: GraphStore, nodeId: string): Promise<number> {
  return (await store.getAdjacentEdges(nodeId, "both")).length;
}

async function collectIdentityCluster(store: GraphStore, seedNode: GraphNode): Promise<IdentityCluster> {
  if (!canHaveIdentityAliases(seedNode)) {
    return {
      canonicalNode: seedNode,
      aliasNodes: [seedNode],
      mergedLabels: [...seedNode.labels],
    };
  }

  const displayName = String(seedNode.properties.name ?? getNodeDisplayName(seedNode)).trim();
  if (!displayName) {
    return {
      canonicalNode: seedNode,
      aliasNodes: [seedNode],
      mergedLabels: [...seedNode.labels],
    };
  }

  const aliasCandidates = Array.from(
    new Map(
      (
        await Promise.all(
          ["Artist", "Person"].map((label) =>
            store.findNodes({
              label,
              propertyKey: "name",
              propertyValue: displayName,
              maxResults: 20,
            })
          )
        )
      )
        .flat()
        .map((node) => [node.id, node])
    ).values()
  );

  if (aliasCandidates.length === 0) {
    return {
      canonicalNode: seedNode,
      aliasNodes: [seedNode],
      mergedLabels: [...seedNode.labels],
    };
  }

  const ranked = await Promise.all(
    aliasCandidates.map(async (node) => ({
      node,
      degree: await getNodeDegree(store, node.id),
      preferred: node.id === seedNode.id ? 1 : 0,
      labelRank: node.labels.includes("Artist") ? 1 : 0,
    }))
  );
  ranked.sort(
    (left, right) =>
      right.degree - left.degree ||
      right.labelRank - left.labelRank ||
      right.preferred - left.preferred ||
      left.node.id.localeCompare(right.node.id)
  );
  const canonicalNode = ranked[0]?.node ?? seedNode;
  const aliasNodes = ranked.map((item) => item.node);
  const mergedLabels = [...new Set(aliasNodes.flatMap((node) => node.labels))];

  return {
    canonicalNode,
    aliasNodes,
    mergedLabels,
  };
}

function summarizeRelationshipTypes(types: Iterable<string>): { label: string; count: number } {
  const values = [...new Set([...types].filter(Boolean))];
  if (values.length === 0) {
    return { label: "RELATED_TO", count: 0 };
  }
  if (values.length === 1) {
    return { label: values[0], count: 1 };
  }
  return { label: `${values[0]} +${values.length - 1}`, count: values.length };
}

export function toGraphNodePayload(
  node: GraphNode,
  extra: Partial<GraphNodePayload> = {}
): GraphNodePayload {
  const label = getPrimaryEntityLabel(node.labels);
  const payload: GraphNodePayload = {
    id: node.id,
    label,
    name: getNodeDisplayName(node),
    labels: [...node.labels],
    entityLabel: label,
    ...extra,
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
    const matchedNode = await store.findBestNodeMatch(entityType, trimmedQuery);
    if (!matchedNode) return null;
    return (await collectIdentityCluster(store, matchedNode)).canonicalNode;
  }

  const searchLabels = getSearchLabelsForEntityType(entityType);
  const propertyKeys = [...new Set(searchLabels.flatMap((label) => getEntityDisplayPropertyKeys(label)))];
  for (const propertyKey of propertyKeys) {
    for (const label of searchLabels) {
      const exact = await store.findNodes({
        label,
        propertyKey,
        propertyValue: trimmedQuery,
        maxResults: 1,
      });
      if (exact.length > 0) {
        return exact[0];
      }
    }
  }

  const all = Array.from(
    new Map(
      (
        await Promise.all(searchLabels.map((label) => store.findNodes({ label, maxResults: 20000 })))
      )
        .flat()
        .map((node) => [node.id, node])
    ).values()
  );
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
  const bestMatch = partialMatches[0] ?? null;
  if (!bestMatch) return null;
  return (await collectIdentityCluster(store, bestMatch)).canonicalNode;
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
  const displayKeys = getEntityDisplayPropertyKeys(getPrimaryEntityLabel(node.labels));
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

async function getDirectRelations(store: GraphStore, node: GraphNode): Promise<DirectRelation[]> {
  const cluster = await collectIdentityCluster(store, node);
  const relations: DirectRelation[] = [];
  const seen = new Set<string>();

  for (const aliasNode of cluster.aliasNodes) {
    const adjacentEdges = await store.getAdjacentEdges(aliasNode.id, "both");
    for (const edge of adjacentEdges) {
      if (!isMeaningfulRelationship(edge)) continue;
      const isOutbound = edge.fromNodeId === aliasNode.id;
      const relatedNodeId = isOutbound ? edge.toNodeId : edge.fromNodeId;
      if (cluster.aliasNodes.some((candidate) => candidate.id === relatedNodeId)) {
        continue;
      }
      const relatedNode = await store.getNode(relatedNodeId);
      if (!relatedNode || isTypeHubNodeLabels(relatedNode.labels)) continue;
      const relationKey = `${edge.type}:${relatedNode.id}:${isOutbound ? "out" : "in"}`;
      if (seen.has(relationKey)) continue;
      seen.add(relationKey);
      relations.push({
        edge,
        relatedNode,
        direction: isOutbound ? "outbound" : "inbound",
      });
    }
  }

  return relations;
}

export async function buildQueryResultPayload(
  store: GraphStore,
  node: GraphNode,
  query: string
): Promise<QueryResultPayload> {
  const cluster = await collectIdentityCluster(store, node);
  const directRelations = await getDirectRelations(store, node);
  const relationshipCounts = new Map<string, number>();
  const relatedEntityCounts = new Map<string, Set<string>>();
  const relatedItems: RelatedEntityPreview[] = [];
  const seenRelated = new Set<string>();

  for (const relation of directRelations) {
    relationshipCounts.set(
      relation.edge.type,
      (relationshipCounts.get(relation.edge.type) ?? 0) + 1
    );
    const relatedLabel = getPrimaryEntityLabel(relation.relatedNode.labels);
    const bucket = relatedEntityCounts.get(relatedLabel) ?? new Set<string>();
    bucket.add(relation.relatedNode.id);
    relatedEntityCounts.set(relatedLabel, bucket);
    if (seenRelated.has(relation.relatedNode.id)) continue;
    seenRelated.add(relation.relatedNode.id);
    relatedItems.push({
      id: relation.relatedNode.id,
      label: relatedLabel,
      name: getNodeDisplayName(relation.relatedNode),
      relationshipType: relation.edge.type,
      direction: relation.direction,
    });
  }

  relatedItems.sort((a, b) => {
    const priorityDiff = getRelatedItemPriority(a) - getRelatedItemPriority(b);
    if (priorityDiff !== 0) return priorityDiff;
    return compareDisplayNames(a.name, b.name);
  });
  const relatedEntitySummaries = [...relatedEntityCounts.entries()]
    .map(([key, ids]) => ({ key, count: ids.size }))
    .sort((a, b) => b.count - a.count || compareDisplayNames(a.key, b.key));
  const relationshipSummaries = [...relationshipCounts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || compareDisplayNames(a.key, b.key));

  const sourceBadges = [
    ...cluster.aliasNodes.flatMap((aliasNode) =>
      [
        ...(typeof aliasNode.meta?.enrichment_source === "string" ? [aliasNode.meta.enrichment_source] : []),
        ...(typeof aliasNode.meta?.enrichment_confidence === "string" ? [aliasNode.meta.enrichment_confidence] : []),
      ]
    ),
  ];

  return {
    id: cluster.canonicalNode.id,
    entityType: getPrimaryEntityLabel(cluster.mergedLabels),
    labels: cluster.mergedLabels,
    name: getNodeDisplayName(cluster.canonicalNode),
    query,
    summary:
      directRelations.length > 0
        ? `${getNodeDisplayName(cluster.canonicalNode)} connects to ${directRelations.length} relationship${directRelations.length === 1 ? "" : "s"} across ${relatedEntitySummaries.length} entity type${relatedEntitySummaries.length === 1 ? "" : "s"}.`
        : `${getNodeDisplayName(cluster.canonicalNode)} is in the graph but currently has no connected relationships.`,
    sourceBadges: [...new Set(sourceBadges)],
    relatedEntityCounts: relatedEntitySummaries,
    relationshipCounts: relationshipSummaries,
    relatedItems: relatedItems.slice(0, 12),
    propertyFacts: buildPropertyFacts(cluster.canonicalNode),
  };
}

export async function buildExplorationGraphPayload(
  store: GraphStore,
  focusNode: GraphNode
): Promise<GraphPayload> {
  const cluster = await collectIdentityCluster(store, focusNode);
  const directRelations = await getDirectRelations(store, focusNode);
  const focusLabel = getPrimaryEntityLabel(cluster.mergedLabels);
  const nodes = new Map<string, GraphNodePayload>();
  const links = new Map<string, GraphLinkPayload>();

  nodes.set(
    cluster.canonicalNode.id,
    toGraphNodePayload(cluster.canonicalNode, {
      nodeKind: "focus",
      entityLabel: focusLabel,
      labels: cluster.mergedLabels,
    })
  );

  const grouped = new Map<
    string,
    {
      relatedNodes: Map<string, GraphNode>;
      relationTypesByNodeId: Map<string, Set<string>>;
    }
  >();

  for (const relation of directRelations) {
    const relatedLabel = getPrimaryEntityLabel(relation.relatedNode.labels);
    const group = grouped.get(relatedLabel) ?? {
      relatedNodes: new Map<string, GraphNode>(),
      relationTypesByNodeId: new Map<string, Set<string>>(),
    };
    group.relatedNodes.set(relation.relatedNode.id, relation.relatedNode);
    const relationTypes = group.relationTypesByNodeId.get(relation.relatedNode.id) ?? new Set<string>();
    relationTypes.add(relation.edge.type);
    group.relationTypesByNodeId.set(relation.relatedNode.id, relationTypes);
    grouped.set(relatedLabel, group);
  }

  const orderedGroups = [...grouped.entries()].sort(
    ([leftLabel, left], [rightLabel, right]) =>
      right.relatedNodes.size - left.relatedNodes.size || compareDisplayNames(leftLabel, rightLabel)
  );

  for (const [relatedLabel, group] of orderedGroups) {
    const typeNodeId = getTypeHubNodeId(relatedLabel);
    nodes.set(typeNodeId, {
      id: typeNodeId,
      label: "EntityType",
      name: getEntityDisplayName(relatedLabel),
      labels: ["EntityType"],
      nodeKind: "type_hub",
      entityLabel: relatedLabel,
      groupKey: relatedLabel,
      relatedCount: group.relatedNodes.size,
    });
    links.set(`focus-type-${cluster.canonicalNode.id}-${relatedLabel}`, {
      source: cluster.canonicalNode.id,
      target: typeNodeId,
      type: "RELATED_TYPE",
      groupKey: relatedLabel,
      relationshipCount: group.relatedNodes.size,
      isSynthetic: true,
    });

    for (const relatedNode of group.relatedNodes.values()) {
      nodes.set(
        relatedNode.id,
        toGraphNodePayload(relatedNode, {
          nodeKind: "entity",
          entityLabel: relatedLabel,
          groupKey: relatedLabel,
          hiddenByDefault: true,
        })
      );
      const relationSummary = summarizeRelationshipTypes(
        group.relationTypesByNodeId.get(relatedNode.id) ?? []
      );
      links.set(`focus-entity-${cluster.canonicalNode.id}-${relatedNode.id}`, {
        source: cluster.canonicalNode.id,
        target: relatedNode.id,
        type: relationSummary.label,
        groupKey: relatedLabel,
        relationshipCount: relationSummary.count,
        hiddenByDefault: true,
      });
      links.set(`entity-type-${relatedNode.id}-${relatedLabel}`, {
        source: relatedNode.id,
        target: typeNodeId,
        type: IS_A_RELATIONSHIP_TYPE,
        groupKey: relatedLabel,
        hiddenByDefault: true,
        isSynthetic: true,
      });
    }
  }

  return {
    nodes: [...nodes.values()],
    links: [...links.values()],
    focusNodeId: cluster.canonicalNode.id,
  };
}
