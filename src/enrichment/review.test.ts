import test from "node:test";
import assert from "node:assert/strict";
import { GraphNode } from "../domain/GraphNode.js";
import { InMemoryGraphStore } from "../store/InMemoryGraphStore.js";
import type { CandidatePropertyChange, ReviewTargetEntity } from "./types.js";
import { deriveNarrativeCandidates } from "./review.js";

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

  assert.ok(result.nodeCandidates.some((candidate) => candidate.label === "Person" && candidate.name === "Chris Frantz"));
  assert.ok(result.nodeCandidates.some((candidate) => candidate.label === "Person" && candidate.name === "Tina Weymouth"));
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
