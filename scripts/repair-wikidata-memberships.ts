/**
 * Revalidate persisted Wikidata-derived MEMBER_OF edges against the current Wikidata member query.
 * Removes invalid `wikidata_member` relationships that no longer match the source of truth.
 *
 * Usage:
 *   npm run build && node dist/scripts/repair-wikidata-memberships.js
 *   npx tsx scripts/repair-wikidata-memberships.ts
 */
import { getAllSources } from "../src/enrichment/sources/registry.js";
import { fetchWikidataByName } from "../src/enrichment/adapters/wikidata.js";
import { getGraphStore } from "../src/load/persist-graph.js";

async function main(): Promise<void> {
  const store = await getGraphStore();
  const wikidataSource = getAllSources().find((source) => source.id === "wikidata");
  if (!wikidataSource) {
    throw new Error("Wikidata source definition not found.");
  }

  const allMemberEdges = await store.findEdges({ type: "MEMBER_OF", maxResults: 200000 });
  const wikidataMemberEdges = allMemberEdges.filter(
    (edge) =>
      edge.properties.context === "wikidata_member" &&
      edge.meta?.enrichment_source === "wikidata"
  );

  const targetNodeIds = [...new Set(wikidataMemberEdges.map((edge) => edge.toNodeId))];
  let removedEdges = 0;

  for (const targetNodeId of targetNodeIds) {
    const targetNode = await store.getNode(targetNodeId);
    if (!targetNode) continue;

    const payloads = await fetchWikidataByName(
      wikidataSource,
      String(targetNode.properties.name ?? targetNode.properties.title ?? targetNode.id),
      "Artist",
      targetNodeId
    );

    const allowedWikidataIds = new Set(
      payloads
        .flatMap((payload) => payload.relatedNodes ?? [])
        .map((node) => node.properties?.wikidata_id)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.toLowerCase())
    );

    const currentEdges = wikidataMemberEdges.filter((edge) => edge.toNodeId === targetNodeId);
    for (const edge of currentEdges) {
      const memberNode = await store.getNode(edge.fromNodeId);
      const wikidataId =
        typeof memberNode?.properties.wikidata_id === "string"
          ? memberNode.properties.wikidata_id.toLowerCase()
          : "";
      if (!wikidataId || allowedWikidataIds.has(wikidataId)) {
        continue;
      }
      await store.deleteEdge(edge.id);
      removedEdges += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        wikidataMemberEdgesScanned: wikidataMemberEdges.length,
        targetsScanned: targetNodeIds.length,
        removedEdges,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Failed to repair Wikidata membership edges");
  console.error(error);
  process.exit(1);
});
