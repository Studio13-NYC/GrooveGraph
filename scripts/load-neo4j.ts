/**
 * Load the current graph snapshot into Neo4j Aura.
 * Prefers data/graph-store.json when present so previously enriched data is imported too.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildGraphStoreFromPlayHistory } from "./lib/build-graph.js";
import { loadGraphStoreFromFile } from "../src/load/persist-graph.js";
import { Neo4jGraphStore } from "../src/store/Neo4jGraphStore.js";

async function main(): Promise<void> {
  const snapshotPath = join(process.cwd(), "data", "graph-store.json");
  const sourceStore = existsSync(snapshotPath)
    ? loadGraphStoreFromFile(snapshotPath)
    : await buildGraphStoreFromPlayHistory();

  const targetStore = await Neo4jGraphStore.create();
  await targetStore.clearAll();

  const nodes = await sourceStore.findNodes({ maxResults: 100000 });
  const edges = await sourceStore.findEdges({ maxResults: 200000 });
  await targetStore.importGraph(nodes, edges);

  const loadedNodes = await targetStore.findNodes({ maxResults: 100000 });
  const loadedEdges = await targetStore.findEdges({ maxResults: 200000 });
  console.log(
    JSON.stringify(
      {
        loadedFrom: existsSync(snapshotPath) ? snapshotPath : "play-history CSV",
        nodes: loadedNodes.length,
        edges: loadedEdges.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Failed to load graph into Neo4j Aura");
  console.error(error);
  process.exit(1);
});
