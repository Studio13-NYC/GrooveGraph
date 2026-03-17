import type { OntologyRuntime } from "../ontology";
import type { QueryState, QueryDirection } from "./types";
import { fetchSummaryByName } from "../enrichment/adapters/wikipedia";
import { fetchArtistByName } from "../enrichment/adapters/musicbrainz";
import {
  getConversationIdFromResponsesPayload,
  getTextFromResponsesOutput,
  getUsageFromResponsesPayload,
  type ResponsesApiPayload,
  type ResponsesConversationState,
  type ResponsesTokenUsage,
} from "../enrichment/llm/responses-api";

type TraceLike = {
  log(event: string, data?: Record<string, unknown>): void;
};

type ProposedNode = { label: string; value: string; canonicalKey: string };
type ProposedRelationship = {
  type: string;
  fromCanonicalKey: string;
  toCanonicalKey: string;
  direction: QueryDirection;
  canonicalKey: string;
};

type ResearchAnswerPayload = {
  answerMarkdown?: string;
};

type ProposalExtractionPayload = {
  nodes?: Array<{
    label?: string;
    value?: string;
  }>;
  relationships?: Array<{
    type?: string;
    fromValue?: string;
    toValue?: string;
    direction?: QueryDirection;
    fromLabel?: string;
    toLabel?: string;
  }>;
};

export type ResearchAnswerResult = {
  answerMarkdown: string;
  proposedAdditions: {
    nodes: ProposedNode[];
    relationships: ProposedRelationship[];
  };
  strategy: "llm-research-answer";
  llmState?: ResponsesConversationState;
  stageMetrics?: {
    researchAnswer: { durationMs: number; usage: ResponsesTokenUsage };
    proposalExtraction: { durationMs: number; usage: ResponsesTokenUsage };
  };
};

type ResponsesFunctionCallItem = {
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
};

function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

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
    throw new Error("Research answer response was not valid JSON.");
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

function extractFunctionCalls(payload: ResponsesApiPayload): ResponsesFunctionCallItem[] {
  const output = (payload as { output?: unknown[] }).output;
  if (!Array.isArray(output)) return [];
  return output
    .filter((item): item is ResponsesFunctionCallItem => Boolean(item && typeof item === "object"))
    .filter((item) => item.type === "function_call" && typeof item.name === "string");
}

async function runResponsesToolLoop(params: {
  apiKey: string;
  model: string;
  baseUrl: string;
  systemPrompt: string;
  userPrompt: string;
  tools: Array<Record<string, unknown>>;
  executeTool: (call: ResponsesFunctionCallItem) => Record<string, unknown>;
  llmState?: ResponsesConversationState;
  jsonOutput?: boolean;
  maxTurns?: number;
}): Promise<{ outputText: string; llmState?: ResponsesConversationState; usage: ResponsesTokenUsage; durationMs: number }> {
  const startedAt = Date.now();
  const url = `${params.baseUrl.replace(/\/$/, "")}/responses`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${params.apiKey}`,
  };

  const requestOnce = async (body: Record<string, unknown>): Promise<ResponsesApiPayload & { output_text?: string }> => {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Responses call failed with ${response.status}${details ? `: ${details}` : ""}`);
    }
    return (await response.json()) as ResponsesApiPayload & { output_text?: string };
  };

  let llmState: ResponsesConversationState | undefined = params.llmState ? { ...params.llmState } : undefined;
  let payload: (ResponsesApiPayload & { output_text?: string }) | null = null;
  const usage: ResponsesTokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let body: Record<string, unknown> = {
    model: params.model,
    input: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userPrompt },
    ],
    tools: params.tools,
    tool_choice: "auto",
    parallel_tool_calls: false,
    store: true,
  };
  if (params.jsonOutput) {
    body.text = { format: { type: "json_object" } };
  }
  if (llmState?.conversationId) body.conversation = llmState.conversationId;
  if (llmState?.previousResponseId) body.previous_response_id = llmState.previousResponseId;

  const maxTurns = params.maxTurns ?? 6;
  for (let turn = 0; turn < maxTurns; turn += 1) {
    payload = await requestOnce(body);
    const currentUsage = getUsageFromResponsesPayload(payload);
    usage.inputTokens += currentUsage.inputTokens;
    usage.outputTokens += currentUsage.outputTokens;
    usage.totalTokens += currentUsage.totalTokens;
    llmState = {
      conversationId: getConversationIdFromResponsesPayload(payload) ?? llmState?.conversationId,
      previousResponseId: payload.id,
    };
    const functionCalls = extractFunctionCalls(payload);
    if (functionCalls.length === 0) break;
    const toolOutputs = functionCalls.map((call, index) => ({
      type: "function_call_output",
      call_id: call.call_id ?? `${call.name ?? "tool"}_${index}`,
      output: JSON.stringify(params.executeTool(call)),
    }));
    body = {
      model: params.model,
      previous_response_id: payload.id,
      input: toolOutputs,
      tools: params.tools,
      tool_choice: "auto",
      parallel_tool_calls: false,
      store: true,
    };
    if (params.jsonOutput) {
      body.text = { format: { type: "json_object" } };
    }
    if (llmState?.conversationId) body.conversation = llmState.conversationId;
  }

  if (!payload) {
    throw new Error("Responses loop ended without payload.");
  }
  const outputText = getTextFromResponsesOutput(payload) || payload.output_text || JSON.stringify(payload);
  return { outputText, llmState, usage, durationMs: Date.now() - startedAt };
}

function getSeedValues(prompt: string, queryState: QueryState): string[] {
  const values = [queryState.start.value, ...queryState.steps.map((step) => step.target.value)]
    .map((value) => cleanText(value))
    .filter((value) => value.length > 0);

  if (values.length > 0) {
    return [...new Set(values)].slice(0, 3);
  }

  const quoted = [...prompt.matchAll(/"([^"]+)"/g)].map((match) => cleanText(match[1] ?? ""));
  const normalized = quoted.filter((value) => value.length > 0);
  if (normalized.length > 0) {
    return [...new Set(normalized)].slice(0, 3);
  }

  return [];
}

async function collectEvidence(seedValues: string[], trace?: TraceLike): Promise<Array<Record<string, unknown>>> {
  const evidence: Array<Record<string, unknown>> = [];
  for (const seed of seedValues) {
    try {
      const wikipedia = await fetchSummaryByName(seed);
      for (const hit of wikipedia) {
        evidence.push({
          source: hit.source.source_name,
          url: hit.source.url,
          excerpt: hit.source.excerpt ?? String(hit.properties?.biography ?? "").slice(0, 400),
          subject: seed,
        });
      }
    } catch (error) {
      trace?.log("research.evidence.wikipedia.failed", {
        subject: seed,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const musicbrainz = await fetchArtistByName(seed);
      for (const hit of musicbrainz) {
        evidence.push({
          source: hit.source.source_name,
          url: hit.source.url,
          excerpt: hit.source.excerpt ?? JSON.stringify(hit.properties).slice(0, 400),
          subject: seed,
          relatedNodes: hit.relatedNodes ?? [],
          relatedEdges: hit.relatedEdges ?? [],
        });
      }
    } catch (error) {
      trace?.log("research.evidence.musicbrainz.failed", {
        subject: seed,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return evidence.slice(0, 20);
}

async function extractProposalsFromAnswer(params: {
  apiKey: string;
  model: string;
  baseUrl: string;
  answerText: string;
  prompt: string;
  queryState: QueryState;
  ontology: OntologyRuntime;
  trace?: TraceLike;
  llmState?: ResponsesConversationState;
}): Promise<{
  nodes: ProposedNode[];
  relationships: ProposedRelationship[];
  llmState?: ResponsesConversationState;
  usage: ResponsesTokenUsage;
  durationMs: number;
}> {
  const system = [
    "Pipeline stage: proposal_extraction.",
    "You extract graph candidates from music research text and may call tools whenever needed.",
    "Use only ontology labels and relationship types discovered via tools or provided context.",
    "Return strict JSON with keys: nodes, relationships.",
    "nodes: [{ label, value }].",
    "relationships: [{ type, fromValue, toValue, direction, fromLabel, toLabel }].",
    "Avoid duplicates and keep only concrete entities from the answer text.",
    "Do not invent entities not supported by the text.",
  ].join(" ");

  const ontologySnapshot = {
    entities: params.ontology.entityLabels,
    relationships: params.ontology.relationshipTypes.map((type) => {
      const rel = params.ontology.getRelationship(type);
      return {
        type,
        subjectLabels: rel?.subjectLabels ?? [],
        objectLabels: rel?.objectLabels ?? [],
        synonyms: rel?.synonyms ?? [],
      };
    }),
  };

  const user = JSON.stringify(
    {
      prompt: params.prompt,
      queryState: params.queryState,
      answerText: params.answerText,
      ontology: ontologySnapshot,
    },
    null,
    2
  );

  const tools: Array<Record<string, unknown>> = [
    {
      type: "function",
      name: "get_ontology_snapshot",
      description: "Get the ontology entities and relationships for extraction validation.",
      strict: true,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "resolve_entity_label",
      description: "Resolve candidate entity label to canonical ontology label.",
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
      description: "Resolve candidate relationship type to canonical ontology type.",
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
      name: "get_answer_text",
      description: "Get the latest research answer text to extract from.",
      strict: true,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  ];

  const extractionRun = await runResponsesToolLoop({
    apiKey: params.apiKey,
    model: params.model,
    baseUrl: params.baseUrl,
    systemPrompt: system,
    userPrompt: user,
    llmState: params.llmState,
    jsonOutput: true,
    tools,
    executeTool: (call) => {
      const args = parseJsonObject(call.arguments ?? "{}");
      if (call.name === "get_ontology_snapshot") return ontologySnapshot;
      if (call.name === "resolve_entity_label") {
        const label = typeof args.label === "string" ? args.label : "";
        return { input: label, resolved: params.ontology.resolveEntityLabel(label) ?? null };
      }
      if (call.name === "resolve_relationship_type") {
        const relationshipType = typeof args.relationshipType === "string" ? args.relationshipType : "";
        return { input: relationshipType, resolved: params.ontology.resolveRelationshipType(relationshipType) ?? null };
      }
      if (call.name === "get_answer_text") return { answerText: params.answerText };
      return { error: `Unknown tool: ${call.name ?? "unknown"}` };
    },
  });

  const outputText = extractionRun.outputText;
  const parsed = extractJson(outputText) as ProposalExtractionPayload;

  const nodes = new Map<string, ProposedNode>();
  const seedNodes = [
    { label: params.queryState.start.label, value: params.queryState.start.value },
    ...params.queryState.steps.map((step) => ({ label: step.target.label, value: step.target.value })),
  ];
  for (const seed of seedNodes) {
    const value = cleanText(seed.value ?? "");
    const label = params.ontology.resolveEntityLabel(seed.label ?? "") ?? seed.label;
    if (!value || !label) continue;
    const canonicalKey = `${label}:${value.toLowerCase()}`;
    nodes.set(canonicalKey, { label, value, canonicalKey });
  }

  for (const rawNode of parsed.nodes ?? []) {
    const value = cleanText(rawNode.value ?? "");
    const label = params.ontology.resolveEntityLabel(rawNode.label ?? "") ?? params.queryState.start.label;
    if (!value || !label) continue;
    const canonicalLabel = params.ontology.resolveEntityLabel(label) ?? label;
    const canonicalKey = `${canonicalLabel}:${value.toLowerCase()}`;
    nodes.set(canonicalKey, { label: canonicalLabel, value, canonicalKey });
  }

  const byValue = new Map<string, ProposedNode[]>();
  for (const node of nodes.values()) {
    const key = node.value.toLowerCase();
    byValue.set(key, [...(byValue.get(key) ?? []), node]);
  }

  const relationships = new Map<string, ProposedRelationship>();
  for (const rawRel of parsed.relationships ?? []) {
    const type = params.ontology.resolveRelationshipType(rawRel.type ?? "");
    if (!type) continue;
    const direction: QueryDirection = rawRel.direction === "inbound" ? "inbound" : "outbound";
    const fromValue = cleanText(rawRel.fromValue ?? "");
    const toValue = cleanText(rawRel.toValue ?? "");
    if (!fromValue || !toValue) continue;

    const fromCandidates = byValue.get(fromValue.toLowerCase()) ?? [];
    const toCandidates = byValue.get(toValue.toLowerCase()) ?? [];
    const relSchema = params.ontology.getRelationship(type);
    if (!relSchema) continue;

    for (const fromNode of fromCandidates) {
      for (const toNode of toCandidates) {
        const subjectLabel = direction === "outbound" ? fromNode.label : toNode.label;
        const objectLabel = direction === "outbound" ? toNode.label : fromNode.label;
        if (!relSchema.subjectLabels.includes(subjectLabel)) continue;
        if (!relSchema.objectLabels.includes(objectLabel)) continue;
        const canonicalKey = `${fromNode.canonicalKey}-${direction}:${type}->${toNode.canonicalKey}`;
        relationships.set(canonicalKey, {
          type,
          fromCanonicalKey: fromNode.canonicalKey,
          toCanonicalKey: toNode.canonicalKey,
          direction,
          canonicalKey,
        });
      }
    }
  }

  params.trace?.log("research.proposals.extracted", {
    nodeCount: nodes.size,
    relationshipCount: relationships.size,
  });

  return {
    nodes: [...nodes.values()],
    relationships: [...relationships.values()],
    llmState: extractionRun.llmState,
    usage: extractionRun.usage,
    durationMs: extractionRun.durationMs,
  };
}

export async function synthesizeResearchAnswer(params: {
  prompt: string;
  queryState: QueryState;
  ontology: OntologyRuntime;
  trace?: TraceLike;
  llmState?: ResponsesConversationState;
}): Promise<ResearchAnswerResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required. Research answer generation is mandatory.");
  }

  const model = process.env.OPENAI_MODEL?.trim() || process.env.OPENAI_MODEL_ENRICHMENT?.trim() || "gpt-5.4";
  const baseUrl = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const seeds = getSeedValues(params.prompt, params.queryState);
  const evidence = await collectEvidence(seeds, params.trace);
  params.trace?.log("research.evidence.collected", {
    seedCount: seeds.length,
    evidenceCount: evidence.length,
  });

  const system = [
    "Pipeline stage: research_answer.",
    "You are a music research assistant and may call tools whenever needed.",
    "Answer the user question directly in concise markdown.",
    "Do not output JSON.",
  ].join(" ");
  const user = params.prompt;

  params.trace?.log("research.llm.request", {
    model,
    seedCount: seeds.length,
    evidenceCount: evidence.length,
  });
  const tools: Array<Record<string, unknown>> = [
    {
      type: "function",
      name: "get_query_context",
      description: "Get current query state and user prompt context.",
      strict: true,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "get_evidence_bundle",
      description: "Get collected external evidence snippets for this query.",
      strict: true,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "get_ontology_snapshot",
      description: "Get ontology entities and relationship schemas.",
      strict: true,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  ];
  const ontologySnapshot = {
    entities: params.ontology.entityLabels,
    relationships: params.ontology.relationshipTypes.map((type) => {
      const rel = params.ontology.getRelationship(type);
      return {
        type,
        subjectLabels: rel?.subjectLabels ?? [],
        objectLabels: rel?.objectLabels ?? [],
        synonyms: rel?.synonyms ?? [],
      };
    }),
  };

  const researchRun = await runResponsesToolLoop({
    apiKey,
    model,
    baseUrl,
    systemPrompt: system,
    userPrompt: user,
    llmState: params.llmState,
    tools,
    executeTool: (call) => {
      if (call.name === "get_query_context") {
        return { prompt: params.prompt, queryState: params.queryState, seeds };
      }
      if (call.name === "get_evidence_bundle") {
        return { evidence };
      }
      if (call.name === "get_ontology_snapshot") {
        return ontologySnapshot;
      }
      return { error: `Unknown tool: ${call.name ?? "unknown"}` };
    },
  });
  const outputText = researchRun.outputText;
  let parsed: ResearchAnswerPayload = {};
  try {
    parsed = extractJson(outputText) as ResearchAnswerPayload;
  } catch {
    parsed = {};
  }
  const answerMarkdown = cleanText(parsed.answerMarkdown ?? outputText);
  if (!answerMarkdown) {
    throw new Error("Research answer generation failed: answerMarkdown was empty.");
  }
  const proposedAdditions = await extractProposalsFromAnswer({
    apiKey,
    model,
    baseUrl,
    answerText: answerMarkdown,
    prompt: params.prompt,
    queryState: params.queryState,
    ontology: params.ontology,
    trace: params.trace,
    llmState: researchRun.llmState,
  });
  params.trace?.log("research.llm.completed", {
    answerLength: answerMarkdown.length,
    nodeProposalCount: proposedAdditions.nodes.length,
    relationshipProposalCount: proposedAdditions.relationships.length,
  });

  return {
    answerMarkdown,
    proposedAdditions: {
      nodes: proposedAdditions.nodes,
      relationships: proposedAdditions.relationships,
    },
    strategy: "llm-research-answer",
    llmState: proposedAdditions.llmState,
    stageMetrics: {
      researchAnswer: {
        durationMs: researchRun.durationMs,
        usage: researchRun.usage,
      },
      proposalExtraction: {
        durationMs: proposedAdditions.durationMs,
        usage: proposedAdditions.usage,
      },
    },
  };
}
