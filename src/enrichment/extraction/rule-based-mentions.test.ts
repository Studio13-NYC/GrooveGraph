import test from "node:test";
import assert from "node:assert/strict";
import { extractMentionsFromText } from "./rule-based-mentions.js";
import type { ResearchOntologyContext } from "../types";

const stubOntology: ResearchOntologyContext = {
  allowedEntityLabels: ["Artist", "Album", "Track"],
  allowedRelationshipTypes: [],
  syntheticLabels: [],
  syntheticRelationshipTypes: [],
  dualIdentityRules: [],
  entityDefinitions: [],
  relationshipDefinitions: [],
};

test("extractMentionsFromText finds capitalized phrases and returns spans", () => {
  const ontology = stubOntology;
  const text = "Paul Weller played with The Jam and The Style Council.";
  const mentions = extractMentionsFromText(text, ontology);
  assert.ok(mentions.length >= 1, "should find at least one mention");
  const paulWeller = mentions.find((m) => m.text === "Paul Weller");
  assert.ok(paulWeller, "should find Paul Weller");
  assert.strictEqual(paulWeller!.label, "Artist", "default label from ontology");
  assert.ok(paulWeller!.span, "should have span");
  assert.strictEqual(text.slice(paulWeller!.span!.start, paulWeller!.span!.end), "Paul Weller");
  assert.strictEqual(paulWeller!.confidence, "low");
});

test("extractMentionsFromText skips single short words", () => {
  const ontology = stubOntology;
  const mentions = extractMentionsFromText("I saw A band.", ontology);
  const i = mentions.find((m) => m.text === "I");
  const a = mentions.find((m) => m.text === "A");
  assert.ok(!i && !a, "should not create mentions for single short words");
});

test("extractMentionsFromText uses options", () => {
  const ontology = stubOntology;
  const mentions = extractMentionsFromText("The Who", ontology, {
    defaultLabel: "Album",
    confidence: "medium",
    sourceId: "doc-1",
  });
  assert.ok(mentions.length >= 1);
  assert.strictEqual(mentions[0].label, "Album");
  assert.strictEqual(mentions[0].confidence, "medium");
  assert.strictEqual(mentions[0].sourceId, "doc-1");
});
