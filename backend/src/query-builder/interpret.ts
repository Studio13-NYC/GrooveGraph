import type { OntologyRuntime } from "../ontology";
import type { QueryState, QueryDirection } from "./types";
import { findRelevantInsights } from "./insights";
import {
  getConversationIdFromResponsesPayload,
  getTextFromResponsesOutput,
  getUsageFromResponsesPayload,
  type ResponsesApiPayload,
  type ResponsesConversationState,
  type ResponsesTokenUsage,
} from "../enrichment/llm/responses-api";
import { upsertRelationshipProposal } from "./relationship-proposals";

type InterpretResult = {
  queryState?: QueryState;
  strategy: string;
  rationale: string;
  usedInsightIds: string[];
  needsFollowUp?: boolean;
  followUpQuestion?: string;
  followUpOptions?: string[];
  proposedAdditions?: {
    nodes: Array<{ label: string; value: string; canonicalKey: string }>;
    relationships: Array<{
      type: string;
      fromCanonicalKey: string;
      toCanonicalKey: string;
      direction: QueryDirection;
      canonicalKey: string;
    }>;
  };
  diagnostics?: {
    unavailableRelationships: Array<{
      proposalId: string;
      status: "proposed" | "accepted";
      relationshipType: string;
      direction: QueryDirection;
      fromLabel: string;
      toLabel: string;
      allowedTargets: string[];
    }>;
    ontologyValidationDiagnostics?: QueryStateDiagnostic[];
  };
  relationshipNamingSuggestion?: {
    sourcePhrase?: string;
    recommendedType?: string;
    options?: string[];
    rationale?: string;
  };
  llmState?: ResponsesConversationState;
  usage?: ResponsesTokenUsage;
};

type LlmInterpretPayload = {
  startLabel?: string;
  startValue?: string;
  steps?: Array<{
    relationshipType?: string;
    direction?: QueryDirection;
    targetLabel?: string;
    targetValue?: string;
  }>;
  limit?: number;
  rationale?: string;
  rejected?: boolean;
  rejectionReason?: string;
  followUpQuestion?: string;
  proposedNodes?: Array<{ label?: string; value?: string }>;
  proposedRelationships?: Array<{
    type?: string;
    fromLabel?: string;
    fromValue?: string;
    toLabel?: string;
    toValue?: string;
    direction?: QueryDirection;
  }>;
  relationshipNamingSuggestion?: {
    sourcePhrase?: string;
    recommendedType?: string;
    options?: string[];
    rationale?: string;
  };
};

type ResponsesFunctionCallItem = {
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
};

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("Interpretation response was not valid JSON.");
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeRelationshipTypeToken(value: string): string {
  return value.trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "").toUpperCase();
}

function normalizeRelationshipNamingSuggestion(
  suggestion: LlmInterpretPayload["relationshipNamingSuggestion"]
): InterpretResult["relationshipNamingSuggestion"] | undefined {
  if (!suggestion) return undefined;
  const recommendedType = suggestion.recommendedType
    ? normalizeRelationshipTypeToken(suggestion.recommendedType)
    : undefined;
  const options = Array.from(
    new Set(
      (suggestion.options ?? [])
        .map((item) => normalizeRelationshipTypeToken(item))
        .filter((item) => item.length >= 3)
    )
  ).slice(0, 5);
  if (recommendedType && !options.includes(recommendedType)) {
    options.unshift(recommendedType);
  }
  if (!recommendedType && options.length === 0 && !suggestion.sourcePhrase?.trim()) {
    return undefined;
  }
  return {
    sourcePhrase: suggestion.sourcePhrase?.trim() || undefined,
    recommendedType,
    options,
    rationale: suggestion.rationale?.trim() || undefined,
  };
}

function getAllowedTargets(
  ontology: OntologyRuntime,
  relationshipType: string,
  direction: QueryDirection
): string[] {
  const schema = ontology.getRelationship(relationshipType);
  if (!schema) return [];
  return direction === "outbound" ? schema.objectLabels : schema.subjectLabels;
}

type PathStep = { relationshipType: string; direction: QueryDirection; targetLabel: string };

function findPathToLabel(
  ontology: OntologyRuntime,
  startLabel: string,
  targetLabel: string,
  maxDepth = 2
): PathStep[] | null {
  type QueueItem = { label: string; path: PathStep[] };
  const queue: QueueItem[] = [{ label: startLabel, path: [] }];
  const seen = new Set<string>([startLabel]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current.path.length >= maxDepth) continue;

    for (const relationshipType of ontology.relationshipTypes) {
      for (const direction of ["outbound", "inbound"] as const) {
        const targets = getAllowedTargets(ontology, relationshipType, direction);
        if (!targets.includes(current.label)) continue;
        const nextLabels = direction === "outbound"
          ? ontology.getRelationship(relationshipType)?.objectLabels ?? []
          : ontology.getRelationship(relationshipType)?.subjectLabels ?? [];
        for (const nextLabel of nextLabels) {
          const nextPath: PathStep[] = [
            ...current.path,
            { relationshipType, direction, targetLabel: nextLabel },
          ];
          if (nextLabel === targetLabel) return nextPath;
          const key = `${nextLabel}:${nextPath.length}`;
          if (!seen.has(key)) {
            seen.add(key);
            queue.push({ label: nextLabel, path: nextPath });
          }
        }
      }
    }
  }
  return null;
}

function toQueryStateFromLlm(payload: LlmInterpretPayload): QueryState {
  const startLabel = (payload.startLabel ?? "").trim();
  if (!startLabel) {
    throw new Error("Prompt could not be mapped to a valid query: missing startLabel.");
  }
  const startValue = (payload.startValue ?? "").trim();
  if (!startValue) {
    throw new Error("Prompt could not be mapped to a valid query: missing startValue.");
  }

  const rawSteps = payload.steps ?? [];
  if (rawSteps.length === 0) {
    throw new Error("Prompt could not be mapped to a valid query: no steps returned.");
  }

  const normalizedSteps = rawSteps.map((step) => {
    const direction: QueryDirection = step.direction === "inbound" ? "inbound" : "outbound";
    const relationshipType = (step.relationshipType ?? "").trim();
    if (!relationshipType) {
      throw new Error("Prompt could not be mapped to a valid query: missing relationshipType.");
    }
    const targetLabel = (step.targetLabel ?? "").trim();
    if (!targetLabel) {
      throw new Error(`Prompt could not be mapped to a valid query: missing targetLabel for ${relationshipType}.`);
    }
    const targetValue = (step.targetValue ?? "").trim();

    return {
      relationshipType,
      direction,
      target: {
        label: targetLabel,
        propertyKey: targetLabel === "Venue" ? "venue" : "name",
        value: targetValue,
      },
    };
  });

  return {
    start: {
      label: startLabel,
      propertyKey: startLabel === "Venue" ? "venue" : "name",
      value: startValue,
    },
    steps: normalizedSteps,
    limit: typeof payload.limit === "number" ? payload.limit : 25,
  };
}

function normalizeQueryStateValuesOnly(
  queryState: QueryState,
): QueryState {
  return {
    ...queryState,
    start: {
      ...queryState.start,
      value: (queryState.start.value ?? "").trim(),
    },
    steps: queryState.steps.map((step) => ({
      ...step,
      target: {
        ...step.target,
        value: (step.target.value ?? "").trim(),
      },
    })),
  };
}

type QueryStateDiagnostic = {
  code:
    | "UNKNOWN_START_LABEL"
    | "UNKNOWN_RELATIONSHIP_TYPE"
    | "UNKNOWN_TARGET_LABEL"
    | "INVALID_TARGET_FOR_RELATIONSHIP";
  message: string;
  stepIndex?: number;
  allowedTargets?: string[];
};

function diagnoseQueryStateAgainstOntology(
  queryState: QueryState,
  ontology: OntologyRuntime
): QueryStateDiagnostic[] {
  const diagnostics: QueryStateDiagnostic[] = [];
  const canonicalStart = ontology.resolveEntityLabel(queryState.start.label);
  if (!canonicalStart) {
    diagnostics.push({
      code: "UNKNOWN_START_LABEL",
      message: `Unknown start label: ${queryState.start.label}`,
    });
  }
  let currentLabel = canonicalStart ?? queryState.start.label;
  for (const [index, step] of queryState.steps.entries()) {
    const canonicalRelationshipType = ontology.resolveRelationshipType(step.relationshipType);
    if (!canonicalRelationshipType) {
      diagnostics.push({
        code: "UNKNOWN_RELATIONSHIP_TYPE",
        stepIndex: index,
        message: `Unknown relationship type: ${step.relationshipType}`,
      });
      currentLabel = step.target.label;
      continue;
    }
    const canonicalTarget = ontology.resolveEntityLabel(step.target.label);
    if (!canonicalTarget) {
      diagnostics.push({
        code: "UNKNOWN_TARGET_LABEL",
        stepIndex: index,
        message: `Unknown target label: ${step.target.label}`,
      });
      currentLabel = step.target.label;
      continue;
    }
    const schema = ontology.getRelationship(canonicalRelationshipType);
    const allowedTargets = step.direction === "outbound" ? schema?.objectLabels ?? [] : schema?.subjectLabels ?? [];
    if (!allowedTargets.includes(canonicalTarget)) {
      diagnostics.push({
        code: "INVALID_TARGET_FOR_RELATIONSHIP",
        stepIndex: index,
        message: `Invalid ${step.direction} target ${canonicalTarget} for ${canonicalRelationshipType} from ${currentLabel}`,
        allowedTargets,
      });
    }
    currentLabel = canonicalTarget;
  }
  return diagnostics;
}

function collectUnavailableRelationships(
  normalized: QueryState,
  ontology: OntologyRuntime,
  relationshipNamingSuggestion?: InterpretResult["relationshipNamingSuggestion"]
): NonNullable<InterpretResult["diagnostics"]>["unavailableRelationships"] {
  const unavailableRelationships: NonNullable<InterpretResult["diagnostics"]>["unavailableRelationships"] = [];
  let currentLabel = normalized.start.label;
  for (const step of normalized.steps) {
    const schema = ontology.getRelationship(step.relationshipType);
    if (!schema) {
      const proposal = upsertRelationshipProposal({
        relationshipType: step.relationshipType,
        sourcePhrase: relationshipNamingSuggestion?.sourcePhrase,
        recommendedType: relationshipNamingSuggestion?.recommendedType,
        aliasCandidates: (relationshipNamingSuggestion?.options ?? []).filter(
          (option) => option !== normalizeRelationshipTypeToken(step.relationshipType)
        ),
        direction: step.direction,
        fromLabel: currentLabel,
        toLabel: step.target.label,
      });
      unavailableRelationships.push({
        proposalId: proposal.id,
        status: proposal.status,
        relationshipType: step.relationshipType,
        direction: step.direction,
        fromLabel: currentLabel,
        toLabel: step.target.label,
        allowedTargets: [],
      });
      currentLabel = step.target.label;
      continue;
    }
    const allowedTargets = step.direction === "outbound" ? schema.objectLabels : schema.subjectLabels;
    if (!allowedTargets.includes(step.target.label)) {
      const proposal = upsertRelationshipProposal({
        relationshipType: step.relationshipType,
        sourcePhrase: relationshipNamingSuggestion?.sourcePhrase,
        recommendedType: relationshipNamingSuggestion?.recommendedType,
        aliasCandidates: (relationshipNamingSuggestion?.options ?? []).filter(
          (option) => option !== normalizeRelationshipTypeToken(step.relationshipType)
        ),
        direction: step.direction,
        fromLabel: currentLabel,
        toLabel: step.target.label,
      });
      unavailableRelationships.push({
        proposalId: proposal.id,
        status: proposal.status,
        relationshipType: step.relationshipType,
        direction: step.direction,
        fromLabel: currentLabel,
        toLabel: step.target.label,
        allowedTargets: [...allowedTargets],
      });
    }
    currentLabel = step.target.label;
  }
  return unavailableRelationships;
}

function collectUnavailableRelationshipsWithoutUpsert(
  normalized: QueryState,
  ontology: OntologyRuntime
): Array<{
  relationshipType: string;
  direction: QueryDirection;
  fromLabel: string;
  toLabel: string;
  allowedTargets: string[];
}> {
  const unavailableRelationships: Array<{
    relationshipType: string;
    direction: QueryDirection;
    fromLabel: string;
    toLabel: string;
    allowedTargets: string[];
  }> = [];
  let currentLabel = normalized.start.label;
  for (const step of normalized.steps) {
    const schema = ontology.getRelationship(step.relationshipType);
    if (!schema) {
      unavailableRelationships.push({
        relationshipType: step.relationshipType,
        direction: step.direction,
        fromLabel: currentLabel,
        toLabel: step.target.label,
        allowedTargets: [],
      });
      currentLabel = step.target.label;
      continue;
    }
    const allowedTargets = step.direction === "outbound" ? schema.objectLabels : schema.subjectLabels;
    if (!allowedTargets.includes(step.target.label)) {
      unavailableRelationships.push({
        relationshipType: step.relationshipType,
        direction: step.direction,
        fromLabel: currentLabel,
        toLabel: step.target.label,
        allowedTargets: [...allowedTargets],
      });
    }
    currentLabel = step.target.label;
  }
  return unavailableRelationships;
}

function extractFunctionCalls(payload: ResponsesApiPayload): ResponsesFunctionCallItem[] {
  const output = (payload as { output?: unknown[] }).output;
  if (!Array.isArray(output)) return [];
  return output
    .filter((item): item is ResponsesFunctionCallItem => Boolean(item && typeof item === "object"))
    .filter((item) => item.type === "function_call" && typeof item.name === "string");
}

function executeInterpreterTool(
  call: ResponsesFunctionCallItem,
  ontology: OntologyRuntime,
  prompt: string
): Record<string, unknown> {
  const args = parseJsonObject(call.arguments ?? "{}");
  const name = call.name ?? "";

  if (name === "get_ontology_snapshot") {
    return {
      entityLabels: ontology.entityLabels,
      relationships: ontology.relationshipTypes.map((type) => {
        const rel = ontology.getRelationship(type);
        return {
          type,
          subjectLabels: rel?.subjectLabels ?? [],
          objectLabels: rel?.objectLabels ?? [],
          synonyms: rel?.synonyms ?? [],
        };
      }),
    };
  }

  if (name === "resolve_entity_label") {
    const label = typeof args.label === "string" ? args.label : "";
    return { input: label, resolved: ontology.resolveEntityLabel(label) ?? null };
  }

  if (name === "resolve_relationship_type") {
    const relationshipType = typeof args.relationshipType === "string" ? args.relationshipType : "";
    return { input: relationshipType, resolved: ontology.resolveRelationshipType(relationshipType) ?? null };
  }

  if (name === "get_relationship_schema") {
    const relationshipType = typeof args.relationshipType === "string" ? args.relationshipType : "";
    const resolved = ontology.resolveRelationshipType(relationshipType) ?? relationshipType;
    const schema = ontology.getRelationship(resolved);
    return {
      relationshipType: resolved,
      exists: Boolean(schema),
      subjectLabels: schema?.subjectLabels ?? [],
      objectLabels: schema?.objectLabels ?? [],
      synonyms: schema?.synonyms ?? [],
    };
  }

  if (name === "get_allowed_outgoing_relationship_types") {
    const label = typeof args.label === "string" ? args.label : "";
    const resolved = ontology.resolveEntityLabel(label) ?? label;
    return {
      label: resolved,
      relationshipTypes: ontology.getAllowedOutgoingRelationshipTypes(resolved),
    };
  }

  if (name === "find_path_between_labels") {
    const startLabelInput = typeof args.startLabel === "string" ? args.startLabel : "";
    const targetLabelInput = typeof args.targetLabel === "string" ? args.targetLabel : "";
    const startLabel = ontology.resolveEntityLabel(startLabelInput) ?? startLabelInput;
    const targetLabel = ontology.resolveEntityLabel(targetLabelInput) ?? targetLabelInput;
    const maxDepth = typeof args.maxDepth === "number" ? Math.max(1, Math.min(4, Math.floor(args.maxDepth))) : 2;
    const path = findPathToLabel(ontology, startLabel, targetLabel, maxDepth);
    return { startLabel, targetLabel, maxDepth, path: path ?? [] };
  }

  if (name === "validate_query_state") {
    const queryStateJson = typeof args.queryStateJson === "string" ? args.queryStateJson : "";
    const raw = parseJsonObject(queryStateJson);
    if (!raw || Object.keys(raw).length === 0) {
      return { valid: false, error: "queryStateJson is required" };
    }
    try {
      const normalized = normalizeQueryStateValuesOnly(raw as unknown as QueryState);
      const diagnostics = diagnoseQueryStateAgainstOntology(normalized, ontology);
      return {
        valid: diagnostics.length === 0,
        diagnostics,
        unavailableRelationships: collectUnavailableRelationshipsWithoutUpsert(normalized, ontology),
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { error: `Unknown tool: ${name}` };
}

async function interpretWithLlm(
  prompt: string,
  ontology: OntologyRuntime,
  _insightHints: string[],
  llmState?: ResponsesConversationState
): Promise<{
  queryState?: QueryState;
  rationale: string;
  needsFollowUp?: boolean;
  followUpQuestion?: string;
  followUpOptions?: string[];
  proposedAdditions?: InterpretResult["proposedAdditions"];
  diagnostics?: InterpretResult["diagnostics"];
  relationshipNamingSuggestion?: InterpretResult["relationshipNamingSuggestion"];
  llmState?: ResponsesConversationState;
  usage?: ResponsesTokenUsage;
}> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const model = process.env.OPENAI_MODEL?.trim() || process.env.OPENAI_MODEL_ENRICHMENT?.trim() || "gpt-5.4";
  const baseUrl = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const url = `${baseUrl.replace(/\/$/, "")}/responses`;

  const tools: Array<Record<string, unknown>> = [
    {
      type: "function",
      name: "get_ontology_snapshot",
      description: "Get current ontology entities and relationships.",
      strict: true,
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "resolve_entity_label",
      description: "Resolve a candidate entity label to a canonical ontology label.",
      strict: true,
      parameters: {
        type: "object",
        properties: { label: { type: "string" } },
        required: ["label"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "resolve_relationship_type",
      description: "Resolve a candidate relationship type to a canonical ontology relationship type.",
      strict: true,
      parameters: {
        type: "object",
        properties: { relationshipType: { type: "string" } },
        required: ["relationshipType"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "get_relationship_schema",
      description: "Return schema metadata for a relationship type.",
      strict: true,
      parameters: {
        type: "object",
        properties: { relationshipType: { type: "string" } },
        required: ["relationshipType"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "get_allowed_outgoing_relationship_types",
      description: "List allowed outgoing relationship types from an entity label.",
      strict: true,
      parameters: {
        type: "object",
        properties: { label: { type: "string" } },
        required: ["label"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "find_path_between_labels",
      description: "Find a short ontology path between two entity labels.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          startLabel: { type: "string" },
          targetLabel: { type: "string" },
        },
        required: ["startLabel", "targetLabel"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: "validate_query_state",
      description: "Validate and normalize a candidate query state against ontology constraints.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          queryStateJson: { type: "string" },
        },
        required: ["queryStateJson"],
        additionalProperties: false,
      },
    },
  ];

  const system = [
    "You are an ontology-constrained query intent parser and must use tools to inspect/validate ontology state.",
    "Return JSON only.",
    "Use this shape: { rejected, rejectionReason?, followUpQuestion?, startLabel, startValue, steps:[{relationshipType,direction,targetLabel,targetValue}], limit, rationale }.",
    "Do not guess ontology details. Call tools whenever label/relationship validity is uncertain.",
    "The first user prompt is the source of intent. Preserve user intent; do not substitute a different goal.",
    "Do not introduce intent not explicitly implied by the user prompt.",
    "If ambiguous or under-specified, set rejected=true and ask one concrete follow-up question in followUpQuestion.",
    "If the user is proposing a new relationship not present in ontology, keep rejected=true and include relationshipNamingSuggestion with sourcePhrase, recommendedType, options (3-5 ontology-style UPPER_SNAKE names), and rationale.",
    "When a new relationship is needed, still return best-effort startLabel/startValue/steps that represent the user's requested intent.",
    "When suggesting names, pick one recommended canonical relationship and include alternatives as aliases.",
    "Keep entity values concise and literal.",
    "Output JSON only.",
  ].join(" ");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  const requestOnce = async (body: Record<string, unknown>): Promise<ResponsesApiPayload & { output_text?: string }> => {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Interpretation LLM failed with ${response.status}${details ? `: ${details}` : ""}`);
    }
    return (await response.json()) as ResponsesApiPayload & { output_text?: string };
  };

  let nextLlmState: ResponsesConversationState = { ...llmState };
  let payload: (ResponsesApiPayload & { output_text?: string }) | null = null;
  const usageTotals: ResponsesTokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  let body: Record<string, unknown> = {
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    tools,
    tool_choice: "auto",
    parallel_tool_calls: false,
    text: { format: { type: "json_object" } },
    store: true,
  };
  if (nextLlmState.conversationId) {
    body.conversation = nextLlmState.conversationId;
  }
  if (nextLlmState.previousResponseId) {
    body.previous_response_id = nextLlmState.previousResponseId;
  }

  for (let i = 0; i < 6; i += 1) {
    payload = await requestOnce(body);
    const usage = getUsageFromResponsesPayload(payload);
    usageTotals.inputTokens += usage.inputTokens;
    usageTotals.outputTokens += usage.outputTokens;
    usageTotals.totalTokens += usage.totalTokens;
    nextLlmState = {
      conversationId: getConversationIdFromResponsesPayload(payload) ?? nextLlmState.conversationId,
      previousResponseId: payload.id,
    };
    const functionCalls = extractFunctionCalls(payload);
    if (functionCalls.length === 0) break;

    const toolOutputs = functionCalls.map((call, index) => {
      const callId = call.call_id ?? `${call.name ?? "tool"}_${index}`;
      const output = executeInterpreterTool(call, ontology, prompt);
      return {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output),
      };
    });

    body = {
      model,
      previous_response_id: payload.id,
      input: toolOutputs,
      tools,
      tool_choice: "auto",
      parallel_tool_calls: false,
      text: { format: { type: "json_object" } },
      store: true,
    };
    if (nextLlmState.conversationId) {
      body.conversation = nextLlmState.conversationId;
    }
  }

  if (!payload) {
    throw new Error("Interpretation LLM returned no payload.");
  }

  const outputText = getTextFromResponsesOutput(payload) || payload.output_text || JSON.stringify(payload);
  const parsed = extractJson(outputText) as LlmInterpretPayload;
  const relationshipNamingSuggestion = normalizeRelationshipNamingSuggestion(parsed.relationshipNamingSuggestion);
  if (parsed.rejected) {
    if (parsed.startLabel && parsed.startValue && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
      try {
        const queryState = toQueryStateFromLlm(parsed);
        const normalized = normalizeQueryStateValuesOnly(queryState);
        const ontologyValidationDiagnostics = diagnoseQueryStateAgainstOntology(normalized, ontology);
        const unavailableRelationships = collectUnavailableRelationships(
          normalized,
          ontology,
          relationshipNamingSuggestion
        );
        return {
          queryState: normalized,
          rationale:
            parsed.rejectionReason?.trim() ||
            "Captured intended relationship as a proposal; approval is needed before full compile.",
          relationshipNamingSuggestion,
          diagnostics: {
            unavailableRelationships,
            ontologyValidationDiagnostics,
          },
          llmState: nextLlmState,
          usage: usageTotals,
        };
      } catch {
        // Fall through to follow-up path when rejected payload lacks enough structured detail.
      }
    }
    const followUpQuestion =
      parsed.followUpQuestion?.trim() ||
      parsed.rejectionReason?.trim() ||
      "Can you clarify the exact relationship you want to traverse?";
    return {
      rationale: parsed.rejectionReason?.trim() || "Prompt requires clarification before intent mapping.",
      needsFollowUp: true,
      followUpQuestion,
      followUpOptions: relationshipNamingSuggestion?.options,
      relationshipNamingSuggestion,
      llmState: nextLlmState,
      usage: usageTotals,
    };
  }

  const queryState = toQueryStateFromLlm(parsed);
  const normalized = normalizeQueryStateValuesOnly(queryState);
  const ontologyValidationDiagnostics = diagnoseQueryStateAgainstOntology(normalized, ontology);
  const unavailableRelationships = collectUnavailableRelationships(normalized, ontology, relationshipNamingSuggestion);

  return {
    queryState: normalized,
    rationale: parsed.rationale?.trim() || "Used LLM-guided interpretation from the raw prompt.",
    relationshipNamingSuggestion,
    llmState: nextLlmState,
    usage: usageTotals,
    diagnostics: {
      unavailableRelationships,
      ontologyValidationDiagnostics,
    },
  };
}

export async function interpretQueryPrompt(
  prompt: string,
  ontology: OntologyRuntime,
  options?: { llmState?: ResponsesConversationState }
): Promise<InterpretResult> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt is required.");
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required. LLM interpretation is mandatory and fallback is disabled.");
  }

  const relevantInsights = findRelevantInsights(trimmedPrompt, 3);

  const insightHints = relevantInsights.map((item) => item.prompt);
  const llmResult = await interpretWithLlm(trimmedPrompt, ontology, insightHints, options?.llmState);
  if (llmResult.needsFollowUp || !llmResult.queryState) {
    return {
      strategy: "llm-follow-up",
      rationale: llmResult.rationale,
      usedInsightIds: relevantInsights.map((item) => item.id),
      needsFollowUp: true,
      followUpQuestion:
        llmResult.followUpQuestion?.trim() || "Can you clarify the exact relationship you want to traverse?",
      followUpOptions: llmResult.followUpOptions,
      relationshipNamingSuggestion: llmResult.relationshipNamingSuggestion,
      llmState: llmResult.llmState,
      usage: llmResult.usage,
    };
  }
  return {
    queryState: llmResult.queryState,
    strategy: "llm-ontology-compliance",
    rationale: llmResult.rationale,
    usedInsightIds: relevantInsights.map((item) => item.id),
    relationshipNamingSuggestion: llmResult.relationshipNamingSuggestion,
    llmState: llmResult.llmState,
    usage: llmResult.usage,
    proposedAdditions: llmResult.proposedAdditions,
    diagnostics: llmResult.diagnostics,
  };
}
