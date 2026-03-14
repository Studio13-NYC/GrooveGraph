import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildResearchPacket, getReviewSession } from "@/enrichment";
import { requireAdminResponse } from "@/lib/auth";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 60;
export function generateStaticParams() {
  return [];
}

type RouteContext = {
  params: { id: string };
};

export async function GET(_: Request, context: RouteContext) {
  const cookieStore = await cookies();
  const unauth = requireAdminResponse(cookieStore);
  if (unauth) return unauth;
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
