import { isEntityLabel, type EntityLabel } from "./entity-config.js";

const RESERVED_GRAPH_LABELS = new Set(["GraphEntity", "EntityType"]);
const DUAL_IDENTITY_LABELS = new Set<EntityLabel>(["Artist", "Person"]);

export function getSearchLabelsForEntityType(entityType: string): string[] {
  if (entityType === "Artist" || entityType === "Person") {
    return ["Artist", "Person"];
  }
  return [entityType];
}

export function normalizeEntityLabels(labels: string[]): string[] {
  return [...new Set(labels.filter(Boolean))];
}

export function getGraphEntityLabels(labels: string[]): string[] {
  return normalizeEntityLabels(labels).filter((label) => !RESERVED_GRAPH_LABELS.has(label));
}

export function getPrimaryEntityLabel(labels: string[]): string {
  const normalized = getGraphEntityLabels(labels);
  if (normalized.includes("Artist")) return "Artist";
  if (normalized.includes("Person")) return "Person";

  const firstKnown = normalized.find((label): label is EntityLabel => isEntityLabel(label));
  if (firstKnown) return firstKnown;

  return normalized[0] ?? "Node";
}

export function isDualIdentityLabel(label: string): label is EntityLabel {
  return DUAL_IDENTITY_LABELS.has(label as EntityLabel);
}

export function coerceArtistPersonIdentity(labels: string[]): string[] {
  const next = normalizeEntityLabels(labels);
  if (next.includes("Artist") || next.includes("Person")) {
    if (!next.includes("Artist")) next.push("Artist");
    if (!next.includes("Person")) next.push("Person");
  }
  return next;
}
