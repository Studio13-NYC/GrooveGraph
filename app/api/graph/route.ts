import { NextRequest, NextResponse } from "next/server";
import { buildGraphStoreFromPlayHistory } from "@/load/build-graph";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type GraphNode = { id: string; label: string; name?: string };
type GraphLink = { source: string; target: string; type: string };

/**
 * GET /api/graph?artist=Name | ?random=1
 * Returns { nodes, links } for force-graph. If artist= is set, returns that artist's subgraph.
 * If random=1 (and no artist=), returns a single randomly chosen artist's subgraph.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let artistQuery = searchParams.get("artist")?.trim();

    const store = await buildGraphStoreFromPlayHistory();
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
      nodesMap.set(artist.id, {
        id: artist.id,
        label: "Artist",
        name: artist.properties.name as string,
      });

      const inboundEdges = await store.getAdjacentEdges(artist.id, "inbound");
      const performedBy = inboundEdges.filter((e) => e.type === "PERFORMED_BY");
      const trackIds = [...new Set(performedBy.map((e) => e.fromNodeId))];
      const albumIds = new Set<string>();
      const trackToAlbum = new Map<string, string>();

      for (const trackId of trackIds) {
        const track = await store.getNode(trackId);
        if (!track) continue;
        nodesMap.set(track.id, {
          id: track.id,
          label: "Track",
          name: track.properties.title as string,
        });
        const outEdges = await store.getAdjacentEdges(trackId, "outbound");
        const releasedOn = outEdges.find((e) => e.type === "RELEASED_ON");
        if (releasedOn) {
          const album = await store.getNode(releasedOn.toNodeId);
          if (album) {
            nodesMap.set(album.id, {
              id: album.id,
              label: "Album",
              name: album.properties.title as string,
            });
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
    } else {
      const artists = await store.findNodes({ label: "Artist", maxResults: 60 });
      for (const a of artists) {
        nodesMap.set(a.id, {
          id: a.id,
          label: "Artist",
          name: a.properties.name as string,
        });
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
        if (track)
          nodesMap.set(id, {
            id,
            label: "Track",
            name: track.properties.title as string,
          });
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
        if (album)
          nodesMap.set(id, {
            id,
            label: "Album",
            name: album.properties.title as string,
          });
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
