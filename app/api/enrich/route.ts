import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/enrich
 * Body: { type: "artist" | "album", id: string }
 * Stub: enrichment not yet implemented; returns a placeholder response.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const type = body?.type as string;
    const id = (body?.id ?? "").trim();

    if (!id || (type !== "artist" && type !== "album")) {
      return NextResponse.json(
        { error: "Missing or invalid type/id. Use { type: 'artist' | 'album', id: string }" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      status: "not_implemented",
      message: "Enrichment will attach external metadata (biography, genres, images) to this entity.",
      type,
      id,
    });
  } catch (e) {
    console.error("enrich", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Enrich failed" },
      { status: 500 }
    );
  }
}
