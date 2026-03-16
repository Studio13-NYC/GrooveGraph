/**
 * In-memory job store for async extract (Phase 5). Per-process; use Redis or DB for multi-instance.
 * Idempotency (Phase 8): optional key → jobId map so retries return the same job.
 */

export interface EnrichmentJobResult {
  status: "completed";
  session: unknown;
  researchPacket: unknown;
  runMetadata?: unknown;
}

export interface EnrichmentJobFailed {
  status: "failed";
  error: string;
}

export interface EnrichmentJobPending {
  status: "pending";
}

export type EnrichmentJob = EnrichmentJobPending | EnrichmentJobResult | EnrichmentJobFailed;

const jobs = new Map<string, EnrichmentJob>();
const idempotencyKeyToJobId = new Map<string, string>();

export function createJobId(): string {
  return `extract-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function setJob(id: string, job: EnrichmentJob): void {
  jobs.set(id, job);
}

export function getJob(id: string): EnrichmentJob | undefined {
  return jobs.get(id);
}

/** Register an idempotency key for a job; used to avoid duplicate work on retries. */
export function setJobIdForIdempotencyKey(key: string, jobId: string): void {
  idempotencyKeyToJobId.set(key, jobId);
}

/** Return existing job id for this idempotency key, if any. */
export function getJobIdForIdempotencyKey(key: string): string | undefined {
  return idempotencyKeyToJobId.get(key);
}
