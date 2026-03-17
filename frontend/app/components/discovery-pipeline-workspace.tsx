"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, Plus, Send, Sparkles, ThumbsDown, ThumbsUp, Wand2 } from "lucide-react";
import { ENTITY_LABELS, type EntityLabel } from "@/lib/entity-config";
import { RELATIONSHIP_TYPES, type RelationshipType } from "@/lib/relationship-config";
import { getApiBase, getAuthHeaders } from "@/lib/api-base";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { GraphView2D } from "./exploration-graph-cytoscape";

type QueryBuilderFormState = {
  entityType: EntityLabel | "";
  propertyFilter: string;
};

type QueryBuilderStepState = {
  relationship: RelationshipType | "";
  direction: "outbound" | "inbound" | "";
  targetEntity: EntityLabel | "";
  propertyFilter: string;
};

type NextOption = {
  relationshipType: string;
  direction: "outbound" | "inbound";
  targetLabels: string[];
};

type QueryBuilderCompileResponse = {
  sessionId?: string;
  llmState?: {
    conversationId?: string;
    previousResponseId?: string;
  };
  traceId: string;
  summary: string;
  strategy?: string;
  rationale?: string;
  needsFollowUp?: boolean;
  followUpQuestion?: string;
  followUpOptions?: string[];
  question?: {
    id: string;
    prompt: string;
    options?: string[];
    expects?: string;
  };
  relationshipNamingSuggestion?: {
    sourcePhrase?: string;
    recommendedType?: string;
    options?: string[];
    rationale?: string;
  };
  answerMarkdown?: string;
  answerStrategy?: string;
  researchStatus?: "generated" | "unavailable" | "skipped";
  researchReason?: string;
  compileBlockedReason?: string;
  diagnostics?: {
    unavailableRelationships?: Array<{
      proposalId: string;
      status: "proposed" | "accepted";
      relationshipType: string;
      direction: "outbound" | "inbound";
      fromLabel: string;
      toLabel: string;
      allowedTargets: string[];
    }>;
    ontologyValidationDiagnostics?: Array<{
      code:
        | "UNKNOWN_START_LABEL"
        | "UNKNOWN_RELATIONSHIP_TYPE"
        | "UNKNOWN_TARGET_LABEL"
        | "INVALID_TARGET_FOR_RELATIONSHIP";
      message: string;
      stepIndex?: number;
      allowedTargets?: string[];
    }>;
  };
  usedInsightIds?: string[];
  proposedAdditions?: {
    nodes: Array<{ label: string; value: string; canonicalKey: string }>;
    relationships: Array<{
      type: string;
      fromCanonicalKey: string;
      toCanonicalKey: string;
      direction: "outbound" | "inbound";
      canonicalKey: string;
    }>;
  };
  nextOptions?: NextOption[];
  pipelineSteps?: Array<{
    id: string;
    title: string;
    input: unknown;
    output: unknown;
    durationMs?: number;
    tokenUsage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
  }>;
  compiled: {
    cypher: string;
    params: Record<string, unknown>;
  };
  queryState?: {
    start: {
      label: string;
      value: string;
    };
    steps: Array<{
      relationshipType: string;
      direction: "outbound" | "inbound";
      target: {
        label: string;
        value: string;
      };
    }>;
  };
};

type ApproveRelationshipResponse = {
  traceId: string;
  status: string;
  proposal?: unknown;
  resumedInterpretation?: QueryBuilderCompileResponse & { error?: string };
  error?: string;
};
type IntentChatMessage = {
  role: "user" | "assistant";
  content: string;
  quickReplies?: string[];
  actions?: Array<{
    id: string;
    kind?: "run_action" | "add_suggested_step";
    actionId?:
      | "approve_first_unavailable_relationship"
      | "propose_all_proposed_relationships"
      | "accept_all_proposed_relationships"
      | "propose_all_proposed_nodes"
      | "accept_all_proposed_nodes";
    option?: NextOption;
    label: string;
  }>;
};

type QueryBuilderExecuteResponse = {
  traceId: string;
  compiled: {
    cypher: string;
    params: Record<string, unknown>;
  };
  resultCount: number;
  sampleMatches: Array<{ chain: string[] }>;
  fallback?: {
    applied: boolean;
    reason: string;
    candidate: string;
    resultCount: number;
  };
  graph: {
    nodes: Array<{
      id: string;
      label: string;
      name: string;
      labels?: string[];
      nodeKind?: "focus" | "entity";
      entityLabel?: string;
    }>;
    links: Array<{
      source: string;
      target: string;
      type: string;
    }>;
    focusNodeId?: string;
  };
};

type UnavailableRelationship = NonNullable<
  NonNullable<QueryBuilderCompileResponse["diagnostics"]>["unavailableRelationships"]
>[number];
type ProposedNodeItem = NonNullable<QueryBuilderCompileResponse["proposedAdditions"]>["nodes"][number];
type ProposedRelationshipItem = NonNullable<QueryBuilderCompileResponse["proposedAdditions"]>["relationships"][number];
type ProposalActionState = "accepted" | "rejected" | "proposed";

const DEFAULT_FORM_STATE: QueryBuilderFormState = {
  entityType: "",
  propertyFilter: "",
};

const DEFAULT_STEP: QueryBuilderStepState = {
  relationship: "",
  direction: "",
  targetEntity: "",
  propertyFilter: "",
};
const DEFAULT_HEADER_SENTENCE = "Start with a natural-language prompt, then refine clauses if needed.";

function formatDuration(durationMs?: number): string {
  if (!durationMs || durationMs <= 0) return "--";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(2)} s`;
}

function formatTokens(tokens?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }): string {
  if (!tokens) return "--";
  const input = tokens.inputTokens ?? 0;
  const output = tokens.outputTokens ?? 0;
  const total = tokens.totalTokens ?? input + output;
  if (input === 0 && output === 0 && total === 0) return "--";
  return `${total} total (${input} in / ${output} out)`;
}

function extractQuickReplies(question: string): string[] {
  const normalized = question.trim();
  const match = normalized.match(/do you want\s+(.+?)\s*,?\s+or\s+(.+?)\??$/i);
  if (!match) return [];
  const first = match[1]?.trim().replace(/\.$/, "");
  const second = match[2]?.trim().replace(/\.$/, "");
  const options = [first, second].filter((item): item is string => Boolean(item && item.length > 1));
  return Array.from(new Set(options)).slice(0, 3);
}

function toGuidedErrorMessage(errorMessage: string): {
  content: string;
  quickReplies?: string[];
} {
  const normalized = errorMessage.toLowerCase();
  if (
    normalized.includes("no ontology relationship") ||
    normalized.includes("cannot connect") ||
    normalized.includes("unknown relationship")
  ) {
    return {
      content:
        "I could not map that intent to a valid ontology relationship yet. Clarify the relationship you want, or use proposal actions when unavailable relationships are shown.",
      quickReplies: ["albums produced by this artist", "albums featuring this artist", "albums performed by this artist"],
    };
  }
  if (
    normalized.includes("missing startlabel") ||
    normalized.includes("missing targetlabel") ||
    normalized.includes("prompt could not be mapped")
  ) {
    return {
      content:
        "I need one more precise mapping detail (entity or relationship) before I can build the query state. Please answer with the exact relationship intent.",
      quickReplies: ["produced by", "released on", "influenced by"],
    };
  }
  return {
    content: `I hit an error: ${errorMessage}. Please refine the prompt or choose a quick clarification.`,
  };
}

function getPropertyKeyForLabel(label: EntityLabel): string {
  return label === "Venue" ? "venue" : "name";
}

function toEntityLabel(value: string): EntityLabel | null {
  return ENTITY_LABELS.includes(value as EntityLabel) ? (value as EntityLabel) : null;
}

function toRelationshipType(value: string): RelationshipType | null {
  return RELATIONSHIP_TYPES.includes(value as RelationshipType) ? (value as RelationshipType) : null;
}

function DirectionToggle({
  value,
  onChange,
}: {
  value: "outbound" | "inbound" | "";
  onChange: (next: "outbound" | "inbound" | "") => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/60 p-1">
      <button
        type="button"
        onClick={() => onChange("")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
          value === ""
            ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow"
            : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        }`}
      >
        none
      </button>
      <button
        type="button"
        onClick={() => onChange("outbound")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
          value === "outbound"
            ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow"
            : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        }`}
      >
        outbound
      </button>
      <button
        type="button"
        onClick={() => onChange("inbound")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
          value === "inbound"
            ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow"
            : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        }`}
      >
        inbound
      </button>
    </div>
  );
}

export function DiscoveryPipelineWorkspace() {
  const [formState, setFormState] = useState<QueryBuilderFormState>(DEFAULT_FORM_STATE);
  const [steps, setSteps] = useState<QueryBuilderStepState[]>([{ ...DEFAULT_STEP }]);
  const [chatInput, setChatInput] = useState("");
  const [rootPrompt, setRootPrompt] = useState("");
  const [sessionId, setSessionId] = useState<string>("");
  const [pendingQuestionId, setPendingQuestionId] = useState<string>("");
  const [llmState, setLlmState] = useState<{ conversationId?: string; previousResponseId?: string } | undefined>(
    undefined
  );
  const [pendingFollowUp, setPendingFollowUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryBuilderCompileResponse | null>(null);
  const [executeResult, setExecuteResult] = useState<QueryBuilderExecuteResponse | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [proposalActionByKey, setProposalActionByKey] = useState<Record<string, ProposalActionState>>({});
  const [selectedContinuationByActionId, setSelectedContinuationByActionId] = useState<
    Record<string, { label: string; option: NextOption }>
  >({});
  const [intentChat, setIntentChat] = useState<IntentChatMessage[]>([]);
  const graphContainerRef = useRef<HTMLDivElement | null>(null);

  const canRemoveStep = steps.length > 0;
  const hasStartedSearch = !!result?.queryState;
  const hasClauseInputs =
    formState.entityType !== "" &&
    steps.length > 0 &&
    steps.every((step) => step.relationship !== "" && step.targetEntity !== "" && step.direction !== "");

  const sentencePreview = useMemo(() => {
    const isDefaultForm =
      formState.entityType === DEFAULT_FORM_STATE.entityType &&
      formState.propertyFilter.trim() === DEFAULT_FORM_STATE.propertyFilter;
    const isDefaultSingleStep =
      steps.length === 1 &&
      steps[0]?.relationship === DEFAULT_STEP.relationship &&
      steps[0]?.direction === DEFAULT_STEP.direction &&
      steps[0]?.targetEntity === DEFAULT_STEP.targetEntity &&
      steps[0]?.propertyFilter.trim() === DEFAULT_STEP.propertyFilter;
    const hasNoIntentYet = !result && isDefaultForm && isDefaultSingleStep;
    if (hasNoIntentYet) {
      return DEFAULT_HEADER_SENTENCE;
    }

    const startValue = formState.propertyFilter.trim();
    const startPart = startValue
      ? `Find ${formState.entityType} matching "${startValue}"`
      : formState.entityType
        ? `Find ${formState.entityType}`
        : "Find an entity";
    const clauses = steps.map((step) => {
      const directionPhrase = step.direction === "outbound" ? "that connect via" : "that are connected by";
      const filterPart = step.propertyFilter.trim() ? ` where ${step.targetEntity} contains "${step.propertyFilter.trim()}"` : "";
      return `${directionPhrase} ${step.relationship} to ${step.targetEntity}${filterPart}`;
    });
    return `${startPart}${clauses.length ? `, ${clauses.join(", and ")}` : ""}.`;
  }, [formState, steps, result]);

  const latestAssistantInteractiveIndex = useMemo(() => {
    for (let index = intentChat.length - 1; index >= 0; index -= 1) {
      const message = intentChat[index];
      if (message?.role !== "assistant") continue;
      if ((message.quickReplies?.length ?? 0) > 0 || (message.actions?.length ?? 0) > 0) {
        return index;
      }
    }
    return -1;
  }, [intentChat]);

  function updateStep(index: number, patch: Partial<QueryBuilderStepState>) {
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  function addStep(initial?: Partial<QueryBuilderStepState>) {
    setSteps((current) => [...current, { ...DEFAULT_STEP, ...initial }]);
  }

  function addSuggestedStep(option?: NextOption) {
    if (!option) {
      addStep();
      return;
    }
    const relationship = toRelationshipType(option.relationshipType) ?? DEFAULT_STEP.relationship;
    const targetEntity =
      option.targetLabels.map(toEntityLabel).find((label): label is EntityLabel => Boolean(label)) ??
      DEFAULT_STEP.targetEntity;
    addStep({ relationship, direction: option.direction, targetEntity, propertyFilter: "" });
  }

  function removeStep(index: number) {
    setSteps((current) => {
      if (current.length <= 1) return [];
      return current.filter((_, i) => i !== index);
    });
  }

  function buildQueryState() {
    if (!formState.entityType) {
      throw new Error("Choose a start entity before compiling.");
    }
    for (const step of steps) {
      if (!step.relationship || !step.targetEntity || !step.direction) {
        throw new Error("Each clause needs relationship, direction, and target entity.");
      }
    }
    return {
      start: {
        label: formState.entityType,
        propertyKey: getPropertyKeyForLabel(formState.entityType),
        value: formState.propertyFilter.trim(),
      },
      steps: steps.map((step) => ({
        relationshipType: step.relationship,
        direction: step.direction,
        target: {
          label: step.targetEntity,
          propertyKey: getPropertyKeyForLabel(step.targetEntity as EntityLabel),
          value: step.propertyFilter.trim(),
        },
      })),
      limit: 25,
    };
  }

  async function handleCompile() {
    setLoading(true);
    setError(null);
    const queryState = buildQueryState();

    try {
      const response = await fetch(`${getApiBase()}/api/query-builder/compile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ queryState }),
      });
      const payload = (await response.json()) as QueryBuilderCompileResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Failed to compile query preview");
      }
      setResult(payload as QueryBuilderCompileResponse);
    } catch (compileError) {
      setResult(null);
      setError(compileError instanceof Error ? compileError.message : "Failed to compile query preview");
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    setLoading(true);
    setError(null);
    const queryState = buildQueryState();

    try {
      const response = await fetch(`${getApiBase()}/api/query-builder/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ queryState }),
      });
      const payload = (await response.json()) as QueryBuilderExecuteResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Failed to run query");
      }
      const executed = payload as QueryBuilderExecuteResponse;
      setExecuteResult(executed);
      setSelectedNodeId(executed.graph.focusNodeId ?? executed.graph.nodes[0]?.id ?? null);
      setResult((current) =>
        current
          ? {
              ...current,
              compiled: executed.compiled,
            }
          : current
      );
    } catch (executeError) {
      setExecuteResult(null);
      setSelectedNodeId(null);
      setError(executeError instanceof Error ? executeError.message : "Failed to run query");
    } finally {
      setLoading(false);
    }
  }

  async function submitChatMessage(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message) return;
    setLoading(true);
    setError(null);
    setIntentChat((current) =>
      current.map((item) => ({
        ...item,
        quickReplies: undefined,
        actions: undefined,
      }))
    );
    setIntentChat((current) => [...current, { role: "user", content: message }]);
    setChatInput("");
    try {
      const isNewRootPrompt = !pendingFollowUp || !rootPrompt.trim();
      if (isNewRootPrompt) {
        // Always start fresh before mapping new top-level intent.
        setFormState(DEFAULT_FORM_STATE);
        setSteps([{ ...DEFAULT_STEP }]);
        setResult(null);
        setExecuteResult(null);
        setSelectedNodeId(null);
        setFeedbackStatus(null);
        setProposalActionByKey({});
        setSelectedContinuationByActionId({});
        setRootPrompt(message);
        setPendingQuestionId("");
        setSessionId("");
        setLlmState(undefined);
      }
      const response = await fetch(`${getApiBase()}/api/query-builder/interpret`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(
          isNewRootPrompt
            ? {
                mode: "new_intent",
                userMessage: message,
                prompt: message,
              }
            : {
                mode: "clarification",
                userMessage: message,
                prompt: rootPrompt,
                originalPrompt: rootPrompt,
                clarification: message,
                sessionId,
                pendingQuestionId,
                llmState,
              }
        ),
      });
      const payload = (await response.json()) as QueryBuilderCompileResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Failed to interpret prompt");
      }
      const interpreted = payload as QueryBuilderCompileResponse;
      setSelectedContinuationByActionId({});
      if (interpreted.sessionId) {
        setSessionId(interpreted.sessionId);
      }
      if (interpreted.llmState) {
        setLlmState(interpreted.llmState);
      }
      if (interpreted.needsFollowUp) {
        setPendingFollowUp(true);
        setPendingQuestionId(interpreted.question?.id ?? "");
        const question =
          interpreted.followUpQuestion?.trim() || "I need one clarification before mapping this intent.";
        const optionReplies =
          (interpreted.question?.options ??
            interpreted.followUpOptions?.filter((value) => typeof value === "string" && value.trim().length > 0) ??
            []);
        setIntentChat((current) => {
          if (current[current.length - 1]?.role === "assistant" && current[current.length - 1]?.content === question) {
            return current;
          }
          return [
            ...current,
            {
              role: "assistant",
              content: question,
              quickReplies: optionReplies.length > 0 ? optionReplies : extractQuickReplies(question),
            } satisfies IntentChatMessage,
          ];
        });
        return;
      }
      setPendingFollowUp(false);
      setPendingQuestionId("");
      if (interpreted.queryState) {
        const startLabel = toEntityLabel(interpreted.queryState.start.label) ?? DEFAULT_FORM_STATE.entityType;
        setFormState({
          entityType: startLabel,
          propertyFilter: interpreted.queryState.start.value ?? "",
        });
        const interpretedSteps = interpreted.queryState.steps
          .map((step) => {
            const relationship = toRelationshipType(step.relationshipType);
            const targetEntity = toEntityLabel(step.target.label);
            if (!relationship || !targetEntity) return null;
            return {
              relationship,
              direction: step.direction === "inbound" ? "inbound" : "outbound",
              targetEntity,
              propertyFilter: step.target.value ?? "",
            } satisfies QueryBuilderStepState;
          })
          .filter(Boolean) as QueryBuilderStepState[];
        setSteps(interpretedSteps.length ? interpretedSteps : [{ ...DEFAULT_STEP }]);
      }
      setResult(interpreted);
      setExecuteResult(null);
      setSelectedNodeId(null);
      setFeedbackStatus(null);
      setProposalActionByKey({});
      if (interpreted.rationale?.trim()) {
        setIntentChat((current) => [...current, { role: "assistant", content: interpreted.rationale.trim() }]);
      }
      if (interpreted.diagnostics?.ontologyValidationDiagnostics?.length) {
        const diagnosticLines = interpreted.diagnostics.ontologyValidationDiagnostics
          .slice(0, 6)
          .map((item) => {
            const atStep = typeof item.stepIndex === "number" ? ` (step ${item.stepIndex + 1})` : "";
            const allowed =
              item.allowedTargets && item.allowedTargets.length > 0
                ? ` Allowed targets: ${item.allowedTargets.join(", ")}.`
                : "";
            return `- [${item.code}]${atStep} ${item.message}${allowed}`;
          })
          .join("\n");
        setIntentChat((current) => [
          ...current,
          {
            role: "assistant",
            content: `Ontology validation checks:\n${diagnosticLines}`,
          },
        ]);
      }
      if (interpreted.compileBlockedReason && interpreted.diagnostics?.unavailableRelationships?.length) {
        setIntentChat((current) => [
          ...current,
          {
            role: "assistant",
            content:
              "Compilation is blocked by unavailable ontology relationships. You can approve a relationship now or tag proposals for later review.",
            actions: [
              {
                id: "approve_first_unavailable_relationship",
                kind: "run_action",
                actionId: "approve_first_unavailable_relationship",
                label: "Approve first unavailable relationship",
              },
              {
                id: "propose_all_proposed_relationships",
                kind: "run_action",
                actionId: "propose_all_proposed_relationships",
                label: "Propose all relationships",
              },
              {
                id: "accept_all_proposed_relationships",
                kind: "run_action",
                actionId: "accept_all_proposed_relationships",
                label: "Accept all relationships",
              },
            ],
          },
        ]);
      } else if (interpreted.proposedAdditions?.nodes?.length || interpreted.proposedAdditions?.relationships?.length) {
        setIntentChat((current) => [
          ...current,
          {
            role: "assistant",
            content: "I extracted proposals. You can accept now or park them for later review.",
            actions: [
              {
                id: "accept_all_proposed_nodes",
                kind: "run_action",
                actionId: "accept_all_proposed_nodes",
                label: "Accept all nodes",
              },
              {
                id: "propose_all_proposed_nodes",
                kind: "run_action",
                actionId: "propose_all_proposed_nodes",
                label: "Propose all nodes",
              },
              {
                id: "accept_all_proposed_relationships",
                kind: "run_action",
                actionId: "accept_all_proposed_relationships",
                label: "Accept all relationships",
              },
            ],
          },
        ]);
      }
      if (interpreted.nextOptions?.length) {
        setIntentChat((current) => [
          ...current,
          {
            role: "assistant",
            content: "Suggested continuations (multi-select): choose one or more.",
            actions: interpreted.nextOptions.slice(0, 8).map((option, index) => ({
              id: `suggested-${index}-${option.relationshipType}-${option.direction}`,
              kind: "add_suggested_step",
              option,
              label: `${option.direction === "outbound" ? "->" : "<-"} ${option.relationshipType} -> ${
                option.targetLabels[0] ?? "Entity"
              }`,
            })),
          },
        ]);
      }
    } catch (interpretError) {
      setResult(null);
      setPendingFollowUp(false);
      const message = interpretError instanceof Error ? interpretError.message : "Failed to interpret prompt";
      setError(message);
      const guided = toGuidedErrorMessage(message);
      setIntentChat((current) => [
        ...current,
        {
          role: "assistant",
          content: guided.content,
          quickReplies: guided.quickReplies,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormState(DEFAULT_FORM_STATE);
    setSteps([{ ...DEFAULT_STEP }]);
    setChatInput("");
    setRootPrompt("");
    setSessionId("");
    setPendingQuestionId("");
    setLlmState(undefined);
    setPendingFollowUp(false);
    setResult(null);
    setExecuteResult(null);
    setSelectedNodeId(null);
    setError(null);
    setFeedbackStatus(null);
    setProposalActionByKey({});
    setSelectedContinuationByActionId({});
    setIntentChat([]);
  }

  function selectSuggestedContinuation(actionId: string, label: string, option?: NextOption) {
    if (!option) return;
    if (selectedContinuationByActionId[actionId]) return;
    addSuggestedStep(option);
    setSelectedContinuationByActionId((current) => ({
      ...current,
      [actionId]: { label, option },
    }));
  }

  function removeSelectedContinuation(actionId: string) {
    setSelectedContinuationByActionId((current) => {
      if (!current[actionId]) return current;
      const next = { ...current };
      delete next[actionId];
      return next;
    });
  }

  async function sendFeedback(params: {
    targetTraceId: string;
    rating: 1 | -1;
    context: "interpret" | "execute";
    wasEmpty?: boolean;
  }) {
    try {
      const response = await fetch(`${getApiBase()}/api/query-builder/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Failed to record feedback");
      }
      setFeedbackStatus("Feedback saved");
    } catch (feedbackError) {
      setFeedbackStatus(feedbackError instanceof Error ? feedbackError.message : "Failed to record feedback");
    }
  }

  async function approveRelationship(item: UnavailableRelationship) {
    try {
      const response = await fetch(`${getApiBase()}/api/query-builder/approve-relationship`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          proposalId: item.proposalId,
          relationshipType: item.relationshipType,
          direction: item.direction,
          fromLabel: item.fromLabel,
          toLabel: item.toLabel,
          resume: {
            prompt: rootPrompt,
            queryState: result?.queryState,
            llmState,
          },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApproveRelationshipResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to approve relationship");
      }
      setResult((current) => {
        if (!current?.diagnostics?.unavailableRelationships) return current;
        return {
          ...current,
          diagnostics: {
            ...current.diagnostics,
            unavailableRelationships: current.diagnostics.unavailableRelationships.map((entry) =>
              entry.proposalId === item.proposalId ? { ...entry, status: "accepted" } : entry
            ),
          },
        };
      });
      if (payload.resumedInterpretation?.llmState) {
        setLlmState(payload.resumedInterpretation.llmState);
      }
      if (payload.resumedInterpretation?.needsFollowUp) {
        setPendingFollowUp(true);
        const question = payload.resumedInterpretation.followUpQuestion?.trim() || "I need one clarification.";
        const options = payload.resumedInterpretation.followUpOptions ?? payload.resumedInterpretation.question?.options ?? [];
        setPendingQuestionId(payload.resumedInterpretation.question?.id ?? "");
        setIntentChat((current) => [
          ...current,
          {
            role: "assistant",
            content: question,
            quickReplies: options.length > 0 ? options : extractQuickReplies(question),
          },
        ]);
      } else if (payload.resumedInterpretation?.queryState) {
        setPendingFollowUp(false);
        setPendingQuestionId("");
        setResult(payload.resumedInterpretation);
        setExecuteResult(null);
        setSelectedNodeId(null);
        if (payload.resumedInterpretation.rationale?.trim()) {
          setIntentChat((current) => [
            ...current,
            {
              role: "assistant",
              content: `Relationship approved. Resumed query: ${payload.resumedInterpretation.rationale.trim()}`,
            },
          ]);
        }
      }
      setFeedbackStatus("Relationship approved and ontology updated.");
    } catch (approvalError) {
      setFeedbackStatus(approvalError instanceof Error ? approvalError.message : "Failed to approve relationship");
    }
  }

  async function decideProposedNode(node: ProposedNodeItem, action: "accept" | "reject" | "propose") {
    try {
      const response = await fetch(`${getApiBase()}/api/query-builder/accept-proposal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          action,
          kind: "node",
          node,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to persist node proposal");
      }
      setProposalActionByKey((current) => ({
        ...current,
        [node.canonicalKey]: action === "accept" ? "accepted" : action === "reject" ? "rejected" : "proposed",
      }));
      setFeedbackStatus(
        action === "accept"
          ? "Accepted node persisted to Neo4j."
          : action === "reject"
            ? "Node marked incorrect (rejected)."
            : "Node tagged as proposed for later review."
      );
    } catch (acceptError) {
      setFeedbackStatus(acceptError instanceof Error ? acceptError.message : "Failed to persist node proposal");
    }
  }

  async function decideProposedRelationship(
    relationship: ProposedRelationshipItem,
    action: "accept" | "reject" | "propose"
  ) {
    if (!result?.proposedAdditions?.nodes) return;
    try {
      const response = await fetch(`${getApiBase()}/api/query-builder/accept-proposal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          action,
          kind: "relationship",
          relationship,
          nodes: result.proposedAdditions.nodes,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to persist relationship proposal");
      }
      setProposalActionByKey((current) => ({
        ...current,
        [relationship.canonicalKey]: action === "accept" ? "accepted" : action === "reject" ? "rejected" : "proposed",
      }));
      setFeedbackStatus(
        action === "accept"
          ? "Accepted relationship persisted to Neo4j."
          : action === "reject"
            ? "Relationship marked incorrect (rejected)."
            : "Relationship tagged as proposed for later review."
      );
    } catch (acceptError) {
      setFeedbackStatus(acceptError instanceof Error ? acceptError.message : "Failed to persist relationship proposal");
    }
  }

  async function decideAllProposedNodes(action: "accept" | "reject" | "propose") {
    const nodes = result?.proposedAdditions?.nodes ?? [];
    if (!nodes.length) {
      setFeedbackStatus(`No proposed nodes available to ${action}.`);
      return;
    }
    for (const node of nodes) {
      await decideProposedNode(node, action);
    }
    setFeedbackStatus(`${action === "accept" ? "Accepted" : action === "reject" ? "Rejected" : "Proposed"} ${nodes.length} nodes.`);
  }

  async function decideAllProposedRelationships(action: "accept" | "reject" | "propose") {
    const relationships = result?.proposedAdditions?.relationships ?? [];
    if (!relationships.length) {
      setFeedbackStatus(`No proposed relationships available to ${action}.`);
      return;
    }
    for (const relationship of relationships) {
      await decideProposedRelationship(relationship, action);
    }
    setFeedbackStatus(
      `${action === "accept" ? "Accepted" : action === "reject" ? "Rejected" : "Proposed"} ${relationships.length} relationships.`
    );
  }

  async function runChatAction(
    actionId:
      | "approve_first_unavailable_relationship"
      | "propose_all_proposed_relationships"
      | "accept_all_proposed_relationships"
      | "propose_all_proposed_nodes"
      | "accept_all_proposed_nodes"
  ) {
    if (actionId === "approve_first_unavailable_relationship") {
      const firstUnavailable = result?.diagnostics?.unavailableRelationships?.[0];
      if (!firstUnavailable) {
        setFeedbackStatus("No unavailable relationship is currently available to approve.");
        return;
      }
      await approveRelationship(firstUnavailable);
      return;
    }
    if (actionId === "propose_all_proposed_relationships") {
      await decideAllProposedRelationships("propose");
      return;
    }
    if (actionId === "accept_all_proposed_relationships") {
      await decideAllProposedRelationships("accept");
      const unavailable = result?.diagnostics?.unavailableRelationships ?? [];
      if (unavailable.length > 0) {
        for (const item of unavailable) {
          if (item.status !== "accepted") {
            await approveRelationship(item);
          }
        }
      }
      return;
    }
    if (actionId === "propose_all_proposed_nodes") {
      await decideAllProposedNodes("propose");
      return;
    }
    if (actionId === "accept_all_proposed_nodes") {
      await decideAllProposedNodes("accept");
    }
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search</CardTitle>
        </CardHeader>
        <CardContent>
          {intentChat.length > 0 ? (
            <div className="max-h-48 space-y-2 overflow-auto rounded-lg border border-[hsl(var(--border))] p-3">
              {intentChat.map((message, index) => (
                <div
                  key={`intent-chat-${index}`}
                  className={`rounded-md px-3 py-2 text-sm ${
                    message.role === "user"
                      ? "bg-[hsl(var(--muted))]/50 text-[hsl(var(--foreground))]"
                      : "bg-blue-50 text-blue-900"
                  }`}
                >
                  <p className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
                    {message.role === "user" ? "You" : "Assistant"}
                  </p>
                  <p>{message.content}</p>
                  {message.role === "assistant" &&
                  index === latestAssistantInteractiveIndex &&
                  message.quickReplies?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.quickReplies.map((option) => (
                        <Button
                          key={`quick-reply-${index}-${option}`}
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void submitChatMessage(option)}
                          disabled={loading}
                        >
                          {option}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  {message.role === "assistant" &&
                  index === latestAssistantInteractiveIndex &&
                  message.actions?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.actions.map((action) => {
                        const isSelected =
                          action.kind === "add_suggested_step" && Boolean(selectedContinuationByActionId[action.id]);
                        return (
                          <Button
                            key={`chat-action-${index}-${action.id}`}
                            type="button"
                            size="sm"
                            variant="outline"
                            className={
                              isSelected
                                ? "border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                                : undefined
                            }
                            onClick={() => {
                              if (action.kind === "add_suggested_step") {
                                selectSuggestedContinuation(action.id, action.label, action.option);
                                return;
                              }
                              if (action.actionId) {
                                void runChatAction(action.actionId);
                              }
                            }}
                            disabled={loading || isSelected}
                          >
                            {action.label}
                          </Button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {Object.entries(selectedContinuationByActionId).length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(selectedContinuationByActionId).map(([actionId, selected]) => (
                <span
                  key={`selected-continuation-${actionId}`}
                  className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-1 text-xs text-[hsl(var(--foreground))]"
                >
                  {selected.label}
                  <button
                    type="button"
                    className="rounded px-1 text-[hsl(var(--muted-foreground))] transition hover:text-[hsl(var(--foreground))]"
                    onClick={() => removeSelectedContinuation(actionId)}
                    disabled={loading}
                    aria-label={`Remove ${selected.label}`}
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitChatMessage(chatInput);
                }
              }}
              placeholder={pendingFollowUp ? "Answer here..." : "Start your search here. What can I find for you?"}
            />
            <Button type="button" onClick={() => void submitChatMessage(chatInput)} disabled={loading || !chatInput.trim()}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send
            </Button>
          </div>
        </CardContent>
      </Card>

      {hasStartedSearch ? (
      <>
      <div className="grid gap-5">
        <Card className="shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Execution Preview</CardTitle>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Pipeline-first view: inspect each stage input, output, latency, and token usage.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                Could not compile preview: {error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => void handleExecute()} disabled={loading || !result?.queryState}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Run Query
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm} disabled={loading}>
                Reset
              </Button>
            </div>

            {result?.pipelineSteps?.length ? (
              <div className="space-y-3">
                {result.pipelineSteps.map((step, index) => (
                  <div key={`pipeline-step-${step.id}-${index}`} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{index + 1}. {step.title}</p>
                      <div className="flex gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                        <span>Time: {formatDuration(step.durationMs)}</span>
                        <span>Tokens: {formatTokens(step.tokenUsage)}</span>
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Input</p>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs">
                          {typeof step.input === "string" ? step.input : JSON.stringify(step.input, null, 2)}
                        </pre>
                      </div>
                      <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-2">
                        <p className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Output</p>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs">
                          {typeof step.output === "string" ? step.output : JSON.stringify(step.output, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 p-3">
              <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Summary</p>
              <p className="mt-2 text-sm">{result?.summary ?? sentencePreview}</p>
              {result?.answerMarkdown ? (
                <div className="mt-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2">
                  <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    Research answer
                    {result.answerStrategy ? ` (${result.answerStrategy})` : ""}
                  </p>
                  <pre className="mt-1 whitespace-pre-wrap text-xs">{result.answerMarkdown}</pre>
                </div>
              ) : null}
              {!result?.answerMarkdown && result?.researchReason ? (
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Research answer: {result.researchReason}</p>
              ) : null}
              {result?.strategy ? (
                <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                  Strategy: {result.strategy}
                  {result.usedInsightIds?.length ? ` • Insights reused: ${result.usedInsightIds.length}` : ""}
                </p>
              ) : null}
              {result?.rationale ? (
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{result.rationale}</p>
              ) : null}
              {result?.proposedAdditions ? (
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  Proposed additions: {result.proposedAdditions.nodes.length} nodes,{" "}
                  {result.proposedAdditions.relationships.length} relationships.
                </p>
              ) : null}
            </div>

            {result?.proposedAdditions ? (
              <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Proposed nodes</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => void decideAllProposedNodes("accept")} disabled={loading}>
                      Accept All
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void decideAllProposedNodes("reject")} disabled={loading}>
                      Reject All
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void decideAllProposedNodes("propose")} disabled={loading}>
                      Propose All
                    </Button>
                  </div>
                </div>
                {result.proposedAdditions.nodes.length === 0 ? (
                  <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">No proposed nodes.</p>
                ) : (
                  <div className="mt-2 max-h-40 space-y-2 overflow-auto">
                    {result.proposedAdditions.nodes.map((node) => {
                      const actionState = proposalActionByKey[node.canonicalKey];
                      return (
                        <div key={node.canonicalKey} className="flex items-center justify-between rounded border p-2">
                          <p className="text-xs">
                            {node.label}: {node.value}
                            {actionState ? ` • ${actionState.toUpperCase()}` : ""}
                          </p>
                          {actionState ? null : (
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => void decideProposedNode(node, "accept")} disabled={loading}>
                                Accept
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => void decideProposedNode(node, "reject")} disabled={loading}>
                                Delete
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => void decideProposedNode(node, "propose")} disabled={loading}>
                                Propose
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {result?.proposedAdditions ? (
              <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Proposed relationships</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void decideAllProposedRelationships("accept")}
                      disabled={loading}
                    >
                      Accept All
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void decideAllProposedRelationships("reject")}
                      disabled={loading}
                    >
                      Reject All
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void decideAllProposedRelationships("propose")}
                      disabled={loading}
                    >
                      Propose All
                    </Button>
                  </div>
                </div>
                {result.proposedAdditions.relationships.length === 0 ? (
                  <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">No proposed relationships.</p>
                ) : (
                  <div className="mt-2 max-h-48 space-y-2 overflow-auto">
                    {result.proposedAdditions.relationships.map((rel) => {
                      const actionState = proposalActionByKey[rel.canonicalKey];
                      return (
                        <div key={rel.canonicalKey} className="flex items-center justify-between rounded border p-2">
                          <p className="text-xs">
                            {rel.fromCanonicalKey} {rel.direction === "outbound" ? "->" : "<-"} {rel.type} {"->"} {rel.toCanonicalKey}
                            {actionState ? ` • ${actionState.toUpperCase()}` : ""}
                          </p>
                          {actionState ? null : (
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void decideProposedRelationship(rel, "accept")}
                                disabled={loading}
                              >
                                Accept
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void decideProposedRelationship(rel, "reject")}
                                disabled={loading}
                              >
                                Delete
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void decideProposedRelationship(rel, "propose")}
                                disabled={loading}
                              >
                                Propose
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {result?.nextOptions && result.nextOptions.length > 0 ? (
              <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Suggested continuations</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.nextOptions.slice(0, 8).map((option, index) => (
                    <button
                      key={`${option.relationshipType}-${index}`}
                      type="button"
                      onClick={() => addSuggestedStep(option)}
                      className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 px-3 py-1 text-xs transition hover:bg-[hsl(var(--muted))]"
                    >
                      {option.direction === "outbound" ? "->" : "<-"} {option.relationshipType} {"->"} {option.targetLabels[0] ?? "Entity"}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3">
              <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Cypher</p>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{result?.compiled.cypher ?? "--"}</pre>
                {result?.compileBlockedReason ? (
                  <p className="mt-2 text-xs text-amber-700">Compile blocked: {result.compileBlockedReason}</p>
                ) : null}
              </div>
              <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Params</p>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">
                  {result ? JSON.stringify(result.compiled.params, null, 2) : "--"}
                </pre>
              </div>
            </div>

            {result?.traceId ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Trace ID: {result.traceId}</p>
            ) : null}
            {result?.diagnostics?.unavailableRelationships?.length ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                <p>Unavailable relationships were kept as proposed candidates.</p>
                <div className="mt-2 space-y-2">
                  {result.diagnostics.unavailableRelationships.map((item) => (
                    <div key={item.proposalId} className="rounded border border-amber-300 bg-amber-100/40 p-2">
                      <p>
                        {item.fromLabel} {item.direction === "outbound" ? "->" : "<-"} {item.relationshipType} {"->"} {item.toLabel}
                      </p>
                      <p className="mt-1">State: {item.status}</p>
                      <p className="mt-1">Allowed targets: {item.allowedTargets.join(", ") || "none"}</p>
                      <div className="mt-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void approveRelationship(item)}
                          disabled={loading || item.status === "accepted"}
                        >
                          {item.status === "accepted" ? "Accepted" : "Approve relationship"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {result?.diagnostics?.ontologyValidationDiagnostics?.length ? (
              <div className="rounded-md border border-slate-300 bg-slate-50 p-2 text-xs text-slate-800">
                <p>Ontology validation checks:</p>
                <div className="mt-2 space-y-1">
                  {result.diagnostics.ontologyValidationDiagnostics.map((item, index) => (
                    <p key={`validation-${index}`}>
                      [{item.code}] {typeof item.stepIndex === "number" ? `(step ${item.stepIndex + 1}) ` : ""}
                      {item.message}
                      {item.allowedTargets?.length ? ` Allowed targets: ${item.allowedTargets.join(", ")}.` : ""}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
            {result?.traceId ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void sendFeedback({ targetTraceId: result.traceId, rating: 1, context: "interpret" })}
                  disabled={loading}
                >
                  <ThumbsUp className="mr-2 h-4 w-4" />
                  Helpful
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void sendFeedback({ targetTraceId: result.traceId, rating: -1, context: "interpret" })}
                  disabled={loading}
                >
                  <ThumbsDown className="mr-2 h-4 w-4" />
                  Not helpful
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Live Result Graph</CardTitle>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Execute compiled Cypher against Neo4j and inspect returned nodes, links, and sample match chains.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!executeResult ? (
            <div className="rounded-lg border border-dashed border-[hsl(var(--border))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
              No executed result yet. Click <span className="font-medium text-[hsl(var(--foreground))]">Run Query</span> to fetch live graph data.
            </div>
          ) : (
            <>
              {executeResult.fallback?.applied ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                  {executeResult.fallback.reason} Fallback seed: "{executeResult.fallback.candidate}" ({executeResult.fallback.resultCount} match
                  {executeResult.fallback.resultCount === 1 ? "" : "es"}).
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                  <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Matched paths</p>
                  <p className="mt-1 text-base font-semibold">{executeResult.resultCount}</p>
                </div>
                <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                  <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Nodes</p>
                  <p className="mt-1 text-base font-semibold">{executeResult.graph.nodes.length}</p>
                </div>
                <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                  <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Links</p>
                  <p className="mt-1 text-base font-semibold">{executeResult.graph.links.length}</p>
                </div>
              </div>

              <div
                ref={graphContainerRef}
                className="relative h-[28rem] overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]"
              >
                {executeResult.graph.nodes.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
                    Query ran but returned zero rows. Try a broader start filter, a different relationship, or no target filter.
                  </div>
                ) : (
                  <GraphView2D
                    graphData={executeResult.graph}
                    focusNodeId={selectedNodeId ?? executeResult.graph.focusNodeId}
                    expandedTypeKeys={[]}
                    onNodeClick={(node) => setSelectedNodeId(node.id)}
                    onNodeDragEnd={() => {}}
                    showEdgeLabels={false}
                    highlightEnriched={false}
                    recentEnrichedNodeIds={new Set<string>()}
                    containerRef={graphContainerRef}
                  />
                )}
              </div>

              {executeResult.sampleMatches.length > 0 ? (
                <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                  <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Sample matches</p>
                  <div className="mt-2 space-y-1.5 text-sm">
                    {executeResult.sampleMatches.map((match, index) => (
                      <p key={`match-${index}`} className="truncate">
                        {match.chain.join(" -> ")}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void sendFeedback({
                      targetTraceId: executeResult.traceId,
                      rating: 1,
                      context: "execute",
                      wasEmpty: executeResult.resultCount === 0,
                    })
                  }
                  disabled={loading}
                >
                  <ThumbsUp className="mr-2 h-4 w-4" />
                  Helpful
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void sendFeedback({
                      targetTraceId: executeResult.traceId,
                      rating: -1,
                      context: "execute",
                      wasEmpty: executeResult.resultCount === 0,
                    })
                  }
                  disabled={loading}
                >
                  <ThumbsDown className="mr-2 h-4 w-4" />
                  Not helpful
                </Button>
              </div>
            </>
          )}
          {feedbackStatus ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{feedbackStatus}</p>
          ) : null}
        </CardContent>
      </Card>
      </>
      ) : (
        <Card className="shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pipeline</CardTitle>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Stages are ready and will populate after your first prompt.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              "Interpret intent",
              "Validate and compile query",
              "Generate research answer",
              "Extract proposed graph additions",
            ].map((title, index) => (
              <div key={`pipeline-empty-${title}`} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">{index + 1}. {title}</p>
                  <span className="text-[11px] text-[hsl(var(--muted-foreground))]">Pending</span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-2">
                    <p className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Input</p>
                    <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Waiting for prompt...</p>
                  </div>
                  <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-2">
                    <p className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Output</p>
                    <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">No output yet.</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
