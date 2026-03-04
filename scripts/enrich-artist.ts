/**
 * Enrich an artist by name and persist the graph.
 * Usage: npm run build && node dist/scripts/enrich-artist.js "The Who"
 * Or: npx tsx scripts/enrich-artist.ts "The Who"
 */
import { getGraphStore, persistGraphStore } from "../src/load/persist-graph.js";
import { runEnrichmentPipeline } from "../src/enrichment/pipeline.js";

async function main(): Promise<void> {
  const name = process.argv.slice(2).join(" ").trim().replace(/^["']|["']$/g, "");
  if (!name) {
    console.error('Usage: node dist/scripts/enrich-artist.js "Artist Name"');
    process.exit(1);
  }

  const store = await getGraphStore();
  const artists = await store.findNodes({ label: "Artist", maxResults: 10000 });
  const artist = artists.find(
    (n: { properties?: Record<string, unknown> }) =>
      String(n.properties?.name ?? "").toLowerCase() === name.toLowerCase()
  );
  if (!artist) {
    console.error("No artist found with name: %s", name);
    process.exit(1);
  }

  console.log("Enriching: %s (%s)", artist.properties?.name, artist.id);
  const result = await runEnrichmentPipeline(store, artist.id);
  await persistGraphStore();
  console.log("Done. Sources: %s, properties added: %d", result.sourcesUsed.join(", "), result.propertiesAdded);
}

main();