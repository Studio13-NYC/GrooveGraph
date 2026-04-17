import { readFileSync } from "node:fs";
import path from "node:path";

import { getRepoRoot } from "./runtime-paths.ts";

type EnvMap = Record<string, string>;

let cachedEnv: EnvMap | null = null;

function parseDotEnv(raw: string): EnvMap {
  const out: EnvMap = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function getEnv(): EnvMap {
  if (cachedEnv) {
    return cachedEnv;
  }
  const repoRoot = getRepoRoot();
  const filePath = path.join(repoRoot, ".env");
  let parsed: EnvMap = {};
  try {
    parsed = parseDotEnv(readFileSync(filePath, "utf8"));
  } catch {
    parsed = {};
  }
  cachedEnv = {
    ...parsed,
    ...Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => value != null) as Array<[string, string]>,
    ),
  };
  return cachedEnv;
}

export function getEnvValue(name: string, fallback = ""): string {
  return getEnv()[name] ?? fallback;
}

export function resetEnvCacheForTests(): void {
  cachedEnv = null;
}
