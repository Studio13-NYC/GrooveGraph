import test from "node:test";
import assert from "node:assert/strict";

import { buildResearchOntologyContext } from "./ontology-context";
import { validateResearchBundle } from "./validate-bundle";
import type { ReviewTargetEntity } from "../types";

function makeProvenance() {
  return [
    {
      source_id: "wikidata",
      source_name: "Wikidata",
      source_type: "api" as const,
      url: "https://www.wikidata.org/wiki/Q123",
      retrieved_at: new Date().toISOString(),
      excerpt: "Adrian Belew is an American musician and member of King Crimson.",
      confidence: "high" as const,
    },
  ];
}

const targets: ReviewTargetEntity[] = [
  {
    id: "artist-adrian-belew",
    label: "Artist",
    name: "Adrian Belew",
  },
];

test("validateResearchBundle accepts valid output and preserves dual identity labels", () => {
  const bundle = validateResearchBundle(
    {
      sessionId: "session-1",
      generatedAt: new Date().toISOString(),
      targets,
      propertyChanges: [],
      nodeCandidates: [
        {
          candidateId: "node-1",
          label: "Person",
          labels: ["Person"],
          name: "Adrian Belew",
          canonicalKey: "person:adrian belew",
          properties: { name: "Adrian Belew" },
          confidence: "high",
          provenance: makeProvenance(),
          justification: "The source describes Adrian Belew as a musician, so the identity should be dual-labeled.",
          reviewStatus: "pending",
          matchStatus: "create_new",
        },
      ],
      edgeCandidates: [],
      metadata: {
        generator: "llm",
      },
    },
    {
      sessionId: "session-1",
      targets,
      ontology: buildResearchOntologyContext(),
    }
  );

  assert.equal(bundle.nodeCandidates.length, 1);
  assert.equal(bundle.nodeCandidates[0]?.label, "Artist");
  assert.deepEqual(bundle.nodeCandidates[0]?.labels, ["Person", "Artist"]);
});

test("validateResearchBundle rejects synthetic labels and relationships", () => {
  assert.throws(() =>
    validateResearchBundle(
      {
        sessionId: "session-1",
        generatedAt: new Date().toISOString(),
        targets,
        propertyChanges: [],
        nodeCandidates: [
          {
            candidateId: "node-1",
            label: "EntityType",
            name: "Person",
            canonicalKey: "entity-type:person",
            properties: { name: "Person" },
            confidence: "high",
            provenance: makeProvenance(),
            reviewStatus: "pending",
            matchStatus: "create_new",
          },
        ],
        edgeCandidates: [
          {
            candidateId: "edge-1",
            type: "IS_A",
            fromRef: { kind: "target", id: "artist-adrian-belew" },
            toRef: { kind: "existing", id: "entity-type-person" },
            confidence: "high",
            provenance: makeProvenance(),
            reviewStatus: "pending",
            matchStatus: "create_new",
          },
        ],
      },
      {
        sessionId: "session-1",
        targets,
        ontology: buildResearchOntologyContext(),
      }
    )
  );
});

test("validateResearchBundle rejects candidates without provenance", () => {
  assert.throws(() =>
    validateResearchBundle(
      {
        sessionId: "session-1",
        generatedAt: new Date().toISOString(),
        targets,
        propertyChanges: [
          {
            candidateId: "prop-1",
            targetId: "artist-adrian-belew",
            key: "summary",
            value: "Experimental rock guitarist.",
            confidence: "high",
            provenance: [],
            reviewStatus: "pending",
          },
        ],
        nodeCandidates: [],
        edgeCandidates: [],
      },
      {
        sessionId: "session-1",
        targets,
        ontology: buildResearchOntologyContext(),
      }
    )
  );
});

test("validateResearchBundle accepts node candidate with id when candidateId missing (LLM-style)", () => {
  const bundle = validateResearchBundle(
    {
      sessionId: "session-1",
      generatedAt: new Date().toISOString(),
      targets,
      propertyChanges: [],
      nodeCandidates: [
        {
          id: "node-fender-telecaster",
          label: "Instrument",
          name: "Fender Telecaster",
          confidence: "high",
          provenance: makeProvenance(),
          reviewStatus: "pending",
          matchStatus: "create_new",
        },
      ],
      edgeCandidates: [],
      metadata: { generator: "llm" },
    },
    {
      sessionId: "session-1",
      targets,
      ontology: buildResearchOntologyContext(),
    }
  );
  assert.equal(bundle.nodeCandidates.length, 1);
  assert.equal(bundle.nodeCandidates[0]?.candidateId, "node-fender-telecaster");
  assert.equal(bundle.nodeCandidates[0]?.name, "Fender Telecaster");
});

test("validateResearchBundle accepts node candidate with id and name in properties (LLM-style)", () => {
  const bundle = validateResearchBundle(
    {
      sessionId: "session-1",
      generatedAt: new Date().toISOString(),
      targets,
      propertyChanges: [],
      nodeCandidates: [
        {
          id: "cand-instrument-rickenbacker-330-mapleglo",
          label: "Instrument",
          properties: { name: "Rickenbacker 330 MapleGlo" },
          provenance: makeProvenance(),
        },
      ],
      edgeCandidates: [],
      metadata: { generator: "llm" },
    },
    {
      sessionId: "session-1",
      targets,
      ontology: buildResearchOntologyContext(),
    }
  );
  assert.equal(bundle.nodeCandidates.length, 1);
  assert.equal(bundle.nodeCandidates[0]?.candidateId, "cand-instrument-rickenbacker-330-mapleglo");
  assert.equal(bundle.nodeCandidates[0]?.name, "Rickenbacker 330 MapleGlo");
});

test("validateResearchBundle resolves edge ref ids via normalized match so CONTAINS edges are kept", () => {
  const bundle = validateResearchBundle(
    {
      sessionId: "session-1",
      generatedAt: new Date().toISOString(),
      targets: [],
      propertyChanges: [],
      nodeCandidates: [
        {
          candidateId: "album-wild-wood",
          label: "Album",
          name: "Wild Wood",
          provenance: makeProvenance(),
        },
        {
          candidateId: "track-moving-canvas",
          label: "Track",
          name: "Moving Canvas",
          provenance: makeProvenance(),
        },
      ],
      edgeCandidates: [
        {
          candidateId: "e1",
          type: "CONTAINS",
          fromRef: { kind: "candidate", id: "Wild Wood" },
          toRef: { kind: "candidate", id: "Moving Canvas" },
          provenance: makeProvenance(),
        },
      ],
      metadata: { generator: "llm" },
    },
    {
      sessionId: "session-1",
      targets: [],
      ontology: buildResearchOntologyContext(),
    }
  );
  assert.equal(bundle.edgeCandidates.length, 1);
  assert.equal(bundle.edgeCandidates[0]?.fromRef.id, "album-wild-wood");
  assert.equal(bundle.edgeCandidates[0]?.toRef.id, "track-moving-canvas");
});
