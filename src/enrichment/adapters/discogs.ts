import type { RawEnrichmentPayload } from "../types.js";
import type { SourceDefinition } from "../sources/registry.js";
import { fetchGenericSourceByName } from "./generic-source.js";

export async function fetchDiscogsByName(
  source: SourceDefinition,
  displayName: string,
  entityType: string
): Promise<RawEnrichmentPayload[]> {
  return fetchGenericSourceByName(source, displayName, entityType);
}
