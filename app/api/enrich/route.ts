import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/enrich
 * This shortcut route is intentionally disabled.
 * Enrichment must be started from the /enrichment review workflow.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    {
      error: "Direct enrichment is disabled. Start enrichment from the /enrichment workflow instead.",
    },
    { status: 410 }
  );
}
