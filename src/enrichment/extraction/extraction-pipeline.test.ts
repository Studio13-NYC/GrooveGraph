/**
 * Golden-style integration test: IR → normalize → bundle (ontology, candidate shape, fromRef/toRef).
 * Phase 9 regression: ontology normalization, candidate reference integrity, triplet fixture round-trip.
 * Uses manual IR to avoid ESM resolution in node --test; run the extract route for full e2e.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { extractMentionsFromText } from "./rule-based-mentions.js";
import { bundleToIR, irToResearchBundle } from "./normalize-ir.js";
import type {
  CandidateEdge,
  CandidateNode,
  ResearchBundle,
  ResearchOntologyContext,
  ReviewTargetEntity,
} from "../types.js";

const ontology: ResearchOntologyContext = {
  allowedEntityLabels: ["Artist", "Album", "Track"],
  allowedRelationshipTypes: ["PLAYED_INSTRUMENT", "MEMBER_OF"],
  syntheticLabels: [],
  syntheticRelationshipTypes: [],
  dualIdentityRules: [],
  entityDefinitions: [],
  relationshipDefinitions: [],
};

const targets: ReviewTargetEntity[] = [
  { id: "target-doc-1", label: "Artist", name: "Document" },
];

test("IR from rule-based mentions produces bundle with normalized candidates and notes", () => {
  const mentions = extractMentionsFromText("Paul Weller and The Jam.", ontology);
  const ir = { mentions, relations: [] };

  const bundle = irToResearchBundle(ir, "session-1", targets, ontology);
  assert.strictEqual(bundle.sessionId, "session-1");
  assert.strictEqual(bundle.targets.length, 1);
  assert.ok(
    bundle.nodeCandidates.length >= 2,
    "bundle should have node candidates for extracted mentions"
  );

  const hasNotes = bundle.nodeCandidates.some((c) => c.notes != null && c.notes.length > 0);
  assert.ok(hasNotes, "rule-based mentions are low confidence; at least one candidate should have notes");

  const paulWeller = bundle.nodeCandidates.find((c) => c.name === "Paul Weller");
  assert.ok(paulWeller, "should have candidate for Paul Weller");
  assert.strictEqual(paulWeller!.label, "Artist");
  assert.ok(paulWeller!.canonicalKey === "paul-weller" || paulWeller!.canonicalKey != null);
});

test("bundle candidate fromRef/toRef integrity for relations", () => {
  const ontologyWithRelations: ResearchOntologyContext = {
    ...ontology,
    allowedRelationshipTypes: ["MEMBER_OF"],
  };
  const ir = {
    mentions: [
      { id: "m1", text: "Artist A", label: "Artist", canonicalKey: "artist-a" },
      { id: "m2", text: "Band B", label: "Artist", canonicalKey: "band-b" },
    ],
    relations: [
      { id: "r1", type: "MEMBER_OF", fromMentionId: "m1", toMentionId: "m2" },
    ],
  };
  const bundle = irToResearchBundle(ir, "sess-2", targets, ontologyWithRelations);
  assert.strictEqual(bundle.edgeCandidates.length, 1);
  assert.strictEqual(bundle.edgeCandidates[0].type, "MEMBER_OF");
  assert.strictEqual(bundle.edgeCandidates[0].fromRef.id, "m1");
  assert.strictEqual(bundle.edgeCandidates[0].toRef.id, "m2");
  assert.ok(["target", "candidate"].includes(bundle.edgeCandidates[0].fromRef.kind));
  assert.ok(["target", "candidate"].includes(bundle.edgeCandidates[0].toRef.kind));
});

test("triplet-style bundle round-trip: bundleToIR then irToResearchBundle preserves structure", () => {
  const provenance = [
    {
      source_id: "triplet-fixture",
      source_name: "Fixture",
      source_type: "api" as const,
      url: "",
      retrieved_at: new Date().toISOString(),
      confidence: "high" as const,
    },
  ];
  const fixtureTargets: ReviewTargetEntity[] = [
    { id: "target-subject", label: "Artist", name: "Paul Weller" },
    { id: "target-object", label: "Instrument", name: "Guitar" },
  ];
  const fixtureNodes: CandidateNode[] = [
    {
      candidateId: "cand-1",
      label: "Instrument",
      name: "Fender Telecaster",
      canonicalKey: "fender-telecaster",
      properties: {},
      confidence: "medium",
      provenance,
      matchStatus: "create_new",
      reviewStatus: "pending",
    },
  ];
  const fixtureEdges: CandidateEdge[] = [
    {
      candidateId: "edge-1",
      type: "PLAYED_INSTRUMENT",
      fromRef: { kind: "target", id: "target-subject" },
      toRef: { kind: "candidate", id: "cand-1" },
      confidence: "medium",
      provenance,
      matchStatus: "create_new",
      reviewStatus: "pending",
    },
  ];
  const fixtureBundle: ResearchBundle = {
    sessionId: "fixture-session",
    generatedAt: new Date().toISOString(),
    targets: fixtureTargets,
    propertyChanges: [],
    nodeCandidates: fixtureNodes,
    edgeCandidates: fixtureEdges,
  };

  const ir = bundleToIR(fixtureBundle);
  assert.strictEqual(ir.mentions.length, fixtureTargets.length + fixtureNodes.length);
  assert.strictEqual(ir.relations.length, fixtureEdges.length);

  const ontologyAllowingInstrument: ResearchOntologyContext = {
    ...ontology,
    allowedEntityLabels: ["Artist", "Album", "Track", "Instrument"],
    allowedRelationshipTypes: ["PLAYED_INSTRUMENT", "MEMBER_OF"],
  };
  const roundTrip = irToResearchBundle(
    ir,
    fixtureBundle.sessionId,
    fixtureBundle.targets,
    ontologyAllowingInstrument
  );

  assert.strictEqual(roundTrip.sessionId, fixtureBundle.sessionId);
  assert.strictEqual(roundTrip.targets.length, fixtureTargets.length);
  assert.strictEqual(roundTrip.nodeCandidates.length, fixtureNodes.length);
  assert.strictEqual(roundTrip.edgeCandidates.length, fixtureEdges.length);
  assert.strictEqual(roundTrip.nodeCandidates[0].name, "Fender Telecaster");
  assert.strictEqual(roundTrip.nodeCandidates[0].label, "Instrument");
  assert.strictEqual(roundTrip.edgeCandidates[0].type, "PLAYED_INSTRUMENT");
  assert.strictEqual(roundTrip.edgeCandidates[0].fromRef.id, "target-subject");
  assert.strictEqual(roundTrip.edgeCandidates[0].toRef.id, "cand-1");
});

test("confidence and needsDisambiguation flow through to candidates (notes for low)", () => {
  const ir = {
    mentions: [
      { id: "m1", text: "High Conf", label: "Artist", confidence: "high" as const },
      { id: "m2", text: "Medium Conf", label: "Artist", confidence: "medium" as const },
      { id: "m3", text: "Low Conf", label: "Artist", confidence: "low" as const },
    ],
    relations: [],
  };
  const bundle = irToResearchBundle(ir, "sess-conf", targets, ontology);
  assert.strictEqual(bundle.nodeCandidates.length, 3);
  const high = bundle.nodeCandidates.find((c) => c.name === "High Conf");
  const medium = bundle.nodeCandidates.find((c) => c.name === "Medium Conf");
  const low = bundle.nodeCandidates.find((c) => c.name === "Low Conf");
  assert.strictEqual(high!.confidence, "high");
  assert.strictEqual(medium!.confidence, "medium");
  assert.strictEqual(low!.confidence, "low");
  assert.ok(!high!.notes || high!.notes.length === 0);
  assert.ok(low!.notes != null && low!.notes.length > 0, "low confidence should get disambiguation notes");
});
