/**
 * MusicBrainz adapter: fetch artist (or other entity) data from the MusicBrainz API.
 * No API key required for read. See https://musicbrainz.org/doc/MusicBrainz_API.
 * Includes artist relations: member of band -> MEMBER_OF, supporting musician/collaboration -> COLLABORATED_WITH.
 */

import type {
  RawEnrichmentPayload,
  SourceMetadata,
  EnrichmentNodeMutation,
  EnrichmentEdgeMutation,
} from "../types";
import { slug } from "../../load/build-graph";

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

interface MusicBrainzRelation {
  type?: string;
  "type-id"?: string;
  direction?: string;
  artist?: { id?: string; name?: string; type?: string };
}

interface MusicBrainzArtistDetail extends MusicBrainzArtist {
  genres?: Array<{ id?: string; name?: string; count?: number }>;
  tags?: Array<{ name?: string; count?: number }>;
  relations?: MusicBrainzRelation[];
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
  const targetId = targetNodeId ?? `artist-${slug(artistName)}`;
  let genres: string[] = [];
  const relatedNodes: EnrichmentNodeMutation[] = [];
  const relatedEdges: EnrichmentEdgeMutation[] = [];

  if (a.id) {
    const detailUrl = `${BASE_URL}/artist/${a.id}?inc=genres+tags+artist-rels&fmt=json`;
    const detailRes = await fetch(detailUrl, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (detailRes.ok) {
      const detail = (await detailRes.json()) as MusicBrainzArtistDetail;
      const rawGenres = [
        ...(detail.genres ?? []).map((g) => g.name),
        ...(detail.tags ?? []).map((t) => t.name),
      ];
      genres = [...new Set(rawGenres.filter(Boolean).map((g) => String(g).trim()))].slice(0, 5);
      for (const genre of genres) {
        const genreId = `genre-${slug(genre)}`;
        relatedNodes.push({ id: genreId, labels: ["Genre"], properties: { name: genre } });
        relatedEdges.push({
          id: `enriched-part-of-genre-artist-${slug(artistName)}-${slug(genre)}`,
          type: "PART_OF_GENRE",
          fromNodeId: targetId,
          toNodeId: genreId,
          properties: {},
        });
      }
      const memberOfTypes = new Set(["member of band", "member of"]);
      const collaborationTypes = new Set(["supporting musician", "collaboration", "collaborated with"]);
      const seenGroupIds = new Set<string>();
      for (const rel of detail.relations ?? []) {
        const other = rel.artist;
        if (!other?.name?.trim()) continue;
        const relType = (rel.type ?? "").toLowerCase();
        if (memberOfTypes.has(relType) && (other.type === "Group" || other.type === "group")) {
          const groupId = other.id ? `artist-musicbrainz-${other.id}` : `artist-${slug(other.name)}`;
          if (!seenGroupIds.has(groupId)) {
            seenGroupIds.add(groupId);
            relatedNodes.push({
              id: groupId,
              labels: ["Artist"],
              properties: { name: other.name },
            });
            relatedEdges.push({
              id: `enriched-member-of-${slug(targetId)}-${slug(other.name)}-musicbrainz`,
              type: "MEMBER_OF",
              fromNodeId: targetId,
              toNodeId: groupId,
              properties: {},
            });
          }
        } else if (collaborationTypes.has(relType)) {
          const otherId = other.id ? `artist-musicbrainz-${other.id}` : `artist-${slug(other.name)}`;
          relatedNodes.push({
            id: otherId,
            labels: ["Artist"],
            properties: { name: other.name },
          });
          relatedEdges.push({
            id: `enriched-collaborated-with-${slug(artistName)}-${slug(other.name)}-musicbrainz`,
            type: "COLLABORATED_WITH",
            fromNodeId: targetId,
            toNodeId: otherId,
            properties: {},
          });
        }
      }
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
        biography: a.disambiguation ? `(${a.disambiguation})` : undefined,
      },
      ...(relatedNodes.length > 0 ? { relatedNodes } : {}),
      ...(relatedEdges.length > 0 ? { relatedEdges } : {}),
    },
  ];
}
