/**
 * Load or build the graph store and persist it so enrichment (and other updates)
 * survive across requests and server restarts.
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GraphStore } from "../store/index.js";
import { InMemoryGraphStore } from "../store/index.js";
import { buildGraphStoreFromPlayHistory } from "./build-graph.js";

const DEFAULT_GRAPH_PATH = join(process.cwd(), "data", "graph-store.json");

let cachedStore: GraphStore | null = null;

/**
 * Returns the graph store: from cache, from file (data/graph-store.json), or
 * builds from CSV + seed and saves to file. Use this in API routes so
 * enrichment and other updates are persisted.
 */
export async function getGraphStore(): Promise<GraphStore> {
  if (cachedStore) return cachedStore;
  if (existsSync(DEFAULT_GRAPH_PATH)) {
    const data = await readFile(DEFAULT_GRAPH_PATH, "utf-8");
    const snapshot = JSON.parse(data) as import("../store/index.js").GraphStoreSnapshot;
    cachedStore = InMemoryGraphStore.fromJSON(snapshot);
    return cachedStore;
  }
  cachedStore = await buildGraphStoreFromPlayHistory();
  await saveGraphStore(cachedStore, DEFAULT_GRAPH_PATH);
  return cachedStore;
}

/**
 * Writes the current graph store to disk. Call after enrichment (or other
 * mutations) so changes persist. Uses the same store instance as getGraphStore.
 */
export async function persistGraphStore(path?: string): Promise<void> {
  const store = cachedStore;
  if (!store) return;
  const targetPath = path ?? DEFAULT_GRAPH_PATH;
  if (!("toJSON" in store) || typeof (store as InMemoryGraphStore).toJSON !== "function") {
    return;
  }
  const snapshot = (store as InMemoryGraphStore).toJSON();
  await writeFile(targetPath, JSON.stringify(snapshot, null, 0), "utf-8");
}

/**
 * Save a given store to a file (e.g. after build). Used internally by getGraphStore.
 */
export async function saveGraphStore(
  store: GraphStore,
  filePath: string = DEFAULT_GRAPH_PATH
): Promise<void> {
  if (!("toJSON" in store) || typeof (store as InMemoryGraphStore).toJSON !== "function") {
    throw new Error("Only InMemoryGraphStore can be persisted");
  }
  const snapshot = (store as InMemoryGraphStore).toJSON();
  await writeFile(filePath, JSON.stringify(snapshot, null, 0), "utf-8");
}

/**
 * Load a graph store from a JSON file without caching. Used for scripts.
 */
export function loadGraphStoreFromFile(filePath: string): GraphStore {
  const data = readFileSync(filePath, "utf-8");
  const snapshot = JSON.parse(data);
  return InMemoryGraphStore.fromJSON(snapshot);
}
