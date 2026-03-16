import { NextRequest, NextResponse } from "next/server";
import { runEnsureTriplet } from "@/enrichment/ensure-triplet";
import { parseScopeSpec, parseTripletSpec } from "@/enrichment";
import { requireAdminResponseFromRequest } from "@/lib/auth";
import { getGraphStore, persistGraphStore } from "@/load/persist-graph";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 120;

const LOG_PREFIX = "[ensure-triplet]";

/**
 * POST /api/graph/ensure-triplet
 * Runs LLM discovery for the triplet+scope (e.g. Album:Stanley Road CONTAINS Song:any, scope Artist:Paul Weller),
 * then applies the resulting nodes and CONTAINS edges to the graph so the exploration view shows album and songs.
 * Admin-only. Call before loading the triplet-scoped graph when you want to discover and persist missing data.
 */
export async function POST(request: NextRequest) {
  const unauth = requireAdminResponseFromRequest(request);
  if (unauth) return unauth;
  try {
    const body = await request.json().catch(() => ({}));
    const tripletSpec = typeof body?.triplet === "string" ? body.triplet.trim() : "";
    const scopeSpec = typeof body?.scope === "string" ? body.scope.trim() : "";
    if (!tripletSpec || !scopeSpec) {
      return NextResponse.json(
        { error: "Missing triplet or scope. Send { triplet: \"Album:Stanley Road CONTAINS Track:any\", scope: \"Artist:Paul Weller\" }." },
        { status: 400 }
      );
    }

    if (!parseTripletSpec(tripletSpec) || !parseScopeSpec(scopeSpec)) {
      return NextResponse.json(
        { error: "Invalid triplet or scope format." },
        { status: 400 }
      );
    }

    const store = await getGraphStore();
    const result = await runEnsureTriplet(store, tripletSpec, scopeSpec);
    await persistGraphStore();

    console.log(`${LOG_PREFIX} applied session=${result.sessionId} nodes=${result.nodeCount} edges=${result.edgeCount}`);

    return NextResponse.json({
      status: "ok",
      applied: true,
      sessionId: result.sessionId,
      nodeCount: result.nodeCount,
      edgeCount: result.edgeCount,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ensure triplet failed." },
      { status: 500 }
    );
  }
}
