import { randomUUID } from "node:crypto";

import { GraphNode } from "../domain/GraphNode.js";
import type { GraphStore } from "../store/types.js";
import { getEntityDisplayPropertyKeys } from "./entity-config.js";
import { coerceArtistPersonIdentity, normalizeEntityLabels } from "./entity-identity.js";

class MutableGraphNode extends GraphNode {}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildStubEntityId(label: string, name: string): string {
  return `manual-${slugify(label)}-${slugify(name).slice(0, 40)}-${randomUUID().slice(0, 8)}`;
}

export async function createStubEntity(
  store: GraphStore,
  input: {
    label: string;
    name: string;
    id?: string;
  }
): Promise<{ id: string; label: string; name: string }> {
  const labels =
    input.label === "Artist" || input.label === "Person"
      ? coerceArtistPersonIdentity([input.label])
      : normalizeEntityLabels([input.label]);
  const primaryPropertyKey = getEntityDisplayPropertyKeys(input.label)[0] ?? "name";
  const properties: Record<string, unknown> = {
    [primaryPropertyKey]: input.name,
  };
  if (primaryPropertyKey !== "name") {
    properties.name = input.name;
  }

  const nodeId = input.id?.trim() || buildStubEntityId(input.label, input.name);
  await store.createNode(
    new MutableGraphNode(nodeId, labels, properties, {
      created_by: "enrichment_stub",
    })
  );
  return {
    id: nodeId,
    label: input.label,
    name: input.name,
  };
}
