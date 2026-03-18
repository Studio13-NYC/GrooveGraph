import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
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

type ConversationMode = "new_intent" | "clarification";
type ClarificationAnswer = { questionId: string; answer: string };
type LlmState = { conversationId?: string; previousResponseId?: string };
type SessionState = {
  sessionId: string;
  rootPrompt: string;
  clarificationAnswers: ClarificationAnswer[];
  pendingQuestionId?: string;
  pendingQuestionPrompt?: string;
  llmState?: LlmState;
  updatedAt: number;
};

const sessionStore = new Map<string, SessionState>();

type GraphNodePayload = {
  id: string;
  label: string;
  name: string;
  labels?: string[];
  nodeKind?: "focus" | "entity";
  entityLabel?: string;
};

type GraphLinkPayload = {
  source: string;
  target: string;
  type: string;
};

function buildLlmGraphPayload(params: {
  start: { label: string; value: string };
  proposedNodes: Array<{ label: string; value: string; canonicalKey: string }>;
  proposedRelationships: Array<{
    type: string;
    fromCanonicalKey: string;
    toCanonicalKey: string;
    direction: "outbound" | "inbound";
  }>;
}): { nodes: GraphNodePayload[]; links: GraphLinkPayload[]; focusNodeId: string } | null {
  if (params.proposedNodes.length === 0 && params.proposedRelationships.length === 0) return null;

  const nodeMap = new Map<string, GraphNodePayload>();
  const startCanonicalKey = `${params.start.label}:${params.start.value.toLowerCase()}`;
  let focusNodeId: string | null = null;
  for (const node of params.proposedNodes) {
    const isFocus = node.canonicalKey === startCanonicalKey;
    if (isFocus) focusNodeId = node.canonicalKey;
    nodeMap.set(node.canonicalKey, {
      id: node.canonicalKey,
      label: node.label,
      name: node.value,
      labels: [node.label],
      nodeKind: isFocus ? "focus" : "entity",
      entityLabel: node.label,
    });
  }

  if (!focusNodeId) {
    focusNodeId = `focus:${params.start.label}:${params.start.value}`;
    nodeMap.set(focusNodeId, {
      id: focusNodeId,
      label: params.start.label,
      name: params.start.value,
      labels: [params.start.label],
      nodeKind: "focus",
      entityLabel: params.start.label,
    });
  }

  const links: GraphLinkPayload[] = [];
  for (const rel of params.proposedRelationships) {
    const source = rel.direction === "outbound" ? rel.fromCanonicalKey : rel.toCanonicalKey;
    const target = rel.direction === "outbound" ? rel.toCanonicalKey : rel.fromCanonicalKey;
    if (!nodeMap.has(source)) {
      nodeMap.set(source, {
        id: source,
        label: "Entity",
        name: source,
        labels: ["Entity"],
        nodeKind: "entity",
        entityLabel: "Entity",
      });
    }
    if (!nodeMap.has(target)) {
      nodeMap.set(target, {
        id: target,
        label: "Entity",
        name: target,
        labels: ["Entity"],
        nodeKind: "entity",
        entityLabel: "Entity",
      });
    }
    links.push({ source, target, type: rel.type });
  }

  const focusConnected = links.some((link) => link.source === focusNodeId || link.target === focusNodeId);
  if (!focusConnected && params.proposedNodes.length > 0) {
    links.push({
      source: focusNodeId,
      target: params.proposedNodes[0].canonicalKey,
      type: "PROPOSED",
    });
  }

  return {
    nodes: [...nodeMap.values()],
    links,
    focusNodeId,
  };
}

function buildEffectivePrompt(state: SessionState): string {
  if (state.clarificationAnswers.length === 0) return state.rootPrompt;
  const clarificationText = state.clarificationAnswers
    .map((item, index) => `Clarification ${index + 1}: ${item.answer}`)
    .join("\n");
  return `${state.rootPrompt}\n${clarificationText}`;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildQuestionId(question: string, options?: string[]): string {
  const normalizedQuestion = normalizeToken(question);
  const normalizedOptions = (options ?? []).map((item) => normalizeToken(item)).join("|");
  return `${normalizedQuestion}::${normalizedOptions}`;
}

function trimSessions(maxAgeMs = 2 * 60 * 60 * 1000): void {
  const now = Date.now();
  for (const [key, state] of sessionStore.entries()) {
    if (now - state.updatedAt > maxAgeMs) sessionStore.delete(key);
  }
}

export async function POST(request: NextRequest) {
  const traceId = resolveTraceId(request.headers);
  const trace = createTraceLogger(traceId, "api.query-builder.interpret");
  const startedAt = Date.now();
  let promptForLog = "";

  trace.log("request.received", { method: request.method, path: "/api/query-builder/interpret" });
  try {
    trimSessions();
    const rawBody = await request.json().catch(() => ({}));
    const mode: ConversationMode =
      rawBody?.mode === "clarification" || rawBody?.mode === "new_intent"
        ? rawBody.mode
        : typeof rawBody?.clarification === "string" && rawBody.clarification.trim()
          ? "clarification"
          : "new_intent";
    const userMessage =
      typeof rawBody?.userMessage === "string"
        ? rawBody.userMessage
        : mode === "clarification" && typeof rawBody?.clarification === "string"
          ? rawBody.clarification
          : typeof rawBody?.prompt === "string"
            ? rawBody.prompt
            : "";
    const requestedSessionId = typeof rawBody?.sessionId === "string" ? rawBody.sessionId.trim() : "";
    const pendingQuestionId = typeof rawBody?.pendingQuestionId === "string" ? rawBody.pendingQuestionId.trim() : "";
    const incomingLlmState =
      rawBody?.llmState && typeof rawBody.llmState === "object"
        ? {
            conversationId:
              typeof rawBody.llmState.conversationId === "string" ? rawBody.llmState.conversationId : undefined,
            previousResponseId:
              typeof rawBody.llmState.previousResponseId === "string"
                ? rawBody.llmState.previousResponseId
                : undefined,
          }
        : undefined;

    const sessionId = requestedSessionId || randomUUID();
    const current =
      sessionStore.get(sessionId) ??
      ({
        sessionId,
        rootPrompt: "",
        clarificationAnswers: [],
        updatedAt: Date.now(),
      } satisfies SessionState);
    const normalizedMessage = userMessage.trim();
    if (!normalizedMessage) {
      return NextResponse.json(
        {
          traceId,
          error: "Missing required field: prompt",
        },
        { status: 400, headers: { "x-trace-id": traceId } }
      );
    }

    let nextState: SessionState;
    if (mode === "new_intent" || !current.rootPrompt.trim()) {
      nextState = {
        sessionId,
        rootPrompt: normalizedMessage,
        clarificationAnswers: [],
        pendingQuestionId: undefined,
        pendingQuestionPrompt: undefined,
        llmState: incomingLlmState,
        updatedAt: Date.now(),
      };
    } else {
      const answers = [...current.clarificationAnswers];
      if (pendingQuestionId && normalizedMessage) {
        const existing = answers.find((item) => item.questionId === pendingQuestionId);
        if (existing) {
          existing.answer = normalizedMessage;
        } else {
          answers.push({ questionId: pendingQuestionId, answer: normalizedMessage });
        }
      } else if (normalizedMessage) {
        answers.push({ questionId: `freeform_${answers.length + 1}`, answer: normalizedMessage });
      }
      nextState = {
        ...current,
        clarificationAnswers: answers,
        llmState: incomingLlmState ?? current.llmState,
        updatedAt: Date.now(),
      };
    }

    const effectivePrompt = buildEffectivePrompt(nextState);
    promptForLog = effectivePrompt;

    const ontology = loadOntologyRuntime();
    const interpretStartedAt = Date.now();
    const interpretation = await interpretQueryPrompt(effectivePrompt, ontology, {
      llmState: nextState.llmState,
    });
    const interpretDurationMs = Date.now() - interpretStartedAt;
    if (interpretation.llmState) {
      nextState.llmState = interpretation.llmState;
    }
    sessionStore.set(sessionId, nextState);
    trace.log("interpretation.completed", {
      strategy: interpretation.strategy,
      usedInsightCount: interpretation.usedInsightIds.length,
      proposedNodeCount: interpretation.proposedAdditions?.nodes.length ?? 0,
      proposedRelationshipCount: interpretation.proposedAdditions?.relationships.length ?? 0,
      needsFollowUp: interpretation.needsFollowUp === true,
    });
    if (interpretation.needsFollowUp || !interpretation.queryState) {
      const followUpQuestion =
        interpretation.followUpQuestion?.trim() || "I need one clarification before mapping this intent.";
      const followUpOptions = interpretation.followUpOptions ?? [];
      const questionId = buildQuestionId(followUpQuestion, followUpOptions);
      nextState.pendingQuestionId = questionId;
      nextState.pendingQuestionPrompt = followUpQuestion;
      nextState.updatedAt = Date.now();
      sessionStore.set(sessionId, nextState);
      appendQueryInsight({
        prompt: effectivePrompt,
        strategy: interpretation.strategy,
        success: false,
        traceId,
        note: followUpQuestion ?? interpretation.rationale,
      });
      return NextResponse.json(
        {
          sessionId,
          llmState: nextState.llmState,
          traceId,
          strategy: interpretation.strategy,
          rationale: interpretation.rationale,
          needsFollowUp: true,
          followUpQuestion,
          followUpOptions,
          question: {
            id: questionId,
            prompt: followUpQuestion,
            options: followUpOptions,
            expects: "clarification",
          },
          relationshipNamingSuggestion: interpretation.relationshipNamingSuggestion,
          diagnostics: interpretation.diagnostics,
          usedInsightIds: interpretation.usedInsightIds,
          summary: "Need clarification before mapping intent.",
          metrics: {
            durationMs: Date.now() - startedAt,
          },
        },
        { headers: { "x-trace-id": traceId } }
      );
    }

    let compiled: { cypher: string; params: Record<string, unknown> };
    let compileBlockedReason: string | undefined;
    const compileStartedAt = Date.now();
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
    const compileDurationMs = Date.now() - compileStartedAt;
    const nextOptions = getOntologyAwareNextOptions(interpretation.queryState, ontology);
    const summary = buildHumanSummary(interpretation.queryState);
    const research = await synthesizeResearchAnswer({
      prompt: effectivePrompt,
      queryState: interpretation.queryState,
      ontology,
      trace,
      llmState: nextState.llmState,
    });
    if (research.llmState) {
      nextState.llmState = research.llmState;
    }
    const researchMetrics = research.stageMetrics;
    const unavailable = interpretation.diagnostics?.unavailableRelationships ?? [];
    const ontologyDiagnostics = interpretation.diagnostics?.ontologyValidationDiagnostics ?? [];
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
    const ontologyDiagnosticsNote =
      ontologyDiagnostics.length > 0
        ? `\n\nOntology validation checks:\n${ontologyDiagnostics
            .map((item) => {
              const atStep = typeof item.stepIndex === "number" ? ` (step ${item.stepIndex + 1})` : "";
              const allowed =
                item.allowedTargets && item.allowedTargets.length > 0
                  ? ` Allowed targets: ${item.allowedTargets.join(", ")}.`
                  : "";
              return `- [${item.code}]${atStep} ${item.message}${allowed}`;
            })
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
      prompt: effectivePrompt,
      strategy: interpretation.strategy,
      success: !compileBlockedReason,
      traceId,
      note: compileBlockedReason
        ? `${interpretation.rationale} | compile_blocked: ${compileBlockedReason}`
        : interpretation.rationale,
      queryState: interpretation.queryState,
    });
    nextState.pendingQuestionId = undefined;
    nextState.pendingQuestionPrompt = undefined;
    nextState.updatedAt = Date.now();
    sessionStore.set(sessionId, nextState);

    return NextResponse.json(
      {
        sessionId,
        llmState: nextState.llmState,
        traceId,
        strategy: interpretation.strategy,
        rationale: interpretation.rationale,
        answerMarkdown: `${research.answerMarkdown}${unavailableNote}${ontologyDiagnosticsNote}`,
        answerStrategy: research.strategy,
        usedInsightIds: interpretation.usedInsightIds,
        diagnostics: interpretation.diagnostics,
        compileBlockedReason,
        proposedAdditions: {
          nodes: [...mergedNodes.values()],
          relationships: [...mergedRels.values()],
        },
        llmGraph: buildLlmGraphPayload({
          start: interpretation.queryState.start,
          proposedNodes: [...mergedNodes.values()],
          proposedRelationships: [...mergedRels.values()],
        }),
        queryState: interpretation.queryState,
        summary,
        nextOptions,
        compiled,
        pipelineSteps: [
          {
            id: "interpret",
            title: "Interpret intent",
            input: effectivePrompt,
            output: interpretation.queryState,
            durationMs: interpretDurationMs,
            tokenUsage: interpretation.usage,
          },
          {
            id: "compile",
            title: "Validate and compile query",
            input: interpretation.queryState,
            output: compileBlockedReason ? { compileBlockedReason, diagnostics: interpretation.diagnostics } : compiled,
            durationMs: compileDurationMs,
            tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          },
          {
            id: "research",
            title: "Generate research answer",
            input: {
              prompt: effectivePrompt,
              queryState: interpretation.queryState,
            },
            output: research.answerMarkdown,
            durationMs: researchMetrics?.researchAnswer.durationMs ?? 0,
            tokenUsage:
              researchMetrics?.researchAnswer.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          },
          {
            id: "proposal_extraction",
            title: "Extract proposed graph additions",
            input: research.answerMarkdown,
            output: {
              nodes: [...mergedNodes.values()],
              relationships: [...mergedRels.values()],
            },
            durationMs: researchMetrics?.proposalExtraction.durationMs ?? 0,
            tokenUsage:
              researchMetrics?.proposalExtraction.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          },
        ],
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
      /valid ontology|unknown|cannot connect|prompt could not be mapped|no ontology relationship/i.test(message)
        ? 422
        : 500;
    return NextResponse.json(
      {
        traceId,
        error: message,
      },
      { status, headers: { "x-trace-id": traceId } }
    );
  }
}
