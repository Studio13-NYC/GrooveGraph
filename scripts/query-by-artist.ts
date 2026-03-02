/**
 * Query the graph by artist name: list tracks and albums for that artist.
 * Usage: npm run query -- "Artist Name"
 * Builds the graph from data/bobdobbsnyc.csv then runs the traversal.
 */
import { buildGraphStoreFromPlayHistory } from "./lib/build-graph.js";

async function main(): Promise<void> {
  const raw = process.argv.slice(2).join(" ").trim();
  const query = raw.replace(/^["']|["']$/g, "").trim();
  if (!query) {
    console.error("Usage: npm run query -- \"Artist Name\"");
    process.exit(1);
  }

  const store = await buildGraphStoreFromPlayHistory();

  // Prefer exact name match; fall back to case-insensitive match on stored name
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
    console.error("No artist found matching: %s", query);
    process.exit(1);
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

  tracksWithAlbums.sort((a, b) => a.track.localeCompare(b.track, "en", { sensitivity: "base" }));

  console.log(JSON.stringify({
    artist: artistName,
    id: artist.id,
    tracks: tracksWithAlbums.length,
    trackList: tracksWithAlbums,
  }, null, 2));
}

main();
