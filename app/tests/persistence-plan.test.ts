import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPersistencePlan } from "../src/persistence-plan.ts";

test("persistence plan only persists connected supported entities", () => {
  const plan = buildPersistencePlan(
    "run-1",
    "Talking Heads Fear of Music studio gear",
    {
      summary: "Reviewed candidates.",
      persistence_decision: "persist_draft",
      accepted_entities: [
        { text: "Talking Heads", label: "Artist", confidence: 0.9 },
        { text: "Fear of Music", label: "Recording", confidence: 0.9 },
        { text: "Chris Frantz Loft", label: "Studio", confidence: 0.7 },
        { text: "Brian Eno", label: "Person", confidence: 0.7 },
      ],
      rejected_entities: [{ text: "Noise Candidate", label: "Equipment", confidence: 0.2 }],
    },
    {
      entities: [],
      properties: [],
      relations: [],
    },
    {
      sources: {
        wikipedia: {
          snippets: [
            {
              name: "Fear of Music",
              snippet: "Recorded in a loft space with experimental equipment details.",
              source: "wikipedia",
              source_url: "https://example.test/wiki",
            },
          ],
        },
        musicbrainz: { snippets: [] },
      },
    },
    { nodes: [], edges: [] },
  );

  assert.equal(plan.decision, "persist_draft");
  assert.equal(plan.nodes.length, 3);
  assert.equal(plan.relations.length, 2);
  assert.equal(plan.unpersisted_candidates.length, 2);
  assert.equal(plan.rejected_candidates.length, 1);
});
