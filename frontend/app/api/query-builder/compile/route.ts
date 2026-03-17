import { NextRequest, NextResponse } from "next/server";
import { createTraceLogger, resolveTraceId } from "@/lib/trace";
import { loadOntologyRuntime } from "@/ontology";
import {
  buildHumanSummary,
  compileQueryStateToCypher,
  getOntologyAwareNextOptions,
  type QueryState,
} from "@/query-builder";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isQueryNodeSelector(value: unknown): value is QueryState["start"] {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.label) &&
    isNonEmptyString(value.propertyKey) &&
    isString(value.value)
  );
}

function isQueryDirection(value: unknown): value is "outbound" | "inbound" {
  return value === "outbound" || value === "inbound";
}

function isQueryState(value: unknown): value is QueryState {
  if (!isRecord(value)) return false;
  const candidate = value;
  if (!isQueryNodeSelector(candidate.start)) return false;
  if (!Array.isArray(candidate.steps)) return false;
  for (const step of candidate.steps) {
    if (!isRecord(step)) return false;
    if (!isNonEmptyString(step.relationshipType)) return false;
    if (!isQueryDirection(step.direction)) return false;
    if (!isQueryNodeSelector(step.target)) return false;
  }
  return true;
}

export async function POST(request: NextRequest) {
  const traceId = resolveTraceId(request.headers);
  const trace = createTraceLogger(traceId, "api.query-builder.compile");
  const startedAt = Date.now();

  trace.log("request.received", { method: request.method, path: "/api/query-builder/compile" });
  try {
    const rawBody = await request.json().catch(() => ({}));
    const payload = rawBody as { queryState?: unknown };
    if (!("queryState" in payload)) {
      trace.log("request.missing-query-state", {});
      return NextResponse.json(
        {
          traceId,
          error: "Missing required field: queryState",
        },
        {
          status: 400,
          headers: {
            "x-trace-id": traceId,
          },
        }
      );
    }
    if (!isQueryState(payload.queryState)) {
      trace.log("request.invalid-query-state", {});
      return NextResponse.json(
        {
          traceId,
          error:
            "Invalid queryState payload. Expected shape: { start:{label,propertyKey,value}, steps:[{relationshipType,direction,target:{label,propertyKey,value}}], limit? }",
        },
        {
          status: 400,
          headers: {
            "x-trace-id": traceId,
          },
        }
      );
    }
    const queryState = payload.queryState;

    const ontology = loadOntologyRuntime();
    trace.log("ontology.loaded", {
      entityCount: ontology.entityLabels.length,
      relationshipCount: ontology.relationshipTypes.length,
    });

    const nextOptions = getOntologyAwareNextOptions(queryState, ontology);
    trace.log("query.next-options", { count: nextOptions.length });

    const compiled = compileQueryStateToCypher(queryState, ontology);
    trace.log("query.compiled", {
      cypherLength: compiled.cypher.length,
      paramCount: Object.keys(compiled.params).length,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        traceId,
        queryState,
        summary: buildHumanSummary(queryState),
        nextOptions,
        compiled,
        metrics: {
          durationMs: Date.now() - startedAt,
        },
      },
      {
        headers: {
          "x-trace-id": traceId,
        },
      }
    );
  } catch (error) {
    trace.log("request.failed", {
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        traceId,
        error: error instanceof Error ? error.message : "Failed to compile query state",
      },
      {
        status: 500,
        headers: {
          "x-trace-id": traceId,
        },
      }
    );
  }
}
