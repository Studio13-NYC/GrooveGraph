import { NextResponse } from "next/server";
import { buildResearchPacket, getReviewSession } from "@/enrichment";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const session = await getReviewSession(context.params.id);
    return NextResponse.json({
      status: "ok",
      session,
      researchPacket: buildResearchPacket(session),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Review session not found" },
      { status: 404 }
    );
  }
}
