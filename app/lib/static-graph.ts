/**
 * Client-side helpers for using the static graph.json (static deploy).
 * Fetch once, then query or filter in memory.
 */

export type GraphNode = {
  id: string;
  label: string;
  name?: string;
  biography?: string;
  country?: string;
  active_years?: string;
  enrichment_source?: string;
};
export type GraphLink = { source: string; target: string; type: string };
export type GraphJson = { nodes: GraphNode[]; links: GraphLink[] };

export type QueryArtistResult = {
  artist: string;
  id: string;
  tracks: number;
  trackList: { track: string; album: string }[];
};

const nodeById = (data: GraphJson): Map<string, GraphNode> => {
  const m = new Map<string, GraphNode>();
  for (const n of data.nodes) m.set(n.id, n);
  return m;
};

const linksByTarget = (data: GraphJson): Map<string, GraphLink[]> => {
  const m = new Map<string, GraphLink[]>();
  for (const l of data.links) {
    const list = m.get(l.target) ?? [];
    list.push(l);
    m.set(l.target, list);
  }
  return m;
};

const linksBySource = (data: GraphJson): Map<string, GraphLink[]> => {
  const m = new Map<string, GraphLink[]>();
  for (const l of data.links) {
    const list = m.get(l.source) ?? [];
    list.push(l);
    m.set(l.source, list);
  }
  return m;
};

/** Pick one artist at random from the graph; returns their name or null if none. */
export function getRandomArtistName(data: GraphJson): string | null {
  const artists = data.nodes.filter((n) => n.label === "Artist" && n.name);
  if (artists.length === 0) return null;
  const i = Math.floor(Math.random() * artists.length);
  return (artists[i].name as string) ?? null;
}

/** Load /graph.json; returns null on 404 or error. */
export async function loadGraphJson(): Promise<GraphJson | null> {
  try {
    const res = await fetch("/graph.json");
    if (!res.ok) return null;
    return (await res.json()) as GraphJson;
  } catch {
    return null;
  }
}

/** Query artist by name from in-memory graph. */
export function queryArtistFromGraph(data: GraphJson, name: string): QueryArtistResult | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const nodes = nodeById(data);
  const byTarget = linksByTarget(data);
  const bySource = linksBySource(data);

  const artist = data.nodes.find(
    (n) =>
      n.label === "Artist" &&
      (n.name?.toLowerCase() === q || n.name?.toLowerCase().includes(q))
  );
  if (!artist) return null;

  const performedBy = byTarget.get(artist.id)?.filter((l) => l.type === "PERFORMED_BY") ?? [];
  const trackIds = [...new Set(performedBy.map((l) => l.source))];
  const trackList: { track: string; album: string }[] = [];

  for (const trackId of trackIds) {
    const trackNode = nodes.get(trackId);
    const trackTitle = (trackNode?.name as string) ?? trackId;
    const out = bySource.get(trackId)?.find((l) => l.type === "RELEASED_ON");
    const albumNode = out ? nodes.get(out.target) : undefined;
    const albumTitle = (albumNode?.name as string) ?? "—";
    trackList.push({ track: trackTitle, album: albumTitle });
  }

  trackList.sort((a, b) => a.track.localeCompare(b.track, "en", { sensitivity: "base" }));

  return {
    artist: artist.name ?? artist.id,
    id: artist.id,
    tracks: trackList.length,
    trackList,
  };
}

/**
 * Return full graph or subgraph for one artist.
 * Hierarchy: Artist → Album → Track (links: HAS_ALBUM from artist to album, CONTAINS from album to track).
 */
export function getGraphData(
  data: GraphJson,
  artistFilter?: string
): { nodes: GraphNode[]; links: GraphLink[] } {
  if (!artistFilter?.trim()) {
    return { nodes: [...data.nodes], links: [...data.links] };
  }

  const q = artistFilter.trim().toLowerCase();
  const nodesMap = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  const linkKeys = new Set<string>();
  const byTarget = linksByTarget(data);
  const bySource = linksBySource(data);

  const artist = data.nodes.find(
    (n) =>
      n.label === "Artist" &&
      (n.name?.toLowerCase() === q || n.name?.toLowerCase().includes(q))
  );
  if (!artist) return { nodes: [], links: [] };

  nodesMap.set(artist.id, artist);
  const performedBy = byTarget.get(artist.id)?.filter((l) => l.type === "PERFORMED_BY") ?? [];
  const trackIds = [...new Set(performedBy.map((l) => l.source))];
  const albumIds = new Set<string>();
  const trackToAlbum = new Map<string, string>();

  for (const trackId of trackIds) {
    const trackNode = data.nodes.find((n) => n.id === trackId);
    if (trackNode) nodesMap.set(trackNode.id, trackNode);
    const releasedOn = bySource.get(trackId)?.find((l) => l.type === "RELEASED_ON");
    if (releasedOn) {
      const albumId = releasedOn.target;
      const albumNode = data.nodes.find((n) => n.id === albumId);
      if (albumNode) {
        nodesMap.set(albumNode.id, albumNode);
        albumIds.add(albumId);
        trackToAlbum.set(trackId, albumId);
      }
    }
  }

  const addLink = (link: GraphLink) => {
    const key = `${link.source}|${link.target}|${link.type}`;
    if (linkKeys.has(key)) return;
    linkKeys.add(key);
    links.push(link);
  };

  for (const albumId of albumIds) {
    addLink({ source: artist.id, target: albumId, type: "HAS_ALBUM" });
  }
  for (const [trackId, albumId] of trackToAlbum) {
    addLink({ source: albumId, target: trackId, type: "CONTAINS" });
  }

  const coreIds = new Set<string>([artist.id, ...trackIds, ...albumIds]);
  for (const link of data.links) {
    if (!coreIds.has(link.source) && !coreIds.has(link.target)) continue;
    const sourceNode = data.nodes.find((n) => n.id === link.source);
    const targetNode = data.nodes.find((n) => n.id === link.target);
    if (sourceNode) nodesMap.set(sourceNode.id, sourceNode);
    if (targetNode) nodesMap.set(targetNode.id, targetNode);
    addLink(link);
  }

  return { nodes: Array.from(nodesMap.values()), links };
}
