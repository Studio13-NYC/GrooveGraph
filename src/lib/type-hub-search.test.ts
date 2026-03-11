import test from "node:test";
import assert from "node:assert/strict";

import { GraphEdge } from "../domain/GraphEdge.js";
import { GraphNode } from "../domain/GraphNode.js";
import { InMemoryGraphStore } from "../store/InMemoryGraphStore.js";
import { createStubEntity } from "./graph-mutations.js";
import { buildExplorationGraphPayload, resolveEntityNode } from "./exploration.js";
import { getTypeHubNodeId, IS_A_RELATIONSHIP_TYPE } from "./type-hubs.js";

class TestNode extends GraphNode {}
class TestEdge extends GraphEdge {}

test("new entities automatically link to their type hubs with IS_A", async () => {
  const store = new InMemoryGraphStore();
  await store.createNode(new TestNode("artist-tom-tom-club", ["Artist"], { name: "Tom Tom Club" }));

  const typeHub = await store.getNode(getTypeHubNodeId("Artist"));
  assert.ok(typeHub);
  assert.equal(typeHub.properties.entityLabel, "Artist");

  const typeEdges = await store.findEdges({
    type: IS_A_RELATIONSHIP_TYPE,
    fromNodeId: "artist-tom-tom-club",
    maxResults: 10,
  });
  assert.equal(typeEdges.length, 1);
  assert.equal(typeEdges[0]?.toNodeId, getTypeHubNodeId("Artist"));
});

test("collapsed exploration payload groups related entities under type hubs", async () => {
  const store = new InMemoryGraphStore();
  await store.createNode(new TestNode("artist-tom-tom-club", ["Artist"], { name: "Tom Tom Club" }));
  await store.createNode(new TestNode("person-chris-frantz", ["Person"], { name: "Chris Frantz" }));
  await store.createNode(new TestNode("track-genius-of-love", ["Track"], { title: "Genius of Love" }));
  await store.createEdge(
    new TestEdge("member-of-chris-frantz", "MEMBER_OF", "person-chris-frantz", "artist-tom-tom-club", {})
  );
  await store.createEdge(
    new TestEdge("performed-by-genius-of-love", "PERFORMED_BY", "track-genius-of-love", "artist-tom-tom-club", {})
  );

  const focusNode = await store.getNode("artist-tom-tom-club");
  assert.ok(focusNode);
  const payload = await buildExplorationGraphPayload(store, focusNode);

  const focus = payload.nodes.find((node) => node.id === "artist-tom-tom-club");
  const personTypeNode = payload.nodes.find((node) => node.id === getTypeHubNodeId("Person"));
  const trackTypeNode = payload.nodes.find((node) => node.id === getTypeHubNodeId("Track"));
  const hiddenEntity = payload.nodes.find((node) => node.id === "person-chris-frantz");

  assert.equal(focus?.nodeKind, "focus");
  assert.equal(personTypeNode?.nodeKind, "type_hub");
  assert.equal(personTypeNode?.relatedCount, 1);
  assert.equal(trackTypeNode?.relatedCount, 1);
  assert.equal(hiddenEntity?.hiddenByDefault, true);
  assert.ok(
    payload.links.some(
      (link) =>
        link.source === "artist-tom-tom-club" &&
        link.target === getTypeHubNodeId("Person") &&
        link.type === "RELATED_TYPE"
    )
  );
});

test("resolveEntityNode returns the same multi-label node for artist and person searches", async () => {
  const store = new InMemoryGraphStore();
  await store.createNode(new TestNode("adrian-belew", ["Artist", "Person"], { name: "Adrian Belew" }));

  const artistResult = await resolveEntityNode(store, "Artist", "Adrian Belew");
  const personResult = await resolveEntityNode(store, "Person", "Adrian Belew");

  assert.equal(artistResult?.id, "adrian-belew");
  assert.equal(personResult?.id, "adrian-belew");
});

test("createStubEntity creates a new enrichment target and dual-labels person-artist stubs", async () => {
  const store = new InMemoryGraphStore();
  const stub = await createStubEntity(store, {
    label: "Person",
    name: "Adrian Belew",
  });
  const createdNode = await store.getNode(stub.id);
  assert.ok(createdNode);
  assert.ok(createdNode.labels.includes("Person"));
  assert.ok(createdNode.labels.includes("Artist"));

  const typeEdges = await store.findEdges({
    type: IS_A_RELATIONSHIP_TYPE,
    fromNodeId: stub.id,
    maxResults: 10,
  });
  assert.deepEqual(
    typeEdges.map((edge) => edge.toNodeId).sort(),
    [getTypeHubNodeId("Artist"), getTypeHubNodeId("Person")].sort()
  );
});
