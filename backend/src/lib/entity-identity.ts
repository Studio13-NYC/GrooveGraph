import { isEntityLabel, type EntityLabel } from "./entity-config";

const RESERVED_GRAPH_LABELS = new Set(["GraphEntity", "EntityType"]);

export function getSearchLabelsForEntityType(entityType: string): string[] {
  if (entityType === "Band") {
    // Transitional compatibility while Neo4j data cleanup migrates Artist -> Band.
    return ["Band", "Artist"];
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
  if (normalized.includes("Band")) return "Band";
  if (normalized.includes("Artist")) return "Band";
  if (normalized.includes("Person")) return "Person";

  const firstKnown = normalized.find((label): label is EntityLabel => isEntityLabel(label));
  if (firstKnown) return firstKnown;

  return normalized[0] ?? "Node";
}

export function coerceArtistPersonIdentity(labels: string[]): string[] {
  // Keep legacy function name for compatibility; no forced dual-label coercion.
  return normalizeEntityLabels(labels);
}
