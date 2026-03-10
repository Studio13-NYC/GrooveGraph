import { NextRequest, NextResponse } from "next/server";
import { getGraphStore } from "@/load/persist-graph";
import { Neo4jGraphStore } from "@/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type GraphNode = {
  id: string;
  label: string;
  name?: string;
  /** Enrichment / external source data when present */
  biography?: string;
  country?: string;
  active_years?: string;
  enrichment_source?: string;
};
type GraphLink = { source: string; target: string; type: string };

function toGraphNode(node: {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
  meta?: Record<string, unknown>;
}): GraphNode {
  const label = node.labels[0] ?? "Node";
  const name =
    (node.properties.title as string) ??
    (node.properties.name as string) ??
    (node.properties.venue as string) ??
    node.id;
  const out: GraphNode = { id: node.id, label, name };
  if (node.properties.biography != null) out.biography = String(node.properties.biography);
  if (node.properties.country != null) out.country = String(node.properties.country);
  if (node.properties.active_years != null) out.active_years = String(node.properties.active_years);
  if (node.meta?.enrichment_source != null) out.enrichment_source = String(node.meta.enrichment_source);
  return out;
}

/**
 * GET /api/graph?artist=Name | ?random=1
 * Returns { nodes, links } for force-graph. If artist= is set, returns that artist's subgraph.
 * If random=1 (and no artist=), returns a single randomly chosen artist's subgraph.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let artistQuery = searchParams.get("artist")?.trim();

    const store = await getGraphStore();
    const nodesMap = new Map<string, GraphNode>();
    const links: GraphLink[] = [];

    if (!artistQuery && searchParams.get("random")) {
      const all = await store.findNodes({ label: "Artist", maxResults: 10000 });
      if (all.length > 0) {
        const idx = Math.floor(Math.random() * all.length);
        artistQuery = all[idx].properties.name as string;
      }
    }

    if (artistQuery) {
      if (store instanceof Neo4jGraphStore) {
        const subgraph = await store.getArtistSubgraph(artistQuery);
        return NextResponse.json({
          nodes: subgraph.nodes.map((node) => toGraphNode(node)),
          links: subgraph.edges.map((edge) => ({
            source: edge.fromNodeId,
            target: edge.toNodeId,
            type: edge.type,
          })),
        });
      }

      let artists = await store.findNodes({
        label: "Artist",
        propertyKey: "name",
        propertyValue: artistQuery,
        maxResults: 1,
      });
      if (artists.length === 0) {
        const all = await store.findNodes({ label: "Artist", maxResults: 20000 });
        artists = all.filter((a) =>
          (a.properties.name as string)
            ?.toLowerCase()
            .includes(artistQuery.toLowerCase())
        );
      }
      if (artists.length === 0) {
        return NextResponse.json({ nodes: [], links: [] });
      }

      const artist = artists[0];
      nodesMap.set(artist.id, toGraphNode(artist));

      const inboundEdges = await store.getAdjacentEdges(artist.id, "inbound");
      const performedBy = inboundEdges.filter((e) => e.type === "PERFORMED_BY");
      const trackIds = [...new Set(performedBy.map((e) => e.fromNodeId))];
      const albumIds = new Set<string>();
      const trackToAlbum = new Map<string, string>();

      for (const trackId of trackIds) {
        const track = await store.getNode(trackId);
        if (!track) continue;
        nodesMap.set(track.id, toGraphNode(track));
        const outEdges = await store.getAdjacentEdges(trackId, "outbound");
        const releasedOn = outEdges.find((e) => e.type === "RELEASED_ON");
        if (releasedOn) {
          const album = await store.getNode(releasedOn.toNodeId);
          if (album) {
            nodesMap.set(album.id, toGraphNode(album));
            albumIds.add(album.id);
            trackToAlbum.set(trackId, album.id);
          }
        }
      }
      for (const albumId of albumIds) {
        links.push({ source: artist.id, target: albumId, type: "HAS_ALBUM" });
      }
      for (const [trackId, albumId] of trackToAlbum) {
        links.push({ source: albumId, target: trackId, type: "CONTAINS" });
      }
      for (const trackId of trackIds) {
        links.push({ source: trackId, target: artist.id, type: "PERFORMED_BY" });
      }

      const coreIds = new Set<string>([artist.id, ...trackIds, ...albumIds]);
      const linkKeys = new Set<string>(links.map((link) => `${link.source}|${link.target}|${link.type}`));
      const addLink = (source: string, target: string, type: string) => {
        const key = `${source}|${target}|${type}`;
        if (linkKeys.has(key)) return;
        linkKeys.add(key);
        links.push({ source, target, type });
      };
      for (const nodeId of coreIds) {
        const adjacentEdges = await store.getAdjacentEdges(nodeId, "both");
        for (const e of adjacentEdges) {
          const source = await store.getNode(e.fromNodeId);
          const target = await store.getNode(e.toNodeId);
          if (source && !nodesMap.has(e.fromNodeId)) {
            nodesMap.set(e.fromNodeId, toGraphNode(source));
          }
          if (target && !nodesMap.has(e.toNodeId)) {
            nodesMap.set(e.toNodeId, toGraphNode(target));
          }
          addLink(e.fromNodeId, e.toNodeId, e.type);
        }
      }
    } else {
      const artists = await store.findNodes({ label: "Artist", maxResults: 60 });
      for (const a of artists) {
        nodesMap.set(a.id, toGraphNode(a));
      }
      const edges = await store.findEdges({ type: "PERFORMED_BY", maxResults: 400 });
      const trackIds = new Set<string>();
      const albumIds = new Set<string>();
      for (const e of edges) {
        if (nodesMap.has(e.toNodeId)) {
          trackIds.add(e.fromNodeId);
          links.push({ source: e.fromNodeId, target: e.toNodeId, type: "PERFORMED_BY" });
        }
      }
      for (const id of trackIds) {
        const track = await store.getNode(id);
        if (track) nodesMap.set(id, toGraphNode(track));
      }
      const releasedOnEdges = await store.findEdges({
        type: "RELEASED_ON",
        maxResults: 400,
      });
      for (const e of releasedOnEdges) {
        if (nodesMap.has(e.fromNodeId)) {
          albumIds.add(e.toNodeId);
          links.push({ source: e.fromNodeId, target: e.toNodeId, type: "RELEASED_ON" });
        }
      }
      for (const id of albumIds) {
        const album = await store.getNode(id);
        if (album) nodesMap.set(id, toGraphNode(album));
      }
    }

    const nodes = Array.from(nodesMap.values());
    return NextResponse.json({ nodes, links });
  } catch (e) {
    console.error("graph", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Graph failed" },
      { status: 500 }
    );
  }
}
