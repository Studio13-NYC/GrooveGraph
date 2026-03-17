import { NextRequest, NextResponse } from "next/server";
import { createTraceLogger, resolveTraceId } from "@/lib/trace";
import { loadOntologyRuntime } from "@/ontology";
import {
  appendQueryInsight,
  buildHumanSummary,
  compileQueryStateToCypher,
  getOntologyAwareNextOptions,
  interpretQueryPrompt,
} from "@/query-builder";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const traceId = resolveTraceId(request.headers);
  const trace = createTraceLogger(traceId, "api.query-builder.interpret");
  const startedAt = Date.now();
  let promptForLog = "";

  trace.log("request.received", { method: request.method, path: "/api/query-builder/interpret" });
  try {
    const rawBody = await request.json().catch(() => ({}));
    const prompt = typeof rawBody?.prompt === "string" ? rawBody.prompt : "";
    promptForLog = prompt;
    if (!prompt.trim()) {
      return NextResponse.json(
        {
          traceId,
          error: "Missing required field: prompt",
        },
        { status: 400, headers: { "x-trace-id": traceId } }
      );
    }

    const ontology = loadOntologyRuntime();
    const interpretation = await interpretQueryPrompt(prompt, ontology);
    trace.log("interpretation.completed", {
      strategy: interpretation.strategy,
      usedInsightCount: interpretation.usedInsightIds.length,
    });

    const compiled = compileQueryStateToCypher(interpretation.queryState, ontology);
    const nextOptions = getOntologyAwareNextOptions(interpretation.queryState, ontology);
    const summary = buildHumanSummary(interpretation.queryState);

    appendQueryInsight({
      prompt,
      strategy: interpretation.strategy,
      success: true,
      traceId,
      note: interpretation.rationale,
      queryState: interpretation.queryState,
    });

    return NextResponse.json(
      {
        traceId,
        strategy: interpretation.strategy,
        rationale: interpretation.rationale,
        usedInsightIds: interpretation.usedInsightIds,
        queryState: interpretation.queryState,
        summary,
        nextOptions,
        compiled,
        metrics: {
          durationMs: Date.now() - startedAt,
        },
      },
      { headers: { "x-trace-id": traceId } }
    );
  } catch (error) {
    if (promptForLog.trim()) {
      appendQueryInsight({
        prompt: promptForLog,
        strategy: "failed",
        success: false,
        traceId,
        note: error instanceof Error ? error.message : String(error),
      });
    }
    trace.log("request.failed", {
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        traceId,
        error: error instanceof Error ? error.message : "Failed to interpret query prompt",
      },
      { status: 500, headers: { "x-trace-id": traceId } }
    );
  }
}
