import { NextRequest, NextResponse } from "next/server";
import { getGraphStore } from "@/load/persist-graph";
import {
  buildExplorationGraphPayload,
  buildTripletScopedGraphPayload,
  resolveEntityNode,
} from "@/lib/exploration";
import { parseScopeSpec, parseTripletSpec } from "@/enrichment/triplet";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/graph
 * - entityType=Artist&query=Name | ?artist=Name | ?random=1  → single-entity neighborhood
 * - triplet=Album:any+CONTAINS+Track:any&scope=Artist:Paul+Weller → triplet-scoped subgraph
 * Returns { nodes, links, focusNodeId } for force-graph.
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const tripletSpec = searchParams.get("triplet")?.trim();
    const scopeSpec = searchParams.get("scope")?.trim();
    const store = await getGraphStore();

    if (tripletSpec && scopeSpec) {
      const triplet = parseTripletSpec(tripletSpec);
      const scope = parseScopeSpec(scopeSpec);
      if (!triplet || !scope) {
        return NextResponse.json(
          { error: "Invalid triplet or scope. Use triplet=Subject:name+REL+Object:name and scope=Label:name" },
          { status: 400 }
        );
      }
      const scopeNode = await resolveEntityNode(store, scope.label, scope.name);
      if (!scopeNode) {
        console.log("[graph-api] triplet scope not found", { scope });
        return NextResponse.json({ nodes: [], links: [] });
      }
      const graphPayload = await buildTripletScopedGraphPayload(store, triplet, scopeNode);
      console.log("[graph-api] triplet", {
        triplet: tripletSpec,
        scope: scopeSpec,
        nodeCount: graphPayload.nodes.length,
        linkCount: graphPayload.links.length,
      });
      return NextResponse.json({
        ...graphPayload,
        metrics: { durationMs: Date.now() - startedAt },
      });
    }

    const legacyArtistQuery = searchParams.get("artist")?.trim();
    const entityType = searchParams.get("entityType")?.trim() || (legacyArtistQuery ? "Artist" : "Artist");
    let query = searchParams.get("query")?.trim() || legacyArtistQuery || "";
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
      console.log("[graph-api] no seed found", { entityType, query });
      return NextResponse.json({ nodes: [], links: [] });
    }

    const graphPayload = await buildExplorationGraphPayload(store, seedNode);
    const relatedTypes = [...new Set(graphPayload.nodes.filter((n) => n.groupKey).map((n) => n.groupKey))];
    console.log("[graph-api]", {
      entityType,
      query,
      seedId: seedNode.id,
      seedName: (seedNode.properties?.name as string) ?? seedNode.id,
      nodeCount: graphPayload.nodes.length,
      linkCount: graphPayload.links.length,
      relatedEntityTypes: relatedTypes,
    });

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
