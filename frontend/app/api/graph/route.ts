import { appendFileSync } from "fs";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { getGraphStore, persistGraphStore } from "@/load/persist-graph";
import {
  buildExplorationGraphPayload,
  buildTripletScopedGraphPayload,
  resolveEntityNode,
} from "@/lib/exploration";
import { parseScopeSpec, parseTripletSpec } from "@/enrichment/triplet";
import { getAuthSessionFromRequest, isAdmin } from "@/lib/auth";
import { runEnrichByQuery } from "@/enrichment/enrich-by-query";
import { runEnsureTriplet } from "@/enrichment/ensure-triplet";
import { useLlmOnlyPipeline } from "@/enrichment/pipelines/llm-only";

const DEBUG_LOG = "debug-e8d527.log";
function debugLog(message: string, data: Record<string, unknown>) {
  try {
    const line = JSON.stringify({ sessionId: "e8d527", message, data, timestamp: Date.now() }) + "\n";
    appendFileSync(join(process.cwd(), DEBUG_LOG), line);
  } catch {
    /* ignore */
  }
}

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
  const { searchParams } = new URL(request.url);
  const origin = request.headers.get("origin") ?? "(none)";
  console.log("[graph-api] GET entry", {
    entityType: searchParams.get("entityType"),
    query: searchParams.get("query"),
    random: searchParams.get("random"),
    origin,
  });
  try {
    const tripletSpec = searchParams.get("triplet")?.trim();
    const scopeSpec = searchParams.get("scope")?.trim();
    const store = await getGraphStore();

    if (tripletSpec && scopeSpec) {
      // #region agent log
      debugLog("triplet branch", { tripletSpec, scopeSpec });
      // #endregion
      const triplet = parseTripletSpec(tripletSpec);
      const scope = parseScopeSpec(scopeSpec);
      if (!triplet || !scope) {
        debugLog("triplet parse failed", { tripletSpec, scopeSpec, triplet: !!triplet, scope: !!scope });
        console.log("[graph-api] triplet/scope parse failed", { tripletSpec, scopeSpec, triplet: !!triplet, scope: !!scope });
        return NextResponse.json(
          { error: "Invalid triplet or scope. Use triplet=Subject:name+REL+Object:name and scope=Label:name" },
          { status: 400 }
        );
      }
      console.log("[graph-api] triplet+scope request", {
        subjectLabel: triplet.subject.label,
        relationship: triplet.relationship,
        objectLabel: triplet.object.label,
        scopeLabel: scope.label,
        scopeName: scope.name,
      });
      let scopeNode = await resolveEntityNode(store, scope.label, scope.name);
      // #region agent log
      debugLog("scope resolve", { scopeLabel: scope.label, scopeName: scope.name, scopeFound: !!scopeNode, scopeNodeId: scopeNode?.id });
      // #endregion
      if (!scopeNode) {
        const session = getAuthSessionFromRequest(request);
        const admin = isAdmin(session);
        const llmOnly = useLlmOnlyPipeline();
        const canEnrichByQuery = !admin && llmOnly;
        // #region agent log
        debugLog("scope missing check", { isAdmin: admin, useLlmOnlyPipeline: llmOnly, canEnrichByQuery });
        // #endregion
        if (canEnrichByQuery) {
          try {
            console.log("[graph-api] triplet scope missing – running enrich-by-query for scope", { scope });
            await runEnrichByQuery(store, scope.label, scope.name);
            await persistGraphStore();
            scopeNode = await resolveEntityNode(store, scope.label, scope.name);
            debugLog("enrich-by-query done", { scopeFoundAfter: !!scopeNode });
          } catch (err) {
            debugLog("enrich-by-query error", { error: err instanceof Error ? err.message : String(err) });
            console.error("[graph-api] enrich-by-query for triplet scope failed", err);
          }
        }
        if (!scopeNode) {
          console.log("[graph-api] triplet scope not found – no node for scope in graph", { scope });
          return NextResponse.json({ nodes: [], links: [] });
        }
      }
      let graphPayload = await buildTripletScopedGraphPayload(store, triplet, scopeNode);
      // #region agent log
      debugLog("triplet result", { nodeCount: graphPayload.nodes.length, linkCount: graphPayload.links.length, scopeNodeId: scopeNode.id });
      // #endregion
      const isEmptyResult = graphPayload.nodes.length <= 1 && graphPayload.links.length === 0;
      if (isEmptyResult && useLlmOnlyPipeline()) {
        try {
          console.log("[graph-api] triplet result empty – running ensure-triplet discovery", { tripletSpec, scopeSpec });
          debugLog("ensure-triplet start", { tripletSpec, scopeSpec });
          await runEnsureTriplet(store, tripletSpec, scopeSpec);
          await persistGraphStore();
          graphPayload = await buildTripletScopedGraphPayload(store, triplet, scopeNode);
          debugLog("triplet result after ensure", { nodeCount: graphPayload.nodes.length, linkCount: graphPayload.links.length });
        } catch (err) {
          debugLog("ensure-triplet error", { error: err instanceof Error ? err.message : String(err) });
          console.error("[graph-api] ensure-triplet failed", err);
        }
      }
      console.log("[graph-api] triplet result", {
        triplet: tripletSpec,
        scope: scopeSpec,
        scopeNodeId: scopeNode.id,
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

    let seedNode = await resolveEntityNode(store, entityType, query);
    if (!seedNode) {
      const session = getAuthSessionFromRequest(request);
      const canEnrichByQuery = !isAdmin(session) && useLlmOnlyPipeline();
      if (canEnrichByQuery) {
        try {
          await runEnrichByQuery(store, entityType, query);
          await persistGraphStore();
          seedNode = await resolveEntityNode(store, entityType, query);
        } catch (err) {
          console.error("[graph-api] enrich-by-query failed", err);
          return NextResponse.json(
            { error: err instanceof Error ? err.message : "Enrichment failed" },
            { status: 500 }
          );
        }
      }
      if (!seedNode) {
        console.log("[graph-api] no seed found", { entityType, query });
        return NextResponse.json({ nodes: [], links: [] });
      }
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
