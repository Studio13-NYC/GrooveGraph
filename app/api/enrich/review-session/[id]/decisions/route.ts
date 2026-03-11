import { NextRequest, NextResponse } from "next/server";
import { updateReviewDecisions } from "@/enrichment";
import type { ReviewDecision } from "@/enrichment";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const body = await request.json();
    const decisions = Array.isArray(body?.decisions) ? (body.decisions as ReviewDecision[]) : [];
    const session = await updateReviewDecisions(context.params.id, decisions);
    return NextResponse.json({ status: "ok", session });
  } catch (error) {
    console.error("update-review-decisions", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update decisions" },
      { status: 500 }
    );
  }
}
