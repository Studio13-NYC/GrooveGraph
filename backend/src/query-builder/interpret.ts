import type { OntologyRuntime } from "../ontology";
import type { QueryState, QueryDirection } from "./types";
import { findRelevantInsights } from "./insights";
import { getTextFromResponsesOutput, type ResponsesApiPayload } from "../enrichment/llm/responses-api";
import { upsertRelationshipProposal } from "./relationship-proposals";

type InterpretResult = {
  queryState: QueryState;
  strategy: string;
  rationale: string;
  usedInsightIds: string[];
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
  };
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
  proposedNodes?: Array<{ label?: string; value?: string }>;
  proposedRelationships?: Array<{
    type?: string;
    fromLabel?: string;
    fromValue?: string;
    toLabel?: string;
    toValue?: string;
    direction?: QueryDirection;
  }>;
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

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanEntityValue(value: string): string {
  return value
    .trim()
    .replace(/^(?:by|about|for|named|called)\s+/i, "")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizePrompt(value)
    .split(/[^a-z0-9_]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function buildRelationshipPhrases(relationshipType: string, ontology: OntologyRuntime): string[] {
  const schema = ontology.getRelationship(relationshipType);
  const phrases = new Set<string>();
  const candidates = [relationshipType.replace(/_/g, " "), ...(schema?.synonyms ?? [])];
  for (const raw of candidates) {
    const normalized = normalizePrompt(raw);
    if (!normalized) continue;
    phrases.add(normalized);
    const withoutBy = normalizePrompt(normalized.replace(/\bby\b/g, " "));
    if (withoutBy && withoutBy !== normalized) {
      phrases.add(withoutBy);
    }
  }
  return [...phrases];
}

function selectRelationshipIntent(
  prompt: string,
  ontology: OntologyRuntime,
  currentLabel: string
): { relationshipType: string; matchedPhrase: string | null } {
  const normalized = normalizePrompt(prompt);
  const promptTokens = new Set(tokenize(prompt));
  const outgoing = ontology.getAllowedOutgoingRelationshipTypes(currentLabel);
  const candidates = outgoing.length > 0 ? outgoing : ontology.relationshipTypes;

  let best: { relationshipType: string; matchedPhrase: string | null; score: number } | null = null;
  for (const relationshipType of candidates) {
    const phrases = buildRelationshipPhrases(relationshipType, ontology);
    let score = 0;
    let matchedPhrase: string | null = null;
    for (const phrase of phrases) {
      if (normalized.includes(phrase)) {
        const phraseScore = phrase.split(" ").length * 3;
        if (!matchedPhrase || phrase.length > matchedPhrase.length) {
          matchedPhrase = phrase;
        }
        score += phraseScore;
      }
      for (const token of tokenize(phrase)) {
        if (promptTokens.has(token)) score += 1;
      }
    }
    if (!best || score > best.score) {
      best = { relationshipType, matchedPhrase, score };
    }
  }

  if (best && best.score > 0) {
    return { relationshipType: best.relationshipType, matchedPhrase: best.matchedPhrase };
  }
  return {
    relationshipType: candidates[0] ?? ontology.relationshipTypes[0] ?? "INFLUENCED_BY",
    matchedPhrase: null,
  };
}

function trimEntityCandidate(value: string): string {
  const beforeComma = value.split(",")[0] ?? "";
  return cleanEntityValue(beforeComma.replace(/[.?!]+$/, "").trim());
}

function extractEntityAfterPhrase(prompt: string, phrase: string): string {
  const normalized = normalizePrompt(prompt);
  const index = normalized.indexOf(phrase);
  if (index < 0) return "";
  const after = normalized.slice(index + phrase.length).trim();
  return trimEntityCandidate(after);
}

function extractEntityBeforePhrase(prompt: string, phrase: string): string {
  const normalized = normalizePrompt(prompt);
  const index = normalized.indexOf(phrase);
  if (index < 0) return "";
  const before = normalized.slice(0, index).trim();
  return trimEntityCandidate(before);
}

function inferStartValue(prompt: string): string {
  const quoted = prompt.match(/"([^"]+)"/);
  if (quoted?.[1]) return cleanEntityValue(quoted[1]);
  const simple = prompt.match(/(?:about|for|named|called)\s+([a-z0-9'&\-\s]{2,})/i);
  if (simple?.[1]) return cleanEntityValue(simple[1]);
  const words = cleanEntityValue(prompt.trim().split(/\s+/).slice(-3).join(" ").trim());
  return words || cleanEntityValue(prompt.trim());
}

function pickEntityLabelFromPrompt(prompt: string, ontology: OntologyRuntime): string {
  const normalized = normalizePrompt(prompt);
  for (const label of ontology.entityLabels) {
    if (normalized.includes(label.toLowerCase())) {
      return label;
    }
  }
  return "Artist";
}

function pickRelationshipFromPrompt(prompt: string, ontology: OntologyRuntime, currentLabel: string): string {
  return selectRelationshipIntent(prompt, ontology, currentLabel).relationshipType;
}

function pickTargetLabel(
  relationshipType: string,
  direction: QueryDirection,
  currentLabel: string,
  ontology: OntologyRuntime
): string {
  const schema = ontology.getRelationship(relationshipType);
  if (!schema) return currentLabel;
  if (direction === "outbound") {
    return schema.objectLabels[0] ?? currentLabel;
  }
  return schema.subjectLabels[0] ?? currentLabel;
}

function includesLabelToken(prompt: string, label: string, synonyms: string[]): boolean {
  const normalized = normalizePrompt(prompt);
  const candidates = [label, ...synonyms];
  return candidates.some((candidate) => {
    const token = normalizePrompt(candidate);
    if (!token) return false;
    return normalized.includes(token) || normalized.includes(`${token}s`);
  });
}

function detectDesiredResultLabel(prompt: string, ontology: OntologyRuntime): string | null {
  const normalized = normalizePrompt(prompt);
  if (!/^(what|which|who)\b/.test(normalized)) return null;
  for (const label of ontology.entityLabels) {
    const synonyms = ontology.getEntity(label)?.synonyms ?? [];
    if (includesLabelToken(prompt, label, synonyms)) {
      return label;
    }
  }
  return null;
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

function enforceOntologyQueryState(queryState: QueryState, prompt: string, ontology: OntologyRuntime): QueryState {
  const canonicalStartLabel = ontology.resolveEntityLabel(queryState.start.label) ?? queryState.start.label;
  let currentLabel = canonicalStartLabel;
  const repairedSteps = queryState.steps.map((step) => {
    const relationshipType = ontology.resolveRelationshipType(step.relationshipType) ?? step.relationshipType;
    const direction: QueryDirection = step.direction === "inbound" ? "inbound" : "outbound";
    const allowedTargets = getAllowedTargets(ontology, relationshipType, direction);
    let targetLabel = ontology.resolveEntityLabel(step.target.label) ?? step.target.label;
    if (!allowedTargets.includes(targetLabel) && allowedTargets.length > 0) {
      targetLabel = allowedTargets[0];
    }
    const repairedStep = {
      relationshipType,
      direction,
      target: {
        ...step.target,
        label: targetLabel,
        propertyKey: targetLabel === "Venue" ? "venue" : "name",
      },
    };
    currentLabel = targetLabel;
    return repairedStep;
  });

  const desiredLabel = detectDesiredResultLabel(prompt, ontology);
  if (desiredLabel && currentLabel !== desiredLabel) {
    const path = findPathToLabel(ontology, currentLabel, desiredLabel, 2);
    if (path) {
      for (const pathStep of path) {
        repairedSteps.push({
          relationshipType: pathStep.relationshipType,
          direction: pathStep.direction,
          target: {
            label: pathStep.targetLabel,
            propertyKey: pathStep.targetLabel === "Venue" ? "venue" : "name",
            value: "",
          },
        });
      }
    }
  }

  return {
    ...queryState,
    start: {
      ...queryState.start,
      label: canonicalStartLabel,
      propertyKey: canonicalStartLabel === "Venue" ? "venue" : "name",
    },
    steps: repairedSteps,
  };
}

function toQueryStateFromLlm(payload: LlmInterpretPayload, ontology: OntologyRuntime, prompt: string): QueryState {
  const startLabel = ontology.resolveEntityLabel(payload.startLabel ?? "") ?? pickEntityLabelFromPrompt(prompt, ontology);
  const startValue = (payload.startValue ?? "").trim();

  const rawSteps = payload.steps ?? [];
  const steps = rawSteps.length > 0 ? rawSteps : [{}];
  let currentLabel = startLabel;

  const normalizedSteps = steps.map((step) => {
    const direction: QueryDirection = step.direction === "inbound" ? "inbound" : "outbound";
    const relationshipType =
      ontology.resolveRelationshipType(step.relationshipType ?? "") ??
      pickRelationshipFromPrompt(prompt, ontology, currentLabel);
    const targetLabel =
      ontology.resolveEntityLabel(step.targetLabel ?? "") ??
      pickTargetLabel(relationshipType, direction, currentLabel, ontology);
    const targetValue = (step.targetValue ?? "").trim();

    currentLabel = targetLabel;
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

function normalizeQueryState(
  queryState: QueryState,
  _prompt: string,
  _ontology: OntologyRuntime
): QueryState {
  return {
    ...queryState,
    start: {
      ...queryState.start,
      value: cleanEntityValue(queryState.start.value ?? ""),
    },
    steps: queryState.steps.map((step) => ({
      ...step,
      target: {
        ...step.target,
        value: cleanEntityValue(step.target.value ?? ""),
      },
    })),
  };
}

async function interpretWithLlm(
  prompt: string,
  ontology: OntologyRuntime,
  _insightHints: string[]
): Promise<{
  queryState: QueryState;
  rationale: string;
  proposedAdditions?: InterpretResult["proposedAdditions"];
  diagnostics?: InterpretResult["diagnostics"];
}> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const model = process.env.OPENAI_MODEL?.trim() || process.env.OPENAI_MODEL_ENRICHMENT?.trim() || "gpt-5.4";
  const baseUrl = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const url = `${baseUrl.replace(/\/$/, "")}/responses`;

  const system = [
    "You are a query intent parser.",
    "Return JSON only.",
    "Use this shape: { rejected, rejectionReason?, startLabel, startValue, steps:[{relationshipType,direction,targetLabel,targetValue}], limit, rationale }.",
    "Infer a multi-step path when needed.",
    "Keep entity values clean and concise (no question fragments).",
    "Output JSON only.",
  ].join(" ");
  const user = prompt;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      text: { format: { type: "json_object" } },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Interpretation LLM failed with ${response.status}${details ? `: ${details}` : ""}`);
  }

  const payload = (await response.json()) as ResponsesApiPayload & { output_text?: string };
  const outputText = getTextFromResponsesOutput(payload) || payload.output_text || JSON.stringify(payload);
  const parsed = extractJson(outputText) as LlmInterpretPayload;
  if (parsed.rejected) {
    throw new Error(parsed.rejectionReason?.trim() || "Prompt could not be mapped to a valid ontology-compliant query.");
  }

  const queryState = toQueryStateFromLlm(parsed, ontology, prompt);
  const normalized = normalizeQueryState(queryState, prompt, ontology);
  const unavailableRelationships: NonNullable<InterpretResult["diagnostics"]>["unavailableRelationships"] = [];
  let currentLabel = normalized.start.label;
  for (const step of normalized.steps) {
    const schema = ontology.getRelationship(step.relationshipType);
    if (!schema) {
      const proposal = upsertRelationshipProposal({
        relationshipType: step.relationshipType,
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

  return {
    queryState: normalized,
    rationale: parsed.rationale?.trim() || "Used LLM-guided interpretation from the raw prompt.",
    diagnostics: {
      unavailableRelationships,
    },
  };
}

export async function interpretQueryPrompt(prompt: string, ontology: OntologyRuntime): Promise<InterpretResult> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt is required.");
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required. LLM interpretation is mandatory and fallback is disabled.");
  }

  const relevantInsights = findRelevantInsights(trimmedPrompt, 3);

  const insightHints = relevantInsights.map((item) => item.prompt);
  const llmResult = await interpretWithLlm(trimmedPrompt, ontology, insightHints);
  return {
    queryState: llmResult.queryState,
    strategy: "llm-ontology-compliance",
    rationale: llmResult.rationale,
    usedInsightIds: relevantInsights.map((item) => item.id),
    proposedAdditions: llmResult.proposedAdditions,
    diagnostics: llmResult.diagnostics,
  };
}
