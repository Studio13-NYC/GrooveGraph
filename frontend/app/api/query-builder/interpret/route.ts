import { NextRequest, NextResponse } from "next/server";
import { createTraceLogger, resolveTraceId } from "@/lib/trace";
import { loadOntologyRuntime } from "@/ontology";
import {
  appendQueryInsight,
  buildHumanSummary,
  compileQueryStateToCypher,
  getOntologyAwareNextOptions,
  interpretQueryPrompt,
  synthesizeResearchAnswer,
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
      proposedNodeCount: interpretation.proposedAdditions?.nodes.length ?? 0,
      proposedRelationshipCount: interpretation.proposedAdditions?.relationships.length ?? 0,
    });

    let compiled: { cypher: string; params: Record<string, unknown> };
    let compileBlockedReason: string | undefined;
    try {
      compiled = compileQueryStateToCypher(interpretation.queryState, ontology);
    } catch (error) {
      compileBlockedReason = error instanceof Error ? error.message : String(error);
      compiled = {
        cypher: "-- compile blocked due to ontology-invalid interpreted relationship; see diagnostics --",
        params: {},
      };
      trace.log("compile.blocked", { reason: compileBlockedReason });
    }
    const nextOptions = getOntologyAwareNextOptions(interpretation.queryState, ontology);
    const summary = buildHumanSummary(interpretation.queryState);
    const research = await synthesizeResearchAnswer({
      prompt,
      queryState: interpretation.queryState,
      ontology,
      trace,
    });
    const unavailable = interpretation.diagnostics?.unavailableRelationships ?? [];
    const unavailableNote =
      unavailable.length > 0
        ? `\n\nProposed unavailable relationships:\n${unavailable
            .map(
              (item) =>
                `- ${item.fromLabel} ${item.direction === "outbound" ? "->" : "<-"} ${item.relationshipType} -> ${item.toLabel} (allowed targets: ${
                  item.allowedTargets.join(", ") || "none"
                })`
            )
            .join("\n")}`
        : "";

    const mergedNodes = new Map<string, { label: string; value: string; canonicalKey: string }>();
    for (const node of interpretation.proposedAdditions?.nodes ?? []) {
      mergedNodes.set(node.canonicalKey, node);
    }
    for (const node of research?.proposedAdditions.nodes ?? []) {
      mergedNodes.set(node.canonicalKey, node);
    }
    const mergedRels = new Map<
      string,
      {
        type: string;
        fromCanonicalKey: string;
        toCanonicalKey: string;
        direction: "outbound" | "inbound";
        canonicalKey: string;
      }
    >();
    for (const rel of interpretation.proposedAdditions?.relationships ?? []) {
      mergedRels.set(rel.canonicalKey, rel);
    }
    for (const rel of research?.proposedAdditions.relationships ?? []) {
      mergedRels.set(rel.canonicalKey, rel);
    }

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
        answerMarkdown: `${research.answerMarkdown}${unavailableNote}`,
        answerStrategy: research.strategy,
        usedInsightIds: interpretation.usedInsightIds,
        diagnostics: interpretation.diagnostics,
        compileBlockedReason,
        proposedAdditions: {
          nodes: [...mergedNodes.values()],
          relationships: [...mergedRels.values()],
        },
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
    const message = error instanceof Error ? error.message : String(error);
    const status =
      /valid ontology|unknown|cannot connect|prompt could not be mapped/i.test(message) ? 422 : 500;
    return NextResponse.json(
      {
        traceId,
        error: message,
      },
      { status, headers: { "x-trace-id": traceId } }
    );
  }
}
