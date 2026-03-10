import { NextRequest, NextResponse } from "next/server";
import { getGraphStore, persistGraphStore } from "@/load/persist-graph";
import { runEnrichmentPipeline } from "@/enrichment/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/enrich
 * Body: { type: "artist" | "album", id?: string, name?: string }
 * If name is provided (e.g. "The Who") and type is "artist", resolves artist by name and enriches that node.
 * Otherwise id is required. Runs enrichment pipeline, then persists the graph so data is saved.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const type = body?.type as string;
    let id = (body?.id ?? "").trim();
    const name = (body?.name ?? "").trim();

    if (type !== "artist" && type !== "album") {
      return NextResponse.json(
        { error: "Invalid type. Use { type: 'artist' | 'album', id: string } or { type: 'artist', name: string }" },
        { status: 400 }
      );
    }

    const store = await getGraphStore();

    if (type === "artist" && name && !id) {
      const artists = await store.findNodes({ label: "Artist", maxResults: 5000 });
      const byName = artists.find(
        (n) => String(n.properties?.name ?? "").toLowerCase() === name.toLowerCase()
      );
      if (!byName) {
        return NextResponse.json(
          { error: `No artist found with name "${name}"` },
          { status: 404 }
        );
      }
      id = byName.id;
    }

    if (!id) {
      return NextResponse.json(
        { error: "Missing id or name. Use id or name (for artist)." },
        { status: 400 }
      );
    }

    const result = await runEnrichmentPipeline(store, id);
    await persistGraphStore();

    return NextResponse.json({
      status: "ok",
      message: "Enrichment applied and graph saved.",
      type,
      id: result.nodeId,
      sourcesUsed: result.sourcesUsed,
      propertiesAdded: result.propertiesAdded,
      confidence: result.confidence,
      nodesCreated: result.nodesCreated,
      edgesCreated: result.edgesCreated,
    });
  } catch (e) {
    console.error("enrich", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Enrich failed" },
      { status: 500 }
    );
  }
}
