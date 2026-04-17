import assert from "node:assert/strict";
import { test } from "node:test";

import { resetEnvCacheForTests } from "../src/env.ts";
import { planSourceQueries } from "../src/query-planner.ts";

test("query planner falls back deterministically without OpenAI credentials", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "";
  resetEnvCacheForTests();

  try {
    const plan = await planSourceQueries("Talking Heads Fear of Music recording studio", {
      nodes: [],
      edges: [],
      view: { focal_ids: [], filters: [], legend: [], counts: {} },
    });

    assert.equal(plan.planner_status, "fallback");
    assert.ok(plan.source_queries.wikipedia.length > 0);
    assert.ok(plan.source_queries.musicbrainz_artist.length > 0);
    assert.ok(plan.source_queries.musicbrainz_recording.length > 0);
    assert.ok(plan.source_queries.brave.length > 0);
  } finally {
    if (previous !== undefined) {
      process.env.OPENAI_API_KEY = previous;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    resetEnvCacheForTests();
  }
});
