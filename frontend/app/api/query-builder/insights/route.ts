import { NextRequest, NextResponse } from "next/server";
import { createTraceLogger, resolveTraceId } from "@/lib/trace";
import { loadQueryInsights } from "@/query-builder";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const traceId = resolveTraceId(request.headers);
  const trace = createTraceLogger(traceId, "api.query-builder.insights");
  trace.log("request.received", { method: request.method, path: "/api/query-builder/insights" });

  const insights = loadQueryInsights().slice(0, 20);
  trace.log("insights.loaded", { count: insights.length });

  return NextResponse.json(
    {
      traceId,
      insights,
    },
    {
      headers: {
        "x-trace-id": traceId,
      },
    }
  );
}
