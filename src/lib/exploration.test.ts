import test from "node:test";
import assert from "node:assert/strict";
import { GraphEdge } from "../domain/GraphEdge";
import { GraphNode } from "../domain/GraphNode";
import { InMemoryGraphStore } from "../store/InMemoryGraphStore";
import { buildQueryResultPayload, resolveEntityNode } from "./exploration";

class TestNode extends GraphNode {}
class TestEdge extends GraphEdge {}

test("buildQueryResultPayload keeps direct membership links visible in crowded neighborhoods", async () => {
  const store = new InMemoryGraphStore();
  await store.createNode(new TestNode("artist-tom-tom-club", ["Artist"], { name: "Tom Tom Club" }));
  await store.createNode(new TestNode("person-chris-frantz", ["Person"], { name: "Chris Frantz" }));
  await store.createEdge(
    new TestEdge("member-of-chris-frantz", "MEMBER_OF", "person-chris-frantz", "artist-tom-tom-club", {})
  );

  for (let index = 0; index < 18; index += 1) {
    const trackId = `track-${index}`;
    await store.createNode(new TestNode(trackId, ["Track"], { title: `Track ${index}` }));
    await store.createEdge(new TestEdge(`performed-by-${index}`, "PERFORMED_BY", trackId, "artist-tom-tom-club", {}));
  }

  const artistNode = await store.getNode("artist-tom-tom-club");
  assert.ok(artistNode);

  const payload = await buildQueryResultPayload(store, artistNode, "Tom Tom Club");
  assert.ok(payload.relatedItems.some((item) => item.name === "Chris Frantz"));
});

test("buildQueryResultPayload combines split person and artist identities", async () => {
  const store = new InMemoryGraphStore();
  await store.createNode(new TestNode("artist-adrian-belew", ["Artist"], { name: "Adrian Belew" }));
  await store.createNode(new TestNode("person-adrian-belew", ["Person"], { name: "Adrian Belew" }));
  await store.createNode(new TestNode("artist-talking-heads", ["Artist"], { name: "Talking Heads" }));
  await store.createNode(new TestNode("track-the-great-curve", ["Track"], { title: "The Great Curve" }));
  await store.createEdge(
    new TestEdge("member-of-adrian-talking-heads", "MEMBER_OF", "person-adrian-belew", "artist-talking-heads", {})
  );
  await store.createEdge(
    new TestEdge("performed-by-the-great-curve", "PERFORMED_BY", "track-the-great-curve", "artist-adrian-belew", {})
  );

  const resolved = await resolveEntityNode(store, "Artist", "Adrian Belew");
  assert.ok(resolved);
  const payload = await buildQueryResultPayload(store, resolved, "Adrian Belew");

  assert.ok(payload.labels.includes("Artist"));
  assert.ok(payload.labels.includes("Person"));
  assert.ok(payload.relatedEntityCounts.some((item) => item.key === "Artist" && item.count === 1));
  assert.ok(payload.relatedEntityCounts.some((item) => item.key === "Track" && item.count === 1));
});
