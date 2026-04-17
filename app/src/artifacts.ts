import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RunArtifact, RunRecord } from "./types.ts";
import { getRunDirectory, resolveArtifactPath } from "./runtime-paths.ts";

export async function writeArtifact(runId: string, artifact: RunArtifact): Promise<void> {
  const dir = getRunDirectory(runId);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${artifact.stage}.json`);
  await writeFile(filePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

export async function writeRunRecord(run: RunRecord): Promise<void> {
  const dir = getRunDirectory(run.runId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "run.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8");
}

export async function readRunRecord(runId: string): Promise<RunRecord | null> {
  const filePath = resolveArtifactPath(runId, "run");
  if (!filePath) {
    return null;
  }
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as RunRecord;
  } catch {
    return null;
  }
}
