import { GraphEdge } from "../domain/GraphEdge.js";
import { GraphNode } from "../domain/GraphNode.js";
import type { GraphStore } from "../store/types.js";
import { getEntityDisplayName, isEntityLabel } from "./entity-config.js";
import { getGraphEntityLabels } from "./entity-identity.js";

export const ENTITY_TYPE_NODE_LABEL = "EntityType";
export const IS_A_RELATIONSHIP_TYPE = "IS_A";

class TypeHubNode extends GraphNode {}
class TypeHubEdge extends GraphEdge {}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isTypeHubLabel(label: string): boolean {
  return label === ENTITY_TYPE_NODE_LABEL;
}

export function isTypeHubNodeLabels(labels: string[]): boolean {
  return labels.includes(ENTITY_TYPE_NODE_LABEL);
}

export function getTypeHubNodeId(entityLabel: string): string {
  return `entity-type-${slugify(getEntityDisplayName(entityLabel))}`;
}

export function getTypeHubEdgeId(nodeId: string, entityLabel: string): string {
  return `is-a-${nodeId}-${slugify(entityLabel)}`;
}

export function getTypeHubNodeName(entityLabel: string): string {
  return getEntityDisplayName(entityLabel);
}

export function getTypeHubEntityLabels(labels: string[]): string[] {
  return getGraphEntityLabels(labels).filter((label) => isEntityLabel(label));
}

export async function ensureTypeHubNode(store: GraphStore, entityLabel: string): Promise<void> {
  const hubId = getTypeHubNodeId(entityLabel);
  const existing = await store.getNode(hubId);
  if (existing) {
    return;
  }

  await store.createNode(
    new TypeHubNode(
      hubId,
      [ENTITY_TYPE_NODE_LABEL],
      {
        name: getTypeHubNodeName(entityLabel),
        entityLabel,
      },
      {
        synthetic: true,
      }
    )
  );
}

export async function reconcileTypeHubLinksForNode(store: GraphStore, nodeId: string): Promise<void> {
  const node = await store.getNode(nodeId);
  if (!node || isTypeHubNodeLabels(node.labels)) {
    return;
  }

  const desiredLabels = new Set(getTypeHubEntityLabels(node.labels));
  const existingEdges = await store.findEdges({
    type: IS_A_RELATIONSHIP_TYPE,
    fromNodeId: nodeId,
    maxResults: 100,
  });

  for (const label of desiredLabels) {
    await ensureTypeHubNode(store, label);
    const hubNodeId = getTypeHubNodeId(label);
    const existing = existingEdges.find((edge) => edge.toNodeId === hubNodeId);
    if (!existing) {
      await store.createEdge(
        new TypeHubEdge(getTypeHubEdgeId(nodeId, label), IS_A_RELATIONSHIP_TYPE, nodeId, hubNodeId, {
          entityLabel: label,
        })
      );
    }
  }

  for (const edge of existingEdges) {
    const edgeLabel = typeof edge.properties.entityLabel === "string" ? edge.properties.entityLabel : undefined;
    const shouldKeep =
      edge.toNodeId.startsWith("entity-type-") &&
      edgeLabel &&
      desiredLabels.has(edgeLabel);
    if (!shouldKeep) {
      await store.deleteEdge(edge.id);
    }
  }
}

export async function reconcileAllTypeHubLinks(store: GraphStore): Promise<void> {
  const allNodes = await store.findNodes({ maxResults: 100000 });
  for (const node of allNodes) {
    if (isTypeHubNodeLabels(node.labels)) continue;
    await reconcileTypeHubLinksForNode(store, node.id);
  }
}
