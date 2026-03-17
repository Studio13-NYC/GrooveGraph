import type { OntologyRuntime } from "../ontology";
import type { QueryState, QueryDirection } from "./types";
import { findRelevantInsights } from "./insights";

type InterpretResult = {
  queryState: QueryState;
  strategy: string;
  rationale: string;
  usedInsightIds: string[];
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

function inferStartValue(prompt: string): string {
  const quoted = prompt.match(/"([^"]+)"/);
  if (quoted?.[1]) return quoted[1];
  const simple = prompt.match(/(?:about|for|named|called)\s+([a-z0-9'&\-\s]{2,})/i);
  if (simple?.[1]) return simple[1].trim();
  const words = prompt.trim().split(/\s+/).slice(-3).join(" ").trim();
  return words || prompt.trim();
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
  const normalized = normalizePrompt(prompt);
  const outgoing = ontology.getAllowedOutgoingRelationshipTypes(currentLabel);
  for (const relationshipType of outgoing) {
    if (normalized.includes(relationshipType.toLowerCase().replace(/_/g, " "))) {
      return relationshipType;
    }
  }
  return outgoing[0] ?? ontology.relationshipTypes[0] ?? "INFLUENCED_BY";
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

function toQueryStateFromLlm(payload: LlmInterpretPayload, ontology: OntologyRuntime, prompt: string): QueryState {
  const startLabel = ontology.resolveEntityLabel(payload.startLabel ?? "") ?? pickEntityLabelFromPrompt(prompt, ontology);
  const startValue = (payload.startValue ?? inferStartValue(prompt)).trim();

  const rawSteps = payload.steps ?? [];
  const steps = rawSteps.length > 0 ? rawSteps : [{}];
  let currentLabel = startLabel;

  const normalizedSteps = steps.map((step) => {
    const direction = step.direction === "inbound" ? "inbound" : "outbound";
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

async function interpretWithLlm(
  prompt: string,
  ontology: OntologyRuntime,
  insightHints: string[]
): Promise<{ queryState: QueryState; rationale: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.4";
  const baseUrl = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const url = `${baseUrl.replace(/\/$/, "")}/responses`;

  const system = [
    "You translate music graph intents into query state JSON.",
    "Output JSON only.",
    "Use valid ontology labels and relationship types from the provided lists.",
  ].join(" ");
  const user = JSON.stringify(
    {
      prompt,
      ontology: {
        labels: ontology.entityLabels,
        relationshipTypes: ontology.relationshipTypes,
      },
      insightHints,
      outputShape: {
        startLabel: "string",
        startValue: "string",
        steps: [
          {
            relationshipType: "string",
            direction: "outbound|inbound",
            targetLabel: "string",
            targetValue: "string",
          },
        ],
        limit: 25,
        rationale: "short reason",
      },
    },
    null,
    2
  );

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

  const payload = (await response.json()) as { output_text?: string };
  const outputText = payload.output_text ?? JSON.stringify(payload);
  const parsed = extractJson(outputText) as LlmInterpretPayload;
  const queryState = toQueryStateFromLlm(parsed, ontology, prompt);

  return {
    queryState,
    rationale: parsed.rationale?.trim() || "Used LLM-guided interpretation from prompt and ontology constraints.",
  };
}

function interpretWithHeuristics(prompt: string, ontology: OntologyRuntime): { queryState: QueryState; rationale: string } {
  const startLabel = pickEntityLabelFromPrompt(prompt, ontology);
  const relationshipType = pickRelationshipFromPrompt(prompt, ontology, startLabel);
  const direction: QueryDirection = "outbound";
  const targetLabel = pickTargetLabel(relationshipType, direction, startLabel, ontology);

  return {
    queryState: {
      start: {
        label: startLabel,
        propertyKey: startLabel === "Venue" ? "venue" : "name",
        value: inferStartValue(prompt),
      },
      steps: [
        {
          relationshipType,
          direction,
          target: {
            label: targetLabel,
            propertyKey: targetLabel === "Venue" ? "venue" : "name",
            value: "",
          },
        },
      ],
      limit: 25,
    },
    rationale: "Used fallback heuristic interpretation from ontology labels and relationship hints in prompt.",
  };
}

export async function interpretQueryPrompt(prompt: string, ontology: OntologyRuntime): Promise<InterpretResult> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Prompt is required.");
  }

  const relevantInsights = findRelevantInsights(trimmedPrompt, 3);
  const exactMatch = relevantInsights.find((item) => item.normalizedPrompt === normalizePrompt(trimmedPrompt));
  if (exactMatch?.queryState) {
    return {
      queryState: exactMatch.queryState,
      strategy: "insight-reuse-exact",
      rationale: "Reused an exact previous successful interpretation for this prompt.",
      usedInsightIds: [exactMatch.id],
    };
  }

  const insightHints = relevantInsights.map((item) => item.prompt);
  if (process.env.OPENAI_API_KEY?.trim()) {
    try {
      const llmResult = await interpretWithLlm(trimmedPrompt, ontology, insightHints);
      return {
        queryState: llmResult.queryState,
        strategy: "llm-guided",
        rationale: llmResult.rationale,
        usedInsightIds: relevantInsights.map((item) => item.id),
      };
    } catch {
      // Fall back to heuristic strategy.
    }
  }

  const heuristic = interpretWithHeuristics(trimmedPrompt, ontology);
  return {
    queryState: heuristic.queryState,
    strategy: "heuristic-fallback",
    rationale: heuristic.rationale,
    usedInsightIds: relevantInsights.map((item) => item.id),
  };
}
