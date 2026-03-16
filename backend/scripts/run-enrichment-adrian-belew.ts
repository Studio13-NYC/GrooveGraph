/**
 * Run enrichment for Adrian Belew using in-memory store (no Neo4j).
 * Usage: npx tsx scripts/run-enrichment-adrian-belew.ts
 * Or: npm run build && node dist/scripts/run-enrichment-adrian-belew.js
 */
import { InMemoryGraphStore } from "../src/store/index.js";
import { createStubEntity } from "../src/lib/graph-mutations.js";
import { startAutomatedReviewSession } from "../src/enrichment/review.js";

async function main(): Promise<void> {
  const store = new InMemoryGraphStore();
  const { id } = await createStubEntity(store, { label: "Artist", name: "Adrian Belew" });
  console.log("Created stub: %s", id);

  const session = await startAutomatedReviewSession(store, [id]);

  const report = session.sourceReport;
  const inScope = report?.inScopeCount ?? 0;
  const used = report?.usedCount ?? 0;
  const checked = report?.checkedCount ?? 0;

  console.log("\n--- Source usage ---");
  console.log("In-scope sources: %d", inScope);
  console.log("Sources checked: %d", checked);
  console.log("Sources used (returned evidence): %d", used);

  const memberOf = session.edgeCandidates.filter((e) => e.type === "MEMBER_OF");
  const collaborated = session.edgeCandidates.filter((e) => e.type === "COLLABORATED_WITH");
  const producedBy = session.edgeCandidates.filter((e) => e.type === "PRODUCED_BY");

  console.log("\n--- Bands (MEMBER_OF) ---");
  console.log("Count: %d", memberOf.length);
  memberOf.slice(0, 15).forEach((e) => console.log("  %s", e.toRef.id || e.toRef));

  console.log("\n--- Collaborations (COLLABORATED_WITH) ---");
  console.log("Count: %d", collaborated.length);
  collaborated.slice(0, 15).forEach((e) => console.log("  %s", e.toRef.id || e.toRef));

  console.log("\n--- Producers (PRODUCED_BY) ---");
  console.log("Count: %d", producedBy.length);
  producedBy.slice(0, 15).forEach((e) => console.log("  %s", e.toRef.id || e.toRef));

  const bandsOk = inScope >= 10;
  const hasBands = memberOf.length > 0;
  const hasCollaborationsOrProducers = collaborated.length > 0 || producedBy.length > 0;
  console.log("\n--- Requirements ---");
  console.log("10+ sources in scope: %s", bandsOk ? "yes" : "no (%d)".replace("%d", String(inScope)));
  console.log("Bands in results: %s", hasBands ? "yes" : "no");
  console.log("Producers/collaborations in results: %s", hasCollaborationsOrProducers ? "yes" : "no");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
