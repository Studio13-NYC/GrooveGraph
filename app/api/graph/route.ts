import { NextRequest, NextResponse } from "next/server";
import { getGraphStore } from "@/load/persist-graph";
import {
  buildExplorationGraphPayload,
  resolveEntityNode,
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

    const graphPayload = await buildExplorationGraphPayload(store, seedNode);

    return NextResponse.json({
      ...graphPayload,
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
