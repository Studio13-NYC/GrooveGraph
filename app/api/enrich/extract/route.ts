import { NextRequest, NextResponse } from "next/server";
import { POST as exploreTripletPost } from "../explore-triplet/route";
import type { EnrichmentWorkflowType } from "@/enrichment/types";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

function normalizeWorkflowType(value: unknown): EnrichmentWorkflowType | null {
  if (value === "triplet" || value === "span_mention" || value === "llm_only" || value === "hybrid") {
    return value;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const workflowType = normalizeWorkflowType(body?.workflowType);
    if (!workflowType) {
      return NextResponse.json(
        {
          error:
            "Missing or invalid workflowType. Supported values: triplet, span_mention, llm_only, hybrid.",
        },
        { status: 400 }
      );
    }

    if (workflowType !== "triplet") {
      return NextResponse.json(
        {
          error: `workflowType '${workflowType}' is not implemented yet. Use workflowType: 'triplet' for now.`,
        },
        { status: 400 }
      );
    }

    const delegatedRequest = new NextRequest(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({
        triplet: body?.triplet,
        ...(typeof body?.scope === "string" && body.scope.trim() ? { scope: body.scope.trim() } : {}),
      }),
    });

    return await exploreTripletPost(delegatedRequest);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to run generic enrichment extract route.",
      },
      { status: 500 }
    );
  }
}
