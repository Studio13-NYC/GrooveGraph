/**
 * Load play history from data/bobdobbsnyc.csv into an InMemoryGraphStore.
 * Prints a summary and a short traversal demo (Beyoncé → tracks → albums).
 */
import { buildGraphStoreFromPlayHistory } from "./lib/build-graph.js";

async function main(): Promise<void> {
  const store = await buildGraphStoreFromPlayHistory();

  const artistsFromStore = await store.findNodes({ label: "Artist", maxResults: 20000 });
  const albumsFromStore = await store.findNodes({ label: "Album", maxResults: 20000 });
  const tracksFromStore = await store.findNodes({ label: "Track", maxResults: 20000 });
  const releasedOnFromStore = await store.findEdges({ type: "RELEASED_ON", maxResults: 20000 });
  const containsFromStore = await store.findEdges({ type: "CONTAINS", maxResults: 20000 });
  const performedByFromStore = await store.findEdges({ type: "PERFORMED_BY", maxResults: 20000 });

  console.log(JSON.stringify({
    summary: {
      artists: artistsFromStore.length,
      albums: albumsFromStore.length,
      tracks: tracksFromStore.length,
      releasedOn: releasedOnFromStore.length,
      contains: containsFromStore.length,
      performedBy: performedByFromStore.length,
    },
    sampleArtists: artistsFromStore.slice(0, 5).map((a) => ({ id: a.id, name: a.properties.name })),
    sampleAlbums: albumsFromStore.slice(0, 5).map((a) => ({ id: a.id, title: a.properties.title })),
    sampleTracks: tracksFromStore.slice(0, 5).map((t) => ({ id: t.id, title: t.properties.title })),
  }, null, 2));

  const demoArtistName = "Beyoncé";
  const artistsNamed = await store.findNodes({
    label: "Artist",
    propertyKey: "name",
    propertyValue: demoArtistName,
    maxResults: 1,
  });
  if (artistsNamed.length > 0) {
    const artistId = artistsNamed[0].id;
    const inboundEdges = await store.getAdjacentEdges(artistId, "inbound");
    const performedByToArtist = inboundEdges.filter((e) => e.type === "PERFORMED_BY");
    const trackIds = [...new Set(performedByToArtist.map((e) => e.fromNodeId))].slice(0, 8);
    const trackAlbumPairs: { trackTitle: string; albumTitle: string }[] = [];
    for (const trackId of trackIds) {
      const track = await store.getNode(trackId);
      const outEdges = await store.getAdjacentEdges(trackId, "outbound");
      const releasedOn = outEdges.find((e) => e.type === "RELEASED_ON");
      const album = releasedOn ? await store.getNode(releasedOn.toNodeId) : null;
      trackAlbumPairs.push({
        trackTitle: (track?.properties.title as string) ?? trackId,
        albumTitle: (album?.properties.title as string) ?? "—",
      });
    }
    console.log("\n--- Traversal demo: %s → tracks → albums ---", demoArtistName);
    console.log(JSON.stringify({ artist: demoArtistName, sampleTracksWithAlbums: trackAlbumPairs }, null, 2));
  }
}

main();
