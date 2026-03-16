/**
 * Write the current graph to public/graph.json for static deploy.
 * Prefers the persisted graph store so enrichment survives into static exports.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildGraphStoreFromPlayHistory } from "./lib/build-graph.js";
import { loadGraphStoreFromFile } from "../src/load/persist-graph.js";

type GraphNode = {
  id: string;
  label: string;
  name?: string;
  biography?: string;
  country?: string;
  active_years?: string;
  enrichment_source?: string;
};
type GraphLink = { source: string; target: string; type: string };

async function main(): Promise<void> {
  const persistedPath = join(process.cwd(), "data", "graph-store.json");
  const store = existsSync(persistedPath)
    ? loadGraphStoreFromFile(persistedPath)
    : await buildGraphStoreFromPlayHistory();
  const allNodes = await store.findNodes({ maxResults: 100000 });
  const allEdges = await store.findEdges({ maxResults: 200000 });
  const labelCounts = allNodes.reduce<Record<string, number>>((acc, node) => {
    const label = node.labels[0] ?? "Unknown";
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});
  const edgeTypeCounts = allEdges.reduce<Record<string, number>>((acc, edge) => {
    acc[edge.type] = (acc[edge.type] ?? 0) + 1;
    return acc;
  }, {});

  const nodesMap = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  for (const n of allNodes) {
    const label = n.labels[0] ?? "Node";
    nodesMap.set(n.id, {
      id: n.id,
      label,
      name:
        (n.properties.title as string) ??
        (n.properties.name as string) ??
        (n.properties.venue as string) ??
        n.id,
      ...(n.properties.biography != null && { biography: String(n.properties.biography) }),
      ...(n.properties.country != null && { country: String(n.properties.country) }),
      ...(n.properties.active_years != null && {
        active_years: String(n.properties.active_years),
      }),
      ...(n.meta?.enrichment_source != null && {
        enrichment_source: String(n.meta.enrichment_source),
      }),
    });
  }

  for (const e of allEdges) {
    links.push({ source: e.fromNodeId, target: e.toNodeId, type: e.type });
  }

  const nodes = Array.from(nodesMap.values());
  const out = { nodes, links };
  const outDir = join(process.cwd(), "public");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "graph.json");
  writeFileSync(outPath, JSON.stringify(out), "utf-8");
  // #region agent log
  fetch("http://127.0.0.1:7290/ingest/d02d8ae0-2fcc-4270-9ab1-7e7cc64f475b", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "c8357e",
    },
    body: JSON.stringify({
      sessionId: "c8357e",
      runId: "static-export-debug",
      hypothesisId: "B",
      location: "scripts/export-graph-json.ts",
      message: "static graph export completed",
      data: {
        source: existsSync(persistedPath) ? "loadGraphStoreFromFile" : "buildGraphStoreFromPlayHistory",
        totalStoreNodes: allNodes.length,
        totalStoreEdges: allEdges.length,
        labelCounts,
        edgeTypeCounts,
        exportedNodes: nodes.length,
        exportedLinks: links.length,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  console.log("Wrote %s (%d nodes, %d links)", outPath, nodes.length, links.length);
}

main();
