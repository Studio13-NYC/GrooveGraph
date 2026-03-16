import type { SourceDefinition } from "../sources/registry";
import type { SourceRuntimeRoute } from "../types";

const KEYED_API_ENV_VARS: Record<string, string[]> = {
  discogs: ["DISCOGS_ACCESS_TOKEN"],
  spotify: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"],
  lastfm: ["LASTFM_API_KEY"],
  genius: ["GENIUS_ACCESS_TOKEN"],
  setlistfm: ["SETLISTFM_API_KEY"],
  soundcloud: ["SOUNDCLOUD_CLIENT_ID", "SOUNDCLOUD_CLIENT_SECRET"],
};

const KEYLESS_CONCRETE_API_SOURCES = new Set(["musicbrainz", "wikipedia", "wikidata", "secondhandsongs"]);

export function getRequiredApiEnvVars(adapterId: string): string[] {
  return [...(KEYED_API_ENV_VARS[adapterId] ?? [])];
}

export function getMissingApiEnvVars(adapterId: string): string[] {
  return getRequiredApiEnvVars(adapterId).filter((key) => !process.env[key]?.trim());
}

export function usesConcreteApiWithoutKey(adapterId: string): boolean {
  return KEYLESS_CONCRETE_API_SOURCES.has(adapterId);
}

export function canUseConcreteApi(source: Pick<SourceDefinition, "adapterId">): boolean {
  if (usesConcreteApiWithoutKey(source.adapterId)) {
    return true;
  }
  return getMissingApiEnvVars(source.adapterId).length === 0 && getRequiredApiEnvVars(source.adapterId).length > 0;
}

export function getEffectiveSourceRoute(source: Pick<SourceDefinition, "adapterId">): SourceRuntimeRoute {
  return canUseConcreteApi(source) ? "api" : "firecrawl";
}
