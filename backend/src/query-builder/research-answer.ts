import type { OntologyRuntime } from "../ontology";
import type { QueryState, QueryDirection } from "./types";
import { fetchSummaryByName } from "../enrichment/adapters/wikipedia";
import { fetchArtistByName } from "../enrichment/adapters/musicbrainz";
import { getTextFromResponsesOutput, type ResponsesApiPayload } from "../enrichment/llm/responses-api";

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
}): Promise<{ nodes: ProposedNode[]; relationships: ProposedRelationship[] }> {
  const url = `${params.baseUrl.replace(/\/$/, "")}/responses`;
  const system = [
    "You extract graph candidates from music research text.",
    "Use only ontology labels and relationship types provided.",
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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Proposal extraction LLM failed with ${response.status}${details ? `: ${details}` : ""}`);
  }

  const payload = (await response.json()) as ResponsesApiPayload & { output_text?: string };
  const outputText = getTextFromResponsesOutput(payload) || payload.output_text || "";
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

  return { nodes: [...nodes.values()], relationships: [...relationships.values()] };
}

export async function synthesizeResearchAnswer(params: {
  prompt: string;
  queryState: QueryState;
  ontology: OntologyRuntime;
  trace?: TraceLike;
}): Promise<ResearchAnswerResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required. Research answer generation is mandatory.");
  }

  const model = process.env.OPENAI_MODEL?.trim() || process.env.OPENAI_MODEL_ENRICHMENT?.trim() || "gpt-5.4";
  const baseUrl = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const url = `${baseUrl.replace(/\/$/, "")}/responses`;

  const seeds = getSeedValues(params.prompt, params.queryState);
  const evidence = await collectEvidence(seeds, params.trace);
  params.trace?.log("research.evidence.collected", {
    seedCount: seeds.length,
    evidenceCount: evidence.length,
  });

  const system = [
    "You are a music research assistant.",
    "Answer the user question directly in concise markdown.",
    "Do not output JSON.",
  ].join(" ");
  const user = params.prompt;

  params.trace?.log("research.llm.request", {
    model,
    seedCount: seeds.length,
    evidenceCount: evidence.length,
  });
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
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Research answer LLM failed with ${response.status}${details ? `: ${details}` : ""}`);
  }

  const payload = (await response.json()) as ResponsesApiPayload & { output_text?: string };
  const outputText = getTextFromResponsesOutput(payload) || payload.output_text || JSON.stringify(payload);
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
  });
  params.trace?.log("research.llm.completed", {
    answerLength: answerMarkdown.length,
    nodeProposalCount: proposedAdditions.nodes.length,
    relationshipProposalCount: proposedAdditions.relationships.length,
  });

  return {
    answerMarkdown,
    proposedAdditions,
    strategy: "llm-research-answer",
  };
}
