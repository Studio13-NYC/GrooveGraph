import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { applyReviewSession } from "@/enrichment";
import { requireAdminResponse } from "@/lib/auth";
import { getGraphStore, persistGraphStore } from "@/load/persist-graph";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const unauth = requireAdminResponse(cookieStore);
  if (unauth) return unauth;
  try {
    const body = await request.json().catch(() => ({}));
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }
    const store = await getGraphStore();
    const session = await applyReviewSession(store, sessionId);
    await persistGraphStore();
    return NextResponse.json({ status: "ok", session });
  } catch (error) {
    console.error("apply-review-session", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply review session" },
      { status: 500 }
    );
  }
}
