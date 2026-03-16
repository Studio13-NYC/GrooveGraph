import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GraphNode } from "../domain/GraphNode";
import { InMemoryGraphStore } from "../store/InMemoryGraphStore";
import type { CandidatePropertyChange, ReviewTargetEntity } from "./types";
import type { EnrichmentPreviewResult } from "./pipeline";
import { applyReviewSession, createReviewSession, deriveNarrativeCandidates, importResearchBundle, startAutomatedReviewSession } from "./review";
import { getSourcesForEntityType } from "./sources/registry";
import { createStubEntity } from "../lib/graph-mutations";

class TestNode extends GraphNode {}

function makePropertyChange(targetId: string, key: string, value: string): CandidatePropertyChange {
  return {
    candidateId: `prop-${targetId}-${key}`,
    targetId,
    key,
    value,
    confidence: "high",
    provenance: [
      {
        source_id: "test",
        source_name: "Test",
        source_type: "api",
        url: "https://example.com",
        retrieved_at: new Date().toISOString(),
        confidence: "high",
      },
    ],
    matchStatus: "updates_existing_target",
    reviewStatus: "pending",
  };
}

test("deriveNarrativeCandidates extracts founders and side-project links", async () => {
  const store = new InMemoryGraphStore();
  await store.createNode(new TestNode("artist-tom-tom-club", ["Artist"], { name: "Tom Tom Club" }));
  await store.createNode(new TestNode("artist-talking-heads", ["Artist"], { name: "Talking Heads" }));

  const target: ReviewTargetEntity = {
    id: "artist-tom-tom-club",
    label: "Artist",
    name: "Tom Tom Club",
  };

  const result = await deriveNarrativeCandidates(
    store,
    [target],
    [
      makePropertyChange(
        target.id,
        "biography",
        "Tom Tom Club is an American new wave band founded in 1981 by husband-and-wife team Chris Frantz and Tina Weymouth as a side project from Talking Heads."
      ),
    ],
    [],
    []
  );

  assert.ok(
    result.nodeCandidates.some(
      (candidate) => candidate.name === "Chris Frantz" && candidate.labels?.includes("Person")
    )
  );
  assert.ok(
    result.nodeCandidates.some(
      (candidate) => candidate.name === "Tina Weymouth" && candidate.labels?.includes("Person")
    )
  );
  assert.ok(result.nodeCandidates.some((candidate) => candidate.label === "Artist" && candidate.name === "Talking Heads"));
  assert.ok(
    result.edgeCandidates.some(
      (candidate) =>
        candidate.type === "MEMBER_OF" && candidate.fromRef.kind === "candidate" && candidate.toRef.id === target.id
    )
  );
  assert.ok(result.edgeCandidates.some((candidate) => candidate.type === "COLLABORATED_WITH"));
});

test("deriveNarrativeCandidates keeps role-led lineup extraction working", async () => {
  const store = new InMemoryGraphStore();
  await store.createNode(new TestNode("artist-the-who", ["Artist"], { name: "The Who" }));

  const target: ReviewTargetEntity = {
    id: "artist-the-who",
    label: "Artist",
    name: "The Who",
  };

  const result = await deriveNarrativeCandidates(
    store,
    [target],
    [
      makePropertyChange(
        target.id,
        "biography",
        "Their classic lineup consisted of lead vocalist Roger Daltrey, guitarist Pete Townshend, bassist John Entwistle, and drummer Keith Moon."
      ),
    ],
    [],
    []
  );

  assert.ok(result.nodeCandidates.some((candidate) => candidate.name === "Roger Daltrey"));
  assert.ok(result.nodeCandidates.some((candidate) => candidate.name === "Pete Townshend"));
  assert.ok(result.nodeCandidates.some((candidate) => candidate.name === "John Entwistle"));
  assert.ok(result.nodeCandidates.some((candidate) => candidate.name === "Keith Moon"));
  assert.equal(result.edgeCandidates.filter((candidate) => candidate.type === "MEMBER_OF").length, 4);
});

test("deriveNarrativeCandidates captures worked-with and member-of narratives for artists", async () => {
  const store = new InMemoryGraphStore();
  await store.createNode(new TestNode("artist-adrian-belew", ["Artist"], { name: "Adrian Belew" }));

  const target: ReviewTargetEntity = {
    id: "artist-adrian-belew",
    label: "Artist",
    name: "Adrian Belew",
  };

  const result = await deriveNarrativeCandidates(
    store,
    [target],
    [
      makePropertyChange(
        target.id,
        "biography",
        "Adrian Belew worked with David Bowie and Brian Eno and was a member of King Crimson."
      ),
    ],
    [],
    []
  );

  assert.ok(result.nodeCandidates.some((candidate) => candidate.label === "Artist" && candidate.name === "David Bowie"));
  assert.ok(result.nodeCandidates.some((candidate) => candidate.label === "Artist" && candidate.name === "Brian Eno"));
  assert.ok(result.nodeCandidates.some((candidate) => candidate.label === "Artist" && candidate.name === "King Crimson"));
  assert.ok(result.edgeCandidates.some((candidate) => candidate.type === "COLLABORATED_WITH"));
  assert.ok(result.edgeCandidates.some((candidate) => candidate.type === "MEMBER_OF"));
});

test("applyReviewSession preserves dual artist-person labels for matched existing nodes", async () => {
  const store = new InMemoryGraphStore();
  await store.createNode(new TestNode("artist-tom-tom-club", ["Artist"], { name: "Tom Tom Club" }));
  await store.createNode(new TestNode("adrian-belew", ["Artist", "Person"], { name: "Adrian Belew" }));

  const session = await createReviewSession(store, ["artist-tom-tom-club"]);
  const imported = await importResearchBundle(
    store,
    session.id,
    {
      sessionId: session.id,
      generatedAt: new Date().toISOString(),
      targets: session.targets,
      propertyChanges: [],
      nodeCandidates: [
        {
          candidateId: "node-adrian-belew",
          label: "Person",
          labels: ["Person"],
          name: "Adrian Belew",
          canonicalKey: "person:adrian belew",
          properties: { name: "Adrian Belew", country: "United States" },
          confidence: "high",
          provenance: [
            {
              source_id: "wikidata",
              source_name: "Wikidata",
              source_type: "api",
              url: "https://www.wikidata.org/wiki/Q52985",
              retrieved_at: new Date().toISOString(),
              excerpt: "Adrian Belew is an American musician.",
              confidence: "high",
            },
          ],
          matchStatus: "matched_existing",
          matchedNodeId: "adrian-belew",
          reviewStatus: "pending",
        },
      ],
      edgeCandidates: [],
      metadata: {
        generator: "manual",
      },
    },
    "test"
  );

  assert.equal(imported.nodeCandidates.length, 1);

  await applyReviewSession(store, session.id);
  const updated = await store.getNode("adrian-belew");
  assert.ok(updated);
  assert.ok(updated.labels.includes("Artist"));
  assert.ok(updated.labels.includes("Person"));
  assert.equal(updated.properties.country, "United States");
});

test("Artist enrichment has at least 10 sources in scope", () => {
  const artistSources = getSourcesForEntityType("Artist", true);
  assert.ok(
    artistSources.length >= 10,
    `Expected at least 10 Artist sources in scope, got ${artistSources.length}. Enrichment should use 10+ sources.`
  );
});

test("Adrian Belew enrichment run yields bands and producers from real evidence", async () => {
  const fixturePath = join(process.cwd(), "data", "fixtures", "adrian-belew-enrichment-preview.json");
  let raw: { targetIds: string[]; targets: Array<{ id: string; label: string; name: string }>; previewResults: unknown[] };
  try {
    raw = JSON.parse(readFileSync(fixturePath, "utf-8"));
  } catch (err) {
    assert.fail(
      `Load real evidence fixture from ${fixturePath}. Run: npx tsx scripts/capture-adrian-belew-fixture.ts`
    );
  }

  const store = new InMemoryGraphStore();
  for (const target of raw.targets) {
    await createStubEntity(store, { id: target.id, label: target.label, name: target.name });
  }

  const previewResults: EnrichmentPreviewResult[] = raw.previewResults.map((p: unknown) => ({
    ...(p as EnrichmentPreviewResult),
    availableSources: [],
  }));

  const session = await startAutomatedReviewSession(store, raw.targetIds, {
    previewResults,
  });

  const inScope = session.sourceReport?.inScopeCount ?? 0;
  assert.ok(
    inScope >= 10,
    `Expected at least 10 sources in scope for Artist enrichment, got ${inScope}. Use real fixture from capture script.`
  );

  const memberOf = session.edgeCandidates.filter((e) => e.type === "MEMBER_OF");
  const collaboratedOrProduced = session.edgeCandidates.filter(
    (e) => e.type === "COLLABORATED_WITH" || e.type === "PRODUCED_BY"
  );
  assert.ok(
    memberOf.length > 0,
    "Results must include bands (MEMBER_OF) from real evidence. Fixture is from real run; re-capture if adapters changed."
  );
  assert.ok(
    collaboratedOrProduced.length > 0,
    "Results must include producers or collaborations (COLLABORATED_WITH or PRODUCED_BY) from real evidence. Fixture is from real run; re-capture if adapters changed."
  );
});
