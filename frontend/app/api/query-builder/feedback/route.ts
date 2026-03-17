import { NextRequest, NextResponse } from "next/server";
import { createTraceLogger, resolveTraceId } from "@/lib/trace";
import { recordQueryInsightFeedback } from "@/query-builder";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const traceId = resolveTraceId(request.headers);
  const trace = createTraceLogger(traceId, "api.query-builder.feedback");
  const body = (await request.json().catch(() => ({}))) as {
    targetTraceId?: unknown;
    rating?: unknown;
    context?: unknown;
    wasEmpty?: unknown;
    note?: unknown;
  };

  const targetTraceId = typeof body.targetTraceId === "string" ? body.targetTraceId.trim() : "";
  const ratingRaw = body.rating;
  const context = body.context === "execute" ? "execute" : body.context === "interpret" ? "interpret" : null;
  const rating = ratingRaw === 1 || ratingRaw === -1 ? ratingRaw : null;

  if (!targetTraceId || !context || !rating) {
    return NextResponse.json(
      {
        traceId,
        error: "Invalid payload. Expected { targetTraceId, rating: 1|-1, context: 'interpret'|'execute', wasEmpty?, note? }.",
      },
      { status: 400, headers: { "x-trace-id": traceId } }
    );
  }

  const entry = recordQueryInsightFeedback({
    traceId: targetTraceId,
    rating,
    context,
    wasEmpty: body.wasEmpty === true,
    note: typeof body.note === "string" ? body.note.trim() : undefined,
  });

  trace.log("feedback.recorded", {
    targetTraceId,
    context,
    rating,
    wasEmpty: body.wasEmpty === true,
  });

  return NextResponse.json(
    {
      traceId,
      feedback: entry,
    },
    { headers: { "x-trace-id": traceId } }
  );
}
