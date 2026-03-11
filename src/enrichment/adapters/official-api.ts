import type { RawEnrichmentPayload } from "../types.js";
import type { SourceDefinition } from "../sources/registry.js";
import {
  buildNarrativePayload,
  fetchJson,
  normalizeWhitespace,
  stripHtml,
} from "./shared.js";

let spotifyAccessTokenCache: { token: string; expiresAt: number } | null = null;
let soundCloudAccessTokenCache: { token: string; expiresAt: number } | null = null;

function firstDefinedString(...values: Array<string | undefined | null>): string | undefined {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

function summarizeList(values: Array<string | undefined>, prefix: string): string | undefined {
  const cleaned = [...new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim()))];
  return cleaned.length > 0 ? `${prefix}: ${cleaned.join(", ")}` : undefined;
}

async function getSpotifyAccessToken(): Promise<string | null> {
  if (spotifyAccessTokenCache && spotifyAccessTokenCache.expiresAt > Date.now() + 10_000) {
    return spotifyAccessTokenCache.token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) return null;

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;

  spotifyAccessTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return spotifyAccessTokenCache.token;
}

async function getSoundCloudAccessToken(): Promise<string | null> {
  if (soundCloudAccessTokenCache && soundCloudAccessTokenCache.expiresAt > Date.now() + 10_000) {
    return soundCloudAccessTokenCache.token;
  }

  const clientId = process.env.SOUNDCLOUD_CLIENT_ID?.trim();
  const clientSecret = process.env.SOUNDCLOUD_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const response = await fetch("https://secure.soundcloud.com/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
  });
  if (!response.ok) return null;

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;

  soundCloudAccessTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return soundCloudAccessTokenCache.token;
}

export async function fetchDiscogsByApi(
  source: SourceDefinition,
  displayName: string,
  entityType: string
): Promise<RawEnrichmentPayload[]> {
  const token = process.env.DISCOGS_ACCESS_TOKEN?.trim();
  if (!token || !displayName.trim()) return [];

  const type =
    entityType === "Label" ? "label" : entityType === "Album" || entityType === "Track" ? "release" : "artist";
  const search = await fetchJson<{ results?: Array<Record<string, unknown>> }>(
    `https://api.discogs.com/database/search?q=${encodeURIComponent(displayName.trim())}&type=${type}&per_page=1`,
    {
      headers: {
        Authorization: `Discogs token=${token}`,
      },
    }
  );
  const result = search?.results?.[0];
  if (!result) return [];

  const detailUrl = typeof result.resource_url === "string" ? result.resource_url : undefined;
  const detail = detailUrl
    ? await fetchJson<Record<string, unknown>>(detailUrl, {
        headers: {
          Authorization: `Discogs token=${token}`,
        },
      })
    : null;

  const genres = Array.isArray(detail?.genres) ? detail.genres.map((value) => String(value)) : [];
  const styles = Array.isArray(detail?.styles) ? detail.styles.map((value) => String(value)) : [];
  const profile = firstDefinedString(
    typeof detail?.profile === "string" ? stripHtml(detail.profile) : undefined,
    typeof result.title === "string" ? result.title : undefined
  );
  const narrative = [profile, summarizeList(genres, "Genres"), summarizeList(styles, "Styles")]
    .filter(Boolean)
    .join(" ");
  const sourceUrl =
    firstDefinedString(
      typeof result.uri === "string" ? result.uri : undefined,
      typeof result.resource_url === "string" ? result.resource_url : undefined
    ) ?? source.baseUrl;

  if (!narrative) return [];
  return buildNarrativePayload(source, sourceUrl, String(result.title ?? displayName), narrative, "notes", "api");
}

export async function fetchSpotifyByApi(
  source: SourceDefinition,
  displayName: string,
  entityType: string
): Promise<RawEnrichmentPayload[]> {
  const token = await getSpotifyAccessToken();
  if (!token || !displayName.trim()) return [];

  const type = entityType === "Album" ? "album" : entityType === "Track" ? "track" : "artist";
  const search = await fetchJson<Record<string, { items?: Array<Record<string, unknown>> }>>(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(displayName.trim())}&type=${type}&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const container = search?.[`${type}s`];
  const result = container?.items?.[0];
  if (!result) return [];

  const artists = Array.isArray(result.artists)
    ? result.artists.map((artist) => (artist && typeof artist === "object" ? String((artist as Record<string, unknown>).name ?? "") : ""))
    : [];
  const genres = Array.isArray(result.genres) ? result.genres.map((genre) => String(genre)) : [];
  const narrative = [
    summarizeList(artists, "Artists"),
    summarizeList(genres, "Genres"),
    typeof result.release_date === "string" ? `Release date: ${result.release_date}` : undefined,
    typeof result.popularity === "number" ? `Popularity: ${result.popularity}/100` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const sourceUrl =
    firstDefinedString(
      typeof result.href === "string" ? result.href : undefined,
      typeof result.uri === "string" ? result.uri : undefined
    ) ?? source.baseUrl;

  if (!narrative) return [];
  return buildNarrativePayload(source, sourceUrl, String(result.name ?? displayName), narrative, "notes", "api");
}

export async function fetchLastfmByApi(
  source: SourceDefinition,
  displayName: string,
  entityType: string
): Promise<RawEnrichmentPayload[]> {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  if (!apiKey || !displayName.trim()) return [];

  if (entityType === "Artist") {
    const data = await fetchJson<{
      artist?: {
        name?: string;
        url?: string;
        bio?: { summary?: string };
        tags?: { tag?: Array<{ name?: string }> };
        similar?: { artist?: Array<{ name?: string }> };
      };
    }>(
      `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(displayName.trim())}&api_key=${encodeURIComponent(apiKey)}&format=json`
    );
    const artist = data?.artist;
    if (!artist) return [];
    const narrative = [
      firstDefinedString(artist.bio?.summary ? stripHtml(artist.bio.summary) : undefined),
      summarizeList(artist.tags?.tag?.map((tag) => tag.name) ?? [], "Tags"),
      summarizeList(artist.similar?.artist?.slice(0, 5).map((artistEntry) => artistEntry.name) ?? [], "Similar artists"),
    ]
      .filter(Boolean)
      .join(" ");
    if (!narrative) return [];
    return buildNarrativePayload(source, artist.url ?? source.baseUrl, artist.name ?? displayName, narrative, "biography", "api");
  }

  const data = await fetchJson<{
    results?: {
      trackmatches?: {
        track?: Array<{ name?: string; artist?: string; url?: string }>;
      };
    };
  }>(
    `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(displayName.trim())}&api_key=${encodeURIComponent(apiKey)}&format=json&limit=1`
  );
  const track = data?.results?.trackmatches?.track?.[0];
  if (!track) return [];
  const narrative = [`Track match: ${track.name ?? displayName}`, track.artist ? `Artist: ${track.artist}` : undefined]
    .filter(Boolean)
    .join(" ");
  return buildNarrativePayload(source, track.url ?? source.baseUrl, track.name ?? displayName, narrative, "notes", "api");
}

export async function fetchGeniusByApi(
  source: SourceDefinition,
  displayName: string,
  entityType: string
): Promise<RawEnrichmentPayload[]> {
  const accessToken = process.env.GENIUS_ACCESS_TOKEN?.trim();
  if (!accessToken || !displayName.trim()) return [];

  const search = await fetchJson<{
    response?: {
      hits?: Array<{
        result?: {
          id?: number;
          title?: string;
          url?: string;
          artist_names?: string;
          primary_artist?: { id?: number; name?: string; url?: string };
        };
      }>;
    };
  }>(`https://api.genius.com/search?q=${encodeURIComponent(displayName.trim())}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const hit = search?.response?.hits?.[0]?.result;
  if (!hit) return [];

  if (entityType === "Artist" && hit.primary_artist?.id) {
    const artistResponse = await fetchJson<{
      response?: {
        artist?: {
          name?: string;
          url?: string;
          description_preview?: string;
          followers_count?: number;
        };
      };
    }>(`https://api.genius.com/artists/${hit.primary_artist.id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const artist = artistResponse?.response?.artist;
    if (artist) {
      const narrative = [
        firstDefinedString(artist.description_preview),
        typeof artist.followers_count === "number" ? `Followers: ${artist.followers_count}` : undefined,
      ]
        .filter(Boolean)
        .join(" ");
      if (narrative) {
        return buildNarrativePayload(source, artist.url ?? source.baseUrl, artist.name ?? displayName, narrative, "biography", "api");
      }
    }
  }

  const narrative = [
    hit.title ? `Song: ${hit.title}` : undefined,
    hit.artist_names ? `Artists: ${hit.artist_names}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  if (!narrative) return [];
  return buildNarrativePayload(source, hit.url ?? source.baseUrl, hit.title ?? displayName, narrative, "notes", "api");
}

export async function fetchSecondHandSongsByApi(
  source: SourceDefinition,
  displayName: string,
  entityType: string
): Promise<RawEnrichmentPayload[]> {
  const apiKey = process.env.SECONDHANDSONGS_API_KEY?.trim();
  if (!displayName.trim()) return [];

  const path =
    entityType === "Artist" ? "search/artist" : entityType === "Track" ? "search/work" : "search/object";
  const paramName = entityType === "Artist" ? "commonName" : entityType === "Track" ? "title" : "caption";
  const data = await fetchJson<Record<string, unknown>>(
    `https://secondhandsongs.com/${path}?${paramName}=${encodeURIComponent(displayName.trim())}&format=json`,
    {
      headers: {
        Accept: "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
    }
  );

  const firstArray = Object.values(data ?? {}).find(Array.isArray) as Array<Record<string, unknown>> | undefined;
  const result = firstArray?.[0];
  if (!result) return [];

  const title = firstDefinedString(
    typeof result.commonName === "string" ? result.commonName : undefined,
    typeof result.title === "string" ? result.title : undefined,
    typeof result.caption === "string" ? result.caption : undefined
  );
  const narrative = [
    title ? `Match: ${title}` : undefined,
    typeof result.artist === "string" ? `Artist: ${result.artist}` : undefined,
    typeof result.performer === "string" ? `Performer: ${result.performer}` : undefined,
    typeof result.original === "string" ? `Original: ${result.original}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const sourceUrl = firstDefinedString(typeof result.url === "string" ? result.url : undefined) ?? source.baseUrl;

  if (!narrative) return [];
  return buildNarrativePayload(source, sourceUrl, title ?? displayName, narrative, "notes", "api");
}

export async function fetchSetlistFmByApi(
  source: SourceDefinition,
  displayName: string,
  entityType: string
): Promise<RawEnrichmentPayload[]> {
  const apiKey = process.env.SETLISTFM_API_KEY?.trim();
  if (!apiKey || !displayName.trim()) return [];

  const baseHeaders = {
    Accept: "application/json",
    "x-api-key": apiKey,
  };

  if (entityType === "Venue") {
    const data = await fetchJson<{ venue?: Array<Record<string, unknown>> }>(
      `https://api.setlist.fm/rest/1.0/search/venues?name=${encodeURIComponent(displayName.trim())}&p=1`,
      { headers: baseHeaders }
    );
    const venue = data?.venue?.[0];
    if (!venue) return [];
    const city = venue.city && typeof venue.city === "object" ? (venue.city as Record<string, unknown>) : undefined;
    const cityName = city ? String(city.name ?? "") : undefined;
    const country = city && typeof city.country === "object" ? String(((city.country as Record<string, unknown>).name as string | undefined) ?? "") : undefined;
    const narrative = [cityName ? `City: ${cityName}` : undefined, country ? `Country: ${country}` : undefined]
      .filter(Boolean)
      .join(" ");
    if (!narrative) return [];
    return buildNarrativePayload(source, source.baseUrl, String(venue.name ?? displayName), narrative, "notes", "api");
  }

  const data = await fetchJson<{ setlist?: Array<Record<string, unknown>> }>(
    `https://api.setlist.fm/rest/1.0/search/setlists?artistName=${encodeURIComponent(displayName.trim())}&p=1`,
    { headers: baseHeaders }
  );
  const setlist = data?.setlist?.[0];
  if (!setlist) return [];
  const artist = setlist.artist && typeof setlist.artist === "object" ? (setlist.artist as Record<string, unknown>) : undefined;
  const venue = setlist.venue && typeof setlist.venue === "object" ? (setlist.venue as Record<string, unknown>) : undefined;
  const venueName = venue ? String(venue.name ?? "") : undefined;
  const eventDate = typeof setlist.eventDate === "string" ? setlist.eventDate : undefined;
  const tour = setlist.tour && typeof setlist.tour === "object" ? String(((setlist.tour as Record<string, unknown>).name as string | undefined) ?? "") : undefined;
  const narrative = [
    artist ? `Artist: ${String(artist.name ?? displayName)}` : undefined,
    venueName ? `Venue: ${venueName}` : undefined,
    eventDate ? `Event date: ${eventDate}` : undefined,
    tour ? `Tour: ${tour}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  if (!narrative) return [];
  return buildNarrativePayload(source, source.baseUrl, String(artist?.name ?? displayName), narrative, "notes", "api");
}

export async function fetchSoundCloudByApi(
  source: SourceDefinition,
  displayName: string,
  entityType: string
): Promise<RawEnrichmentPayload[]> {
  const token = await getSoundCloudAccessToken();
  if (!token || !displayName.trim()) return [];

  const endpoint = entityType === "Track" ? "tracks" : "users";
  const data = await fetchJson<Array<Record<string, unknown>>>(
    `https://api.soundcloud.com/${endpoint}?q=${encodeURIComponent(displayName.trim())}&limit=1`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `OAuth ${token}`,
      },
    }
  );
  const result = data?.[0];
  if (!result) return [];

  const narrative = [
    typeof result.description === "string" ? normalizeWhitespace(result.description) : undefined,
    typeof result.genre === "string" ? `Genre: ${result.genre}` : undefined,
    result.user && typeof result.user === "object"
      ? `Artist: ${String((result.user as Record<string, unknown>).username ?? "")}`
      : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  if (!narrative) return [];

  return buildNarrativePayload(
    source,
    firstDefinedString(typeof result.permalink_url === "string" ? result.permalink_url : undefined) ?? source.baseUrl,
    String(result.title ?? result.username ?? displayName),
    narrative,
    entityType === "Artist" ? "biography" : "notes",
    "api"
  );
}
