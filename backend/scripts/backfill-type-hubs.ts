/**
 * Ensure canonical entity-type hubs and `IS_A` relationships exist for all graph entities.
 * Usage:
 *   npm run build && node dist/scripts/backfill-type-hubs.js
 *   npx tsx scripts/backfill-type-hubs.ts
 */
import { getGraphStore } from "../src/load/persist-graph.js";
import { reconcileAllTypeHubLinks } from "../src/lib/type-hubs.js";

async function main(): Promise<void> {
  const store = await getGraphStore();
  const beforeNodes = await store.findNodes({ maxResults: 100000 });
  const beforeEdges = await store.findEdges({ maxResults: 200000 });

  await reconcileAllTypeHubLinks(store);

  const afterNodes = await store.findNodes({ maxResults: 100000 });
  const afterEdges = await store.findEdges({ maxResults: 200000 });

  console.log(
    JSON.stringify(
      {
        entitiesScanned: beforeNodes.length,
        nodesBefore: beforeNodes.length,
        edgesBefore: beforeEdges.length,
        nodesAfter: afterNodes.length,
        edgesAfter: afterEdges.length,
        typeHubNodesAdded: afterNodes.length - beforeNodes.length,
        isARelationshipsAdded: afterEdges.length - beforeEdges.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Failed to backfill type hubs");
  console.error(error);
  process.exit(1);
});
