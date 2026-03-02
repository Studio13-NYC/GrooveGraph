import { NextRequest, NextResponse } from "next/server";
import { buildGraphStoreFromPlayHistory } from "@/load/build-graph";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = (body?.artist ?? "").trim();
    if (!query) {
      return NextResponse.json(
        { error: "Missing or empty artist name" },
        { status: 400 }
      );
    }

    const store = await buildGraphStoreFromPlayHistory();

    let artists = await store.findNodes({
      label: "Artist",
      propertyKey: "name",
      propertyValue: query,
      maxResults: 1,
    });
    if (artists.length === 0) {
      const all = await store.findNodes({ label: "Artist", maxResults: 20000 });
      const lower = query.toLowerCase();
      artists = all.filter((a) => (a.properties.name as string)?.toLowerCase() === lower);
    }
    if (artists.length === 0) {
      const all = await store.findNodes({ label: "Artist", maxResults: 20000 });
      artists = all.filter((a) =>
        (a.properties.name as string)?.toLowerCase().includes(query.toLowerCase())
      );
    }

    if (artists.length === 0) {
      return NextResponse.json(
        { error: "No artist found", query },
        { status: 404 }
      );
    }

    const artist = artists[0];
    const artistName = artist.properties.name as string;
    const inboundEdges = await store.getAdjacentEdges(artist.id, "inbound");
    const performedBy = inboundEdges.filter((e) => e.type === "PERFORMED_BY");
    const trackIds = [...new Set(performedBy.map((e) => e.fromNodeId))];

    const tracksWithAlbums: { track: string; album: string }[] = [];
    for (const trackId of trackIds) {
      const track = await store.getNode(trackId);
      const outEdges = await store.getAdjacentEdges(trackId, "outbound");
      const releasedOn = outEdges.find((e) => e.type === "RELEASED_ON");
      const album = releasedOn ? await store.getNode(releasedOn.toNodeId) : null;
      tracksWithAlbums.push({
        track: (track?.properties.title as string) ?? trackId,
        album: (album?.properties.title as string) ?? "—",
      });
    }

    tracksWithAlbums.sort((a, b) =>
      a.track.localeCompare(b.track, "en", { sensitivity: "base" })
    );

    return NextResponse.json({
      artist: artistName,
      id: artist.id,
      tracks: tracksWithAlbums.length,
      trackList: tracksWithAlbums,
    });
  } catch (e) {
    console.error("query-artist", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Query failed" },
      { status: 500 }
    );
  }
}
