import { NextRequest, NextResponse } from "next/server";
import { getGraphStore } from "@/load/persist-graph";
import { buildQueryResultPayload, resolveEntityNode } from "@/lib/exploration";
import { getEntityDescriptionNoun, getEntityDisplayName } from "@/lib/entity-config";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = await request.json();
    const entityType = String(body?.entityType ?? "Artist").trim() || "Artist";
    const query = String(body?.query ?? body?.artist ?? "").trim();
    if (!query) {
      return NextResponse.json(
        { error: `Missing or empty ${getEntityDescriptionNoun(entityType)} query` },
        { status: 400 }
      );
    }

    const store = await getGraphStore();
    const node = await resolveEntityNode(store, entityType, query);
    if (!node) {
      return NextResponse.json(
        { error: `No ${getEntityDescriptionNoun(entityType)} found`, query, entityType },
        { status: 404 }
      );
    }

    const result = await buildQueryResultPayload(store, node, query);

    return NextResponse.json({
      status: "ok",
      label: getEntityDisplayName(entityType),
      result,
      metrics: {
        durationMs: Date.now() - startedAt,
      },
    });
  } catch (e) {
    console.error("query-artist", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Query failed" },
      { status: 500 }
    );
  }
}
