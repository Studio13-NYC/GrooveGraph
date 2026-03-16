import { NextRequest, NextResponse } from "next/server";
import { requireAdminResponseFromRequest } from "@/lib/auth";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/enrich
 * This shortcut route is intentionally disabled.
 * Enrichment must be started from the /enrichment review workflow.
 */
export async function POST(request: NextRequest) {
  const unauth = requireAdminResponseFromRequest(request);
  if (unauth) return unauth;
  return NextResponse.json(
    {
      error: "Direct enrichment is disabled. Start enrichment from the /enrichment workflow instead.",
    },
    { status: 410 }
  );
}
