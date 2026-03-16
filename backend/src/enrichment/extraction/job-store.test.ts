/**
 * Unit tests for async extract job store and idempotency (Phase 5/8).
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  createJobId,
  getJob,
  getJobIdForIdempotencyKey,
  setJob,
  setJobIdForIdempotencyKey,
} from "./job-store.js";

test("createJobId returns a string starting with extract-", () => {
  const id = createJobId();
  assert.strictEqual(typeof id, "string");
  assert.ok(id.startsWith("extract-"), "job id should start with extract-");
});

test("setJob and getJob round-trip", () => {
  const id = createJobId();
  setJob(id, { status: "pending" });
  const job = getJob(id);
  assert.ok(job);
  assert.strictEqual(job!.status, "pending");
});

test("getJob returns undefined for unknown id", () => {
  const job = getJob("nonexistent-id");
  assert.strictEqual(job, undefined);
});

test("setJob overwrites with completed result", () => {
  const id = createJobId();
  setJob(id, { status: "pending" });
  setJob(id, {
    status: "completed",
    session: { id: "s1" },
    researchPacket: {},
  });
  const job = getJob(id);
  assert.ok(job && job.status === "completed");
  assert.strictEqual((job as { session: { id: string } }).session.id, "s1");
});

test("idempotency key maps to job id", () => {
  const jobId = createJobId();
  setJobIdForIdempotencyKey("key-1", jobId);
  assert.strictEqual(getJobIdForIdempotencyKey("key-1"), jobId);
  assert.strictEqual(getJobIdForIdempotencyKey("key-2"), undefined);
});
