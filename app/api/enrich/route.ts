import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdminResponse } from "@/lib/auth";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/enrich
 * This shortcut route is intentionally disabled.
 * Enrichment must be started from the /enrichment review workflow.
 */
export async function POST(_request: NextRequest) {
  const cookieStore = await cookies();
  const unauth = requireAdminResponse(cookieStore);
  if (unauth) return unauth;
  return NextResponse.json(
    {
      error: "Direct enrichment is disabled. Start enrichment from the /enrichment workflow instead.",
    },
    { status: 410 }
  );
}
