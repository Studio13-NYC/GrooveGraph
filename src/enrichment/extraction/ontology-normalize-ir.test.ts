import test from "node:test";
import assert from "node:assert/strict";
import { normalizeExtractionIR } from "./ontology-normalize-ir.js";
import type { ExtractionIR, ResearchOntologyContext } from "../types.js";

const ontology: ResearchOntologyContext = {
  allowedEntityLabels: ["Artist", "Album", "Track"],
  allowedRelationshipTypes: ["PLAYED_INSTRUMENT", "MEMBER_OF"],
  syntheticLabels: [],
  syntheticRelationshipTypes: [],
  dualIdentityRules: [],
  entityDefinitions: [],
  relationshipDefinitions: [],
};

test("normalizeExtractionIR coerces unknown mention label to first allowed", () => {
  const ir: ExtractionIR = {
    mentions: [{ id: "m1", text: "Foo", label: "UnknownType", confidence: "low" }],
    relations: [],
  };
  const out = normalizeExtractionIR(ir, ontology);
  assert.strictEqual(out.mentions.length, 1);
  assert.strictEqual(out.mentions[0].label, "Artist");
});

test("normalizeExtractionIR sets canonicalKey from text when missing", () => {
  const ir: ExtractionIR = {
    mentions: [{ id: "m1", text: "Paul Weller", label: "Artist" }],
    relations: [],
  };
  const out = normalizeExtractionIR(ir, ontology);
  assert.strictEqual(out.mentions[0].canonicalKey, "paul-weller");
});

test("normalizeExtractionIR keeps allowed labels and relation types", () => {
  const ir: ExtractionIR = {
    mentions: [
      { id: "m1", text: "Paul Weller", label: "Artist", confidence: "high" },
      { id: "m2", text: "Guitar", label: "Instrument", confidence: "medium" },
    ],
    relations: [
      { id: "r1", type: "PLAYED_INSTRUMENT", fromMentionId: "m1", toMentionId: "m2" },
    ],
  };
  const out = normalizeExtractionIR(ir, ontology);
  assert.strictEqual(out.mentions.length, 2);
  assert.strictEqual(out.mentions[0].label, "Artist");
  assert.strictEqual(out.mentions[1].label, "Artist"); // Instrument not allowed → coerced
  assert.strictEqual(out.relations.length, 1);
  assert.strictEqual(out.relations[0].type, "PLAYED_INSTRUMENT");
});

test("normalizeExtractionIR drops relations with disallowed type", () => {
  const ir: ExtractionIR = {
    mentions: [
      { id: "m1", text: "A", label: "Artist" },
      { id: "m2", text: "B", label: "Artist" },
    ],
    relations: [
      { id: "r1", type: "UNKNOWN_REL", fromMentionId: "m1", toMentionId: "m2" },
    ],
  };
  const out = normalizeExtractionIR(ir, ontology);
  assert.strictEqual(out.relations.length, 0);
});

test("normalizeExtractionIR drops relations referencing missing mention ids", () => {
  const ir: ExtractionIR = {
    mentions: [{ id: "m1", text: "A", label: "Artist" }],
    relations: [
      { id: "r1", type: "MEMBER_OF", fromMentionId: "m1", toMentionId: "m99" },
    ],
  };
  const out = normalizeExtractionIR(ir, ontology);
  assert.strictEqual(out.relations.length, 0);
});

test("normalizeExtractionIR sets needsDisambiguation when label coerced or confidence low", () => {
  const ir: ExtractionIR = {
    mentions: [
      { id: "m1", text: "Foo", label: "UnknownType" },
      { id: "m2", text: "Bar", label: "Artist", confidence: "low" },
      { id: "m3", text: "Baz", label: "Album", confidence: "high" },
    ],
    relations: [],
  };
  const out = normalizeExtractionIR(ir, ontology);
  assert.strictEqual(out.mentions[0].needsDisambiguation, true, "coerced label");
  assert.strictEqual(out.mentions[1].needsDisambiguation, true, "low confidence");
  assert.strictEqual(out.mentions[2].needsDisambiguation, undefined, "allowed label and high confidence");
});
