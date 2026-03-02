/**
 * Client-side helpers for using the static graph.json (static deploy).
 * Fetch once, then query or filter in memory.
 */

export type GraphNode = { id: string; label: string; name?: string };
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

/** Return full graph or subgraph for one artist (nodes + links only for that artist). */
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

  const artist = data.nodes.find(
    (n) =>
      n.label === "Artist" &&
      (n.name?.toLowerCase() === q || n.name?.toLowerCase().includes(q))
  );
  if (!artist) return { nodes: [], links: [] };

  nodesMap.set(artist.id, artist);
  const byTarget = linksByTarget(data);
  const bySource = linksBySource(data);

  const performedBy = byTarget.get(artist.id)?.filter((l) => l.type === "PERFORMED_BY") ?? [];
  const trackIds = new Set(performedBy.map((l) => l.source));

  for (const trackId of trackIds) {
    const trackNode = data.nodes.find((n) => n.id === trackId);
    if (trackNode) {
      nodesMap.set(trackNode.id, trackNode);
      links.push({ source: trackNode.id, target: artist.id, type: "PERFORMED_BY" });
    }
    const releasedOn = bySource.get(trackId)?.find((l) => l.type === "RELEASED_ON");
    if (releasedOn) {
      const albumNode = data.nodes.find((n) => n.id === releasedOn.target);
      if (albumNode) {
        nodesMap.set(albumNode.id, albumNode);
        links.push({ source: trackId, target: albumNode.id, type: "RELEASED_ON" });
      }
    }
  }

  return { nodes: Array.from(nodesMap.values()), links };
}
