import type { RawEnrichmentPayload } from "../types.js";
import type { SourceRuntimeRoute } from "../types.js";
import type { SourceDefinition } from "../sources/registry.js";
import { fetchGenericSourceByName } from "./generic-source.js";
import { fetchArtistByName } from "./musicbrainz.js";
import {
  fetchDiscogsByApi,
  fetchGeniusByApi,
  fetchLastfmByApi,
  fetchSecondHandSongsByApi,
  fetchSetlistFmByApi,
  fetchSoundCloudByApi,
  fetchSpotifyByApi,
} from "./official-api.js";
import { getEffectiveSourceRoute } from "./source-access.js";
import { fetchSummaryByName } from "./wikipedia.js";
import { fetchWikidataByName } from "./wikidata.js";

export interface AdapterExecutionContext {
  source: SourceDefinition;
  entityType: string;
  displayName: string;
  targetNodeId: string;
}

export interface AdapterExecutionResult {
  sourceId: string;
  payloads: RawEnrichmentPayload[];
  attempted: boolean;
  route: SourceRuntimeRoute;
}

export async function executeSourceAdapter(
  context: AdapterExecutionContext
): Promise<AdapterExecutionResult> {
  const { source, entityType, displayName, targetNodeId } = context;
  const route = getEffectiveSourceRoute(source);
  try {
    let payloads: RawEnrichmentPayload[] = [];
    if (route === "firecrawl") {
      payloads = await fetchGenericSourceByName(source, displayName, entityType);
    } else if (source.adapterId === "musicbrainz") {
      payloads = await fetchArtistByName(displayName, targetNodeId);
    } else if (source.adapterId === "wikipedia") {
      payloads = await fetchSummaryByName(displayName);
    } else if (source.adapterId === "wikidata") {
      payloads = await fetchWikidataByName(source, displayName, entityType, targetNodeId);
    } else if (source.adapterId === "discogs") {
      payloads = await fetchDiscogsByApi(source, displayName, entityType);
    } else if (source.adapterId === "spotify") {
      payloads = await fetchSpotifyByApi(source, displayName, entityType);
    } else if (source.adapterId === "lastfm") {
      payloads = await fetchLastfmByApi(source, displayName, entityType);
    } else if (source.adapterId === "genius") {
      payloads = await fetchGeniusByApi(source, displayName, entityType);
    } else if (source.adapterId === "secondhandsongs") {
      payloads = await fetchSecondHandSongsByApi(source, displayName, entityType);
    } else if (source.adapterId === "setlistfm") {
      payloads = await fetchSetlistFmByApi(source, displayName, entityType);
    } else if (source.adapterId === "soundcloud") {
      payloads = await fetchSoundCloudByApi(source, displayName, entityType);
    } else if (source.adapterId === "songkick") {
      payloads = await fetchGenericSourceByName(source, displayName, entityType);
    } else {
      payloads = await fetchGenericSourceByName(source, displayName, entityType);
    }
    return {
      sourceId: source.id,
      payloads,
      attempted: true,
      route,
    };
  } catch (error) {
    console.error(`enrichment adapter ${source.adapterId} failed:`, error);
    return {
      sourceId: source.id,
      payloads: [],
      attempted: true,
      route,
    };
  }
}
