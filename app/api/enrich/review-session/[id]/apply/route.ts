import { NextResponse } from "next/server";
import { applyReviewSession } from "@/enrichment";
import { getGraphStore, persistGraphStore } from "@/load/persist-graph";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(_: Request, context: RouteContext) {
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
