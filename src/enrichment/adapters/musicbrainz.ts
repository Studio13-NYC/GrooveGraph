/**
 * MusicBrainz adapter: fetch artist (or other entity) data from the MusicBrainz API.
 * No API key required for read. See https://musicbrainz.org/doc/MusicBrainz_API.
 */

import type { RawEnrichmentPayload, SourceMetadata } from "../types.js";

const BASE_URL = "https://musicbrainz.org/ws/2";
const USER_AGENT = "GrooveGraph/1.0 (https://github.com/Studio13-NYC/GrooveGraph)";

interface MusicBrainzArtist {
  id?: string;
  name?: string;
  "sort-name"?: string;
  type?: string;
  country?: string;
  "life-span"?: { begin?: string; end?: string; ended?: boolean };
  disambiguation?: string;
}

function buildSourceMetadata(url: string): SourceMetadata {
  return {
    source_id: "musicbrainz",
    source_name: "MusicBrainz",
    source_type: "api",
    url,
    retrieved_at: new Date().toISOString(),
  };
}

/**
 * Fetch artist data from MusicBrainz by name. Returns zero or one raw payload.
 */
export async function fetchArtistByName(
  artistName: string
): Promise<RawEnrichmentPayload[]> {
  if (!artistName.trim()) return [];
  const query = encodeURIComponent(artistName.trim());
  const url = `${BASE_URL}/artist/?query=${query}&fmt=json&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { artists?: MusicBrainzArtist[] };
  const artists = data.artists ?? [];
  if (artists.length === 0) return [];
  const a = artists[0];
  const sourceUrl = a.id ? `https://musicbrainz.org/artist/${a.id}` : url;
  const lifeSpan = a["life-span"];
  const activeYears =
    lifeSpan?.begin && lifeSpan?.end
      ? `${lifeSpan.begin}-${lifeSpan.end}`
      : lifeSpan?.begin
        ? `${lifeSpan.begin}-present`
        : undefined;
  return [
    {
      source: buildSourceMetadata(sourceUrl),
      sourceDisplayName: a.name ?? undefined,
      properties: {
        name: a.name,
        country: a.country,
        active_years: activeYears,
        biography: a.disambiguation
          ? `(${a.disambiguation})`
          : undefined,
      },
    },
  ];
}
