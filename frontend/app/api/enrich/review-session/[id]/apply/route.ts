import { NextResponse } from "next/server";
import { applyReviewSession } from "@/enrichment";
import { requireAdminResponseFromRequest } from "@/lib/auth";
import { getGraphStore, persistGraphStore } from "@/load/persist-graph";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 60;
export function generateStaticParams() {
  return [];
}

type RouteContext = { params: { id: string } };

export async function POST(request: Request, context: RouteContext) {
  const unauth = requireAdminResponseFromRequest(request);
  if (unauth) return unauth;
  try {
    const store = await getGraphStore();
    const session = await applyReviewSession(store, context.params.id);
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
