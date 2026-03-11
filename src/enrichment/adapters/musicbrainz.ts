/**
 * MusicBrainz adapter: fetch artist (or other entity) data from the MusicBrainz API.
 * No API key required for read. See https://musicbrainz.org/doc/MusicBrainz_API.
 */

import type { RawEnrichmentPayload, SourceMetadata } from "../types.js";
import { slug } from "../../load/build-graph.js";

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

interface MusicBrainzArtistDetail extends MusicBrainzArtist {
  genres?: Array<{ id?: string; name?: string; count?: number }>;
  tags?: Array<{ name?: string; count?: number }>;
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
  artistName: string,
  targetNodeId?: string
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
  let genres: string[] = [];
  if (a.id) {
    const detailUrl = `${BASE_URL}/artist/${a.id}?inc=genres+tags&fmt=json`;
    const detailRes = await fetch(detailUrl, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (detailRes.ok) {
      const detail = (await detailRes.json()) as MusicBrainzArtistDetail;
      const rawGenres = [
        ...(detail.genres ?? []).map((genre) => genre.name),
        ...(detail.tags ?? []).map((tag) => tag.name),
      ];
      genres = [...new Set(rawGenres.filter(Boolean).map((genre) => String(genre).trim()))].slice(0, 5);
    }
  }
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
        ...(genres.length > 0 ? { genres } : {}),
        biography: a.disambiguation
          ? `(${a.disambiguation})`
          : undefined,
      },
      ...(a.id && genres.length > 0
        ? {
            relatedNodes: genres.map((genre) => ({
              id: `genre-${slug(genre)}`,
              labels: ["Genre"],
              properties: { name: genre },
            })),
            relatedEdges: genres.map((genre, index) => ({
              id: `enriched-part-of-genre-artist-${slug(artistName)}-${slug(genre)}`,
              type: "PART_OF_GENRE",
              fromNodeId: targetNodeId ?? `artist-${slug(artistName)}`,
              toNodeId: `genre-${slug(genre)}`,
              properties: { primary: index === 0 },
            })),
          }
        : {}),
    },
  ];
}
