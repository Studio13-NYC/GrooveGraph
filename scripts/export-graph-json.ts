/**
 * Build the graph from play history CSV and write nodes + links to public/graph.json
 * for static deploy (Azure SWA). Run after npm run build: node dist/scripts/export-graph-json.js
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildGraphStoreFromPlayHistory } from "./lib/build-graph.js";

type GraphNode = { id: string; label: string; name?: string };
type GraphLink = { source: string; target: string; type: string };

async function main(): Promise<void> {
  const store = await buildGraphStoreFromPlayHistory();

  const nodesMap = new Map<string, GraphNode>();
  const links: GraphLink[] = [];

  const artistNodes = await store.findNodes({ label: "Artist", maxResults: 50000 });
  for (const n of artistNodes) {
    nodesMap.set(n.id, {
      id: n.id,
      label: "Artist",
      name: n.properties.name as string,
    });
  }

  const albumNodes = await store.findNodes({ label: "Album", maxResults: 50000 });
  for (const n of albumNodes) {
    nodesMap.set(n.id, {
      id: n.id,
      label: "Album",
      name: n.properties.title as string,
    });
  }

  const trackNodes = await store.findNodes({ label: "Track", maxResults: 50000 });
  for (const n of trackNodes) {
    nodesMap.set(n.id, {
      id: n.id,
      label: "Track",
      name: n.properties.title as string,
    });
  }

  const performedBy = await store.findEdges({ type: "PERFORMED_BY", maxResults: 100000 });
  for (const e of performedBy) {
    links.push({ source: e.fromNodeId, target: e.toNodeId, type: "PERFORMED_BY" });
  }

  const releasedOn = await store.findEdges({ type: "RELEASED_ON", maxResults: 100000 });
  for (const e of releasedOn) {
    links.push({ source: e.fromNodeId, target: e.toNodeId, type: "RELEASED_ON" });
  }

  const contains = await store.findEdges({ type: "CONTAINS", maxResults: 100000 });
  for (const e of contains) {
    links.push({ source: e.fromNodeId, target: e.toNodeId, type: "CONTAINS" });
  }

  const nodes = Array.from(nodesMap.values());
  const out = { nodes, links };
  const outDir = join(process.cwd(), "public");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "graph.json");
  writeFileSync(outPath, JSON.stringify(out), "utf-8");
  console.log("Wrote %s (%d nodes, %d links)", outPath, nodes.length, links.length);
}

main();
