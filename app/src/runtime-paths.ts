import { access, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appDir, "..");
const artifactsRoot = path.join(repoRoot, "artifacts", "runs");
const publicRoot = path.join(appDir, "public");

export function getRepoRoot(): string {
  return repoRoot;
}

export function getRunArtifactsRoot(): string {
  return artifactsRoot;
}

export function getPublicAssetPath(requestPath: string): string | null {
  const candidate = path.join(publicRoot, requestPath.replace(/^\/assets\//, ""));
  if (!candidate.startsWith(publicRoot)) {
    return null;
  }
  return candidate;
}

export function getRunDirectory(runId: string): string {
  return path.join(artifactsRoot, runId);
}

export function resolveArtifactPath(runId: string, stage: string): string | null {
  const candidate = path.join(getRunDirectory(runId), `${stage}.json`);
  if (!candidate.startsWith(getRunDirectory(runId))) {
    return null;
  }
  return candidate;
}

export async function ensureRuntimeDirectories(): Promise<void> {
  await mkdir(artifactsRoot, { recursive: true });
}

export async function listRunArtifacts(): Promise<Array<{ run_id: string }>> {
  try {
    const items = await readdir(artifactsRoot, { withFileTypes: true });
    return items.filter((item) => item.isDirectory()).map((item) => ({ run_id: item.name }));
  } catch {
    return [];
  }
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}
