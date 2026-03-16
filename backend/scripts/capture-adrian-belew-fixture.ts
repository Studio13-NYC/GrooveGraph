/**
 * Capture real enrichment preview results for Adrian Belew (no mocks).
 * Run with network: npx tsx scripts/capture-adrian-belew-fixture.ts
 * Writes data/fixtures/adrian-belew-enrichment-preview.json for use in tests.
 *
 * The test "Adrian Belew enrichment run yields bands and producers from real evidence"
 * loads this fixture and asserts 10+ sources in scope and MEMBER_OF + COLLABORATED_WITH
 * in results. Re-run this script after changing adapters (e.g. MusicBrainz artist-rels)
 * and commit the updated fixture so CI uses current real evidence.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { InMemoryGraphStore } from "../src/store/index.js";
import { createStubEntity } from "../src/lib/graph-mutations.js";
import { previewEnrichmentPipeline } from "../src/enrichment/pipeline.js";
import { createReviewSession } from "../src/enrichment/review.js";

const FIXTURE_PATH = join(process.cwd(), "data", "fixtures", "adrian-belew-enrichment-preview.json");

async function main(): Promise<void> {
  const store = new InMemoryGraphStore();
  const { id } = await createStubEntity(store, { label: "Artist", name: "Adrian Belew" });
  console.log("Created stub: %s", id);

  console.log("Running real preview (Wikipedia, Wikidata, MusicBrainz, etc.)...");
  const previewResults = await Promise.all([
    previewEnrichmentPipeline(store, id),
  ]);

  const session = await createReviewSession(store, [id]);
  const fixture = {
    capturedAt: new Date().toISOString(),
    targetIds: [id],
    targets: session.targets,
    previewResults: previewResults.map((p) => ({
      nodeId: p.nodeId,
      entityType: p.entityType,
      displayName: p.displayName,
      sourcesUsed: p.sourcesUsed,
      sourceIdsUsed: p.sourceIdsUsed,
      checkedSourceIds: p.checkedSourceIds,
      checkedSourceRoutes: p.checkedSourceRoutes,
      verifiedRecords: p.verifiedRecords,
    })),
  };

  mkdirSync(join(process.cwd(), "data", "fixtures"), { recursive: true });
  writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2), "utf-8");
  console.log("Wrote %s", FIXTURE_PATH);
  console.log("Sources used: %s", fixture.previewResults[0].sourcesUsed.join(", "));
  console.log("Verified records: %d", fixture.previewResults[0].verifiedRecords.length);
  const withEdges = fixture.previewResults[0].verifiedRecords.filter(
    (r) => (r.relatedEdges?.length ?? 0) > 0
  );
  console.log("Records with relatedEdges: %d", withEdges.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
