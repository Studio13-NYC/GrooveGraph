import { NextRequest, NextResponse } from "next/server";
import { updateReviewDecisions } from "@/enrichment";
import type { ReviewDecision } from "@/enrichment";
import { requireAdminResponseFromRequest } from "@/lib/auth";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 60;
export function generateStaticParams() {
  return [];
}

type RouteContext = { params: { id: string } };

export async function POST(request: NextRequest, context: RouteContext) {
  const unauth = requireAdminResponseFromRequest(request);
  if (unauth) return unauth;
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
