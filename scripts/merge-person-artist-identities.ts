/**
 * Merge exact-name `Artist` / `Person` duplicates into single multi-label nodes.
 * Usage:
 *   npm run build && node dist/scripts/merge-person-artist-identities.js
 *   npx tsx scripts/merge-person-artist-identities.ts
 */
import { GraphEdge } from "../src/domain/GraphEdge.js";
import { getGraphStore } from "../src/load/persist-graph.js";
import { coerceArtistPersonIdentity } from "../src/lib/entity-identity.js";

class MutableGraphEdge extends GraphEdge {}

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function mergeProperties(
  survivor: Record<string, unknown>,
  duplicate: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...duplicate, ...survivor };
  for (const [key, value] of Object.entries(duplicate)) {
    if (next[key] === undefined || next[key] === null || next[key] === "") {
      next[key] = value;
    }
  }
  return next;
}

async function getNodeDegree(store: Awaited<ReturnType<typeof getGraphStore>>, nodeId: string): Promise<number> {
  return (await store.getAdjacentEdges(nodeId, "both")).length;
}

async function redirectEdges(
  store: Awaited<ReturnType<typeof getGraphStore>>,
  duplicateNodeId: string,
  survivorNodeId: string
): Promise<number> {
  let rewiredCount = 0;
  const adjacentEdges = await store.getAdjacentEdges(duplicateNodeId, "both");
  for (const edge of adjacentEdges) {
    const nextFrom = edge.fromNodeId === duplicateNodeId ? survivorNodeId : edge.fromNodeId;
    const nextTo = edge.toNodeId === duplicateNodeId ? survivorNodeId : edge.toNodeId;
    await store.deleteEdge(edge.id);
    if (nextFrom === nextTo) {
      continue;
    }
    const existingEdges = await store.findEdges({
      type: edge.type,
      fromNodeId: nextFrom,
      toNodeId: nextTo,
      maxResults: 20,
    });
    const duplicateExists = existingEdges.some(
      (candidate) => JSON.stringify(candidate.properties) === JSON.stringify(edge.properties)
    );
    if (duplicateExists) {
      continue;
    }
    await store.createEdge(
      new MutableGraphEdge(edge.id, edge.type, nextFrom, nextTo, edge.properties, edge.meta)
    );
    rewiredCount += 1;
  }
  return rewiredCount;
}

async function main(): Promise<void> {
  const store = await getGraphStore();
  const artists = await store.findNodes({ label: "Artist", maxResults: 50000 });
  const persons = await store.findNodes({ label: "Person", maxResults: 50000 });

  const peopleByName = new Map<string, typeof persons>();
  for (const node of [...artists, ...persons]) {
    const key = normalizeName(node.properties.name ?? node.properties.title ?? node.id);
    if (!key) continue;
    const next = peopleByName.get(key) ?? [];
    next.push(node);
    peopleByName.set(key, next);
  }

  let mergedNodes = 0;
  let rewiredEdges = 0;
  for (const candidates of peopleByName.values()) {
    const artistCandidates = candidates.filter((node) => node.labels.includes("Artist"));
    const personCandidates = candidates.filter((node) => node.labels.includes("Person"));
    if (artistCandidates.length === 0 || personCandidates.length === 0) {
      continue;
    }

    const ranked = await Promise.all(
      candidates.map(async (node) => ({
        node,
        degree: await getNodeDegree(store, node.id),
      }))
    );
    ranked.sort((left, right) => right.degree - left.degree || left.node.id.localeCompare(right.node.id));
    const survivor = ranked[0]?.node;
    if (!survivor) continue;

    for (const duplicate of ranked.slice(1).map((item) => item.node)) {
      if (duplicate.id === survivor.id) continue;
      await store.updateNode(survivor.id, {
        labels: coerceArtistPersonIdentity([...survivor.labels, ...duplicate.labels]),
        properties: mergeProperties(survivor.properties, duplicate.properties),
        meta: {
          ...(survivor.meta ?? {}),
          mergedDuplicateIds: [...new Set([...(survivor.meta?.mergedDuplicateIds as string[] | undefined ?? []), duplicate.id])],
        },
      });
      rewiredEdges += await redirectEdges(store, duplicate.id, survivor.id);
      await store.deleteNode(duplicate.id, { cascade: false });
      mergedNodes += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        mergedNodes,
        rewiredEdges,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Failed to merge person/artist identities");
  console.error(error);
  process.exit(1);
});
