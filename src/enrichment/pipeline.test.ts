import test from "node:test";
import assert from "node:assert/strict";
import { GraphNode } from "../domain/GraphNode.js";
import { InMemoryGraphStore } from "../store/InMemoryGraphStore.js";
import { previewEnrichmentPipeline } from "./pipeline.js";
import { getSourcesForEntityType } from "./sources/registry.js";

class TestNode extends GraphNode {}

test("previewEnrichmentPipeline attempts every in-scope artist source automatically", async () => {
  const store = new InMemoryGraphStore();
  await store.createNode(new TestNode("artist-test-band", ["Artist"], { name: "Test Band" }));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("musicbrainz.org/ws/2/artist/?")) {
      return new Response(JSON.stringify({ artists: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("en.wikipedia.org/w/api.php")) {
      return new Response(JSON.stringify(["", [], [], []]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("wikidata.org/w/api.php")) {
      return new Response(JSON.stringify({ search: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("query.wikidata.org/sparql")) {
      return new Response(JSON.stringify({ results: { bindings: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("html.duckduckgo.com/html/")) {
      return new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } });
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;

  try {
    const preview = await previewEnrichmentPipeline(store, "artist-test-band");
    const allArtistSources = Array.from(
      new Map(
        [...getSourcesForEntityType("Artist", false), ...getSourcesForEntityType("Person", false)].map((source) => [
          source.id,
          source,
        ])
      ).values()
    );
    const automatedArtistSources = Array.from(
      new Map(
        [...getSourcesForEntityType("Artist", true), ...getSourcesForEntityType("Person", true)].map((source) => [
          source.id,
          source,
        ])
      ).values()
    );

    assert.equal(automatedArtistSources.length, allArtistSources.length);
    assert.equal(new Set(preview.checkedSourceIds).size, allArtistSources.length);
    assert.deepEqual(
      [...new Set(preview.checkedSourceIds)].sort(),
      allArtistSources.map((source) => source.id).sort()
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
