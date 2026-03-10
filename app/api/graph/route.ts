import { NextRequest, NextResponse } from "next/server";
import { getGraphStore } from "@/load/persist-graph";
import { Neo4jGraphStore } from "@/store";
import {
  collectNodeNeighborhood,
  resolveEntityNode,
  toGraphLinkPayload,
  toGraphNodePayload,
} from "@/lib/exploration";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/graph?entityType=Artist&query=Name | ?artist=Name | ?random=1
 * Returns { nodes, links, focusNodeId } for force-graph.
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const legacyArtistQuery = searchParams.get("artist")?.trim();
    const entityType = searchParams.get("entityType")?.trim() || (legacyArtistQuery ? "Artist" : "Artist");
    let query = searchParams.get("query")?.trim() || legacyArtistQuery || "";
    const store = await getGraphStore();
    if (!query && searchParams.get("random")) {
      const all = await store.findNodes({ label: entityType, maxResults: 10000 });
      if (all.length > 0) {
        const idx = Math.floor(Math.random() * all.length);
        query =
          String(
            all[idx].properties.name ??
              all[idx].properties.title ??
              all[idx].properties.venue ??
              all[idx].id
          );
      }
    }

    if (!query) {
      return NextResponse.json({ nodes: [], links: [] });
    }

    const seedNode = await resolveEntityNode(store, entityType, query);
    if (!seedNode) {
      return NextResponse.json({ nodes: [], links: [] });
    }

    const subgraph =
      store instanceof Neo4jGraphStore
        ? await store.getNodeSubgraph(seedNode.id)
        : await collectNodeNeighborhood(store, seedNode.id);

    return NextResponse.json({
      nodes: subgraph.nodes.map((node) => toGraphNodePayload(node)),
      links: subgraph.edges.map((edge) => toGraphLinkPayload(edge)),
      focusNodeId: seedNode.id,
      metrics: {
        durationMs: Date.now() - startedAt,
      },
    });
  } catch (e) {
    console.error("graph", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Graph failed" },
      { status: 500 }
    );
  }
}
