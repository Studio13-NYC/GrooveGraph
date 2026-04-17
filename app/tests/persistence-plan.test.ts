import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPersistencePlan } from "../src/persistence-plan.ts";

test("persistence plan only persists connected supported entities", () => {
  const plan = buildPersistencePlan(
    "run-1",
    "Talking Heads Fear of Music studio gear",
    {
      entities: [
        { text: "Talking Heads", label: "Artist", confidence: 0.9, sources: ["musicbrainz"], evidence: ["artist evidence"] },
        { text: "Fear of Music", label: "Recording", confidence: 0.9, sources: ["wikipedia"], evidence: ["recording evidence"] },
        { text: "Chris Frantz Loft", label: "Studio", confidence: 0.7, sources: ["web"], evidence: ["studio evidence"] },
        { text: "Brian Eno", label: "Person", confidence: 0.8, sources: ["wikipedia"], evidence: ["producer evidence"] },
        { text: "Alias Span", label: "Alias", confidence: 0.5, sources: ["spacy"], evidence: ["unsupported"] },
      ],
      properties: [{ subject: "Fear of Music", property: "year", value: "1979", confidence: 0.8, source: "musicbrainz" }],
      relations: [{ type: "produced", source_entity: "Brian Eno", source_label: "Person", target_entity: "Fear of Music", target_label: "Recording", confidence: 0.8 }],
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
  assert.equal(plan.nodes.length, 4);
  assert.equal(plan.relations.length, 3);
  assert.equal(plan.unpersisted_candidates.length, 0);
  assert.equal(plan.rejected_candidates.length, 1);
});
