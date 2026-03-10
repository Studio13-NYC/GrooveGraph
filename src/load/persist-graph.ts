/**
 * GraphStore provider helpers.
 * Runtime store is Neo4j Aura; file snapshot helpers remain for import/export scripts.
 */
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GraphStore } from "../store/index.js";
import { InMemoryGraphStore, Neo4jGraphStore } from "../store/index.js";

const DEFAULT_GRAPH_PATH = join(process.cwd(), "data", "graph-store.json");

let cachedStore: GraphStore | null = null;

/**
 * Returns the runtime graph store.
 * The application now uses Neo4j Aura as the persistent backend.
 */
export async function getGraphStore(): Promise<GraphStore> {
  if (cachedStore) return cachedStore;
  cachedStore = await Neo4jGraphStore.create();
  return cachedStore;
}

/**
 * Neo4j writes are persisted immediately; this remains for compatibility with
 * existing enrichment code paths.
 */
export async function persistGraphStore(path?: string): Promise<void> {
  void path;
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
