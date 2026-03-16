import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveExtractionComplexity,
  getModelForExtractionComplexity,
} from "./complexity.js";
import type { ExtractionIR } from "../types.js";

test("deriveExtractionComplexity returns low for small IR", () => {
  const ir: ExtractionIR = {
    mentions: [{ id: "m1", text: "A", label: "Artist" }],
    relations: [],
  };
  assert.strictEqual(deriveExtractionComplexity(ir), "low");
});

test("deriveExtractionComplexity returns high when hasAnyScope", () => {
  const ir: ExtractionIR = { mentions: [], relations: [] };
  assert.strictEqual(deriveExtractionComplexity(ir, { hasAnyScope: true }), "high");
});

test("deriveExtractionComplexity returns medium for moderate size", () => {
  const ir: ExtractionIR = {
    mentions: Array.from({ length: 10 }, (_, i) => ({
      id: `m${i}`,
      text: `M${i}`,
      label: "Artist",
    })),
    relations: [],
  };
  assert.strictEqual(deriveExtractionComplexity(ir), "medium");
});

test("getModelForExtractionComplexity returns string", () => {
  assert.strictEqual(typeof getModelForExtractionComplexity("low"), "string");
  assert.strictEqual(typeof getModelForExtractionComplexity("medium"), "string");
  assert.strictEqual(typeof getModelForExtractionComplexity("high"), "string");
});
