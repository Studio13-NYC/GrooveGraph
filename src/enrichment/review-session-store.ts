import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EnrichmentReviewSession } from "./types";

const REVIEW_SESSION_DIR = join(process.cwd(), "data", "enrichment-review-sessions");

function getReviewSessionPath(sessionId: string): string {
  return join(REVIEW_SESSION_DIR, `${sessionId}.json`);
}

export async function ensureReviewSessionDir(): Promise<void> {
  await mkdir(REVIEW_SESSION_DIR, { recursive: true });
}

export async function readReviewSession(sessionId: string): Promise<EnrichmentReviewSession | null> {
  try {
    const data = await readFile(getReviewSessionPath(sessionId), "utf-8");
    return JSON.parse(data) as EnrichmentReviewSession;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("ENOENT")) {
      return null;
    }
    throw error;
  }
}

export async function writeReviewSession(session: EnrichmentReviewSession): Promise<void> {
  await ensureReviewSessionDir();
  await writeFile(getReviewSessionPath(session.id), JSON.stringify(session, null, 2), "utf-8");
}
