/**
 * Unit tests for mergeExtractionIR (ensemble/dual_run).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mergeExtractionIR } from "./merge-ir.js";
import type { ExtractionIR } from "../types.js";

test("mergeExtractionIR dedupes mentions by span", () => {
  const a: ExtractionIR = {
    mentions: [
      { id: "a-0", text: "Paul", label: "Artist", span: { start: 0, end: 4 } },
      { id: "a-1", text: "Jam", label: "Artist", span: { start: 10, end: 13 } },
    ],
    relations: [],
  };
  const b: ExtractionIR = {
    mentions: [
      { id: "b-0", text: "Paul", label: "Artist", span: { start: 0, end: 4 } },
      { id: "b-1", text: "Weller", label: "Artist", span: { start: 5, end: 11 } },
    ],
    relations: [],
  };
  const merged = mergeExtractionIR(a, b);
  assert.ok(merged.mentions.length >= 2 && merged.mentions.length <= 4);
  const bySpan = new Map(merged.mentions.map((m) => [m.span ? `${m.span.start}:${m.span.end}` : m.text, m]));
  assert.ok(bySpan.has("0:4"), "merged should have one mention for span 0:4 (Paul)");
  assert.strictEqual(merged.mentions.filter((m) => m.text === "Paul").length, 1, "Paul should appear once (deduped)");
});

test("mergeExtractionIR merges relations and remaps mention ids", () => {
  const a: ExtractionIR = {
    mentions: [
      { id: "m1", text: "A", label: "Artist", span: { start: 0, end: 1 } },
      { id: "m2", text: "B", label: "Artist", span: { start: 2, end: 3 } },
    ],
    relations: [{ id: "r1", type: "REL", fromMentionId: "m1", toMentionId: "m2" }],
  };
  const b: ExtractionIR = { mentions: [], relations: [] };
  const merged = mergeExtractionIR(a, b);
  assert.strictEqual(merged.mentions.length, 2);
  assert.strictEqual(merged.relations.length, 1);
  assert.ok(
    merged.mentions.some((m) => m.id === merged.relations[0].fromMentionId),
    "relation fromRef should point to a merged mention id"
  );
  assert.ok(
    merged.mentions.some((m) => m.id === merged.relations[0].toMentionId),
    "relation toRef should point to a merged mention id"
  );
});
