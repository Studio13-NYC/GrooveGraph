/**
 * GraphStore provider helpers.
 * Runtime store is Neo4j Aura; file snapshot helpers remain for import/export scripts.
 */
import { readFileSync } from "node:fs";
import type { GraphStore } from "../store/index";
import { InMemoryGraphStore, Neo4jGraphStore } from "../store/index";

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
 * Load a graph store from a JSON file without caching. Used for scripts.
 */
export function loadGraphStoreFromFile(filePath: string): GraphStore {
  const data = readFileSync(filePath, "utf-8");
  const snapshot = JSON.parse(data);
  return InMemoryGraphStore.fromJSON(snapshot);
}
