/**
 * Enrichment source registry: list of source ids and which entity types each can enrich.
 * Used by the enrichment pipeline to select adapters per entity type.
 * See docs/ENRICHMENT_SOURCES.md for full catalog.
 */

export type CollectionMethod = "api" | "scrape" | "bulk" | "web_search";

export interface SourceDefinition {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  method: CollectionMethod;
  /** Entity labels this source can enrich (e.g. Artist, Album, Track). */
  entityTypes: string[];
  /** Adapter identifier; must match a registered adapter. */
  adapterId: string;
}

export function isSourceAutomated(source: Pick<SourceDefinition, "adapterId">): boolean {
  return IMPLEMENTED_ADAPTER_IDS.has(source.adapterId);
}

export function getSourceExecutionMode(source: Pick<SourceDefinition, "adapterId">): "automated" | "curator" {
  return isSourceAutomated(source) ? "automated" : "curator";
}

const SOURCES: SourceDefinition[] = [
  { id: "wikipedia", name: "Wikipedia", type: "Encyclopedic", baseUrl: "https://en.wikipedia.org/", method: "api", entityTypes: ["Artist", "Person", "Album", "Track", "Studio", "Label", "Instrument"], adapterId: "wikipedia" },
  { id: "wikidata", name: "Wikidata", type: "Structured knowledge", baseUrl: "https://www.wikidata.org/", method: "api", entityTypes: ["Artist", "Person", "Album", "Track", "Studio", "Label", "Genre"], adapterId: "wikidata" },
  { id: "discogs", name: "Discogs", type: "Catalog", baseUrl: "https://api.discogs.com/", method: "api", entityTypes: ["Artist", "Album", "Track", "Label", "Person"], adapterId: "discogs" },
  { id: "musicbrainz", name: "MusicBrainz", type: "Open music encyclopedia", baseUrl: "https://musicbrainz.org/", method: "api", entityTypes: ["Artist", "Album", "Track", "Label", "Person", "Studio"], adapterId: "musicbrainz" },
  { id: "spotify", name: "Spotify", type: "Streaming catalog", baseUrl: "https://api.spotify.com/", method: "api", entityTypes: ["Artist", "Album", "Track"], adapterId: "spotify" },
  { id: "lastfm", name: "Last.fm", type: "Listening / tags", baseUrl: "https://www.last.fm/api", method: "api", entityTypes: ["Artist", "Track"], adapterId: "lastfm" },
  { id: "allmusic", name: "AllMusic", type: "Editorial", baseUrl: "https://www.allmusic.com/", method: "scrape", entityTypes: ["Artist", "Album", "Genre"], adapterId: "allmusic" },
  { id: "genius", name: "Genius", type: "Lyrics", baseUrl: "https://genius.com/", method: "api", entityTypes: ["Track", "Artist"], adapterId: "genius" },
  { id: "imdb", name: "IMDb", type: "Film / soundtrack", baseUrl: "https://www.imdb.com/", method: "api", entityTypes: ["Person", "Track"], adapterId: "imdb" },
  { id: "bbc_music", name: "BBC Music", type: "Editorial", baseUrl: "https://www.bbc.co.uk/music", method: "scrape", entityTypes: ["Artist"], adapterId: "bbc_music" },
  { id: "rym", name: "Rate Your Music", type: "Community", baseUrl: "https://rateyourmusic.com/", method: "scrape", entityTypes: ["Artist", "Album", "Genre"], adapterId: "rym" },
  { id: "secondhandsongs", name: "SecondHandSongs", type: "Covers", baseUrl: "https://secondhandsongs.com/", method: "api", entityTypes: ["Track"], adapterId: "secondhandsongs" },
  { id: "setlistfm", name: "Setlist.fm", type: "Live", baseUrl: "https://api.setlist.fm/", method: "api", entityTypes: ["Artist", "Performance", "Venue"], adapterId: "setlistfm" },
  { id: "songkick", name: "Songkick", type: "Concerts", baseUrl: "https://www.songkick.com/", method: "api", entityTypes: ["Artist", "Performance", "Venue"], adapterId: "songkick" },
  { id: "bandcamp", name: "Bandcamp", type: "Artist / label", baseUrl: "https://bandcamp.com/", method: "scrape", entityTypes: ["Artist", "Label", "Album"], adapterId: "bandcamp" },
  { id: "soundcloud", name: "SoundCloud", type: "Artist profiles", baseUrl: "https://soundcloud.com/", method: "api", entityTypes: ["Artist", "Track"], adapterId: "soundcloud" },
  { id: "dahr", name: "DAHR", type: "Historical", baseUrl: "https://adp.library.ucsb.edu/", method: "api", entityTypes: ["Artist", "Track", "Label"], adapterId: "dahr" },
  { id: "riaa", name: "RIAA", type: "Certifications", baseUrl: "https://www.riaa.com/", method: "scrape", entityTypes: ["Album", "Track"], adapterId: "riaa" },
  { id: "grammy", name: "Grammy.com", type: "Awards", baseUrl: "https://www.grammy.com/", method: "scrape", entityTypes: ["Artist", "Album", "Track"], adapterId: "grammy" },
  { id: "web", name: "Official / web", type: "Web", baseUrl: "", method: "web_search", entityTypes: ["Artist", "Person", "Studio", "Equipment"], adapterId: "web" },
  { id: "soundonsound", name: "Sound on Sound", type: "Magazine", baseUrl: "https://www.soundonsound.com/", method: "scrape", entityTypes: ["Studio", "Person", "Equipment", "Track"], adapterId: "soundonsound" },
  { id: "guitarplayer", name: "Guitar Player", type: "Magazine", baseUrl: "https://www.guitarplayer.com/", method: "scrape", entityTypes: ["Artist", "Instrument", "Equipment"], adapterId: "guitarplayer" },
  { id: "musicianmag", name: "Musician Magazine", type: "Magazine (defunct)", baseUrl: "", method: "scrape", entityTypes: ["Artist", "Person", "Equipment"], adapterId: "musicianmag" },
  { id: "mixmag", name: "Mix Magazine", type: "Trade", baseUrl: "https://www.mixonline.com/", method: "scrape", entityTypes: ["Studio", "Person", "Equipment"], adapterId: "mixmag" },
  { id: "recordingmag", name: "Recording Magazine", type: "Trade", baseUrl: "", method: "scrape", entityTypes: ["Equipment"], adapterId: "recordingmag" },
  { id: "keyboardmag", name: "Keyboard Magazine", type: "Magazine (defunct)", baseUrl: "", method: "scrape", entityTypes: ["Instrument", "Equipment", "Artist", "Person"], adapterId: "keyboardmag" },
  { id: "nme", name: "NME", type: "Music press", baseUrl: "https://www.nme.com/", method: "scrape", entityTypes: ["Artist", "Album", "Track", "Label"], adapterId: "nme" },
  { id: "rollingstone", name: "Rolling Stone", type: "Music press", baseUrl: "https://www.rollingstone.com/", method: "scrape", entityTypes: ["Artist", "Album"], adapterId: "rollingstone" },
  { id: "pitchfork", name: "Pitchfork", type: "Music press", baseUrl: "https://pitchfork.com/", method: "scrape", entityTypes: ["Artist", "Album", "Track"], adapterId: "pitchfork" },
  { id: "tapeop", name: "Tape Op", type: "Trade / magazine", baseUrl: "https://tapeop.com/", method: "scrape", entityTypes: ["Person", "Studio", "Equipment"], adapterId: "tapeop" },
];

/**
 * All registered source definitions.
 */
export function getAllSources(): SourceDefinition[] {
  return [...SOURCES];
}

/**
 * Source ids that have an adapter implemented. Expand as adapters are added.
 */
export const IMPLEMENTED_ADAPTER_IDS = new Set(["musicbrainz", "wikipedia"]);
for (const source of SOURCES) {
  IMPLEMENTED_ADAPTER_IDS.add(source.adapterId);
}

/**
 * Get sources that can enrich the given entity type (label).
 * Optionally restrict to implemented adapters only.
 */
export function getSourcesForEntityType(
  entityType: string,
  implementedOnly: boolean = false
): SourceDefinition[] {
  const filtered = SOURCES.filter((s) =>
    s.entityTypes.some((t) => t.toLowerCase() === entityType.toLowerCase())
  );
  if (implementedOnly) {
    return filtered.filter((s) => IMPLEMENTED_ADAPTER_IDS.has(s.adapterId));
  }
  return filtered;
}
