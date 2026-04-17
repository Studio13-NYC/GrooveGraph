import assert from "node:assert/strict";
import { test } from "node:test";

import { buildGraphView } from "../src/run-pipeline.ts";

test("graph view dedupes duplicate labels and strips debug overlays from the main graph", () => {
  const view = buildGraphView({
    runId: "run-1",
    question: "Talking Heads Fear of Music",
    status: "completed",
    summary: "summary",
    currentStage: "commit",
    nextStage: null,
    awaitingApproval: false,
    artifacts: [],
    graph: {
      nodes: [
        {
          id: "artist:talking-heads:one",
          label: "Talking Heads",
          type: "Artist",
          status: "existing",
          source_flags: ["graph_context"],
          degree_hint: 1,
          metadata_preview: { normalized_name: "talking-heads" },
        },
        {
          id: "artist:talking-heads:two",
          label: "Talking Heads",
          type: "Artist",
          status: "draft_added",
          source_flags: ["wikipedia"],
          degree_hint: 1,
          metadata_preview: { normalized_name: "talking-heads" },
        },
        {
          id: "recording:fear-of-music",
          label: "Fear of Music",
          type: "Recording",
          status: "draft_added",
          source_flags: ["musicbrainz"],
          degree_hint: 1,
          metadata_preview: { normalized_name: "fear-of-music" },
        },
      ],
      edges: [
        {
          id: "edge-1",
          source: "artist:talking-heads:one",
          target: "recording:fear-of-music",
          type: "artist_recording",
          status: "draft_added",
          provenance_hint: "run",
        },
        {
          id: "edge-2",
          source: "artist:talking-heads:two",
          target: "recording:fear-of-music",
          type: "artist_recording",
          status: "draft_added",
          provenance_hint: "run",
        },
        {
          id: "debug-edge",
          source: "artist:talking-heads:one",
          target: "candidate:loner",
          type: "review_rejected",
          status: "candidate_rejected",
          provenance_hint: "overlay",
        },
      ],
      view: {
        focal_ids: ["artist:talking-heads:one"],
        filters: ["Artist", "Recording"],
        legend: [],
        counts: { nodes: 3, edges: 3 },
      },
    },
  });

  assert.equal(view.nodes.length, 2);
  assert.equal(view.edges.length, 1);
  assert.equal(view.nodes[0].status, "existing");
  assert.deepEqual(view.view.focal_ids, ["Artist:talking-heads"]);
});
