import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database: string;
}

function parseKeyValueFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf-8");
  const entries: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    entries[key] = value;
  }
  return entries;
}

function readNeo4jEnv(): Record<string, string> {
  const envLocal = parseKeyValueFile(join(process.cwd(), ".env.local"));
  return {
    ...envLocal,
    ...(process.env.NEO4J_URI ? { NEO4J_URI: process.env.NEO4J_URI } : {}),
    ...(process.env.NEO4J_USERNAME ? { NEO4J_USERNAME: process.env.NEO4J_USERNAME } : {}),
    ...(process.env.NEO4J_PASSWORD ? { NEO4J_PASSWORD: process.env.NEO4J_PASSWORD } : {}),
    ...(process.env.NEO4J_DATABASE ? { NEO4J_DATABASE: process.env.NEO4J_DATABASE } : {}),
  };
}

export function getNeo4jConfig(): Neo4jConfig {
  const env = readNeo4jEnv();
  const uri = env.NEO4J_URI;
  const username = env.NEO4J_USERNAME;
  const password = env.NEO4J_PASSWORD;
  const database = env.NEO4J_DATABASE;
  if (!uri || !username || !password || !database) {
    throw new Error("Missing Neo4j Aura configuration. Configure NEO4J_* in .env.local (see docs/neo4j.md).");
  }
  return { uri, username, password, database };
}
