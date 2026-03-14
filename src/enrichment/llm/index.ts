import type { ResearchBundle, ResearchBundleMetadata, ResearchOntologyContext, ResearchPacket, ReviewTargetEntity } from "../types";
import { buildResearchOntologyContext, ENRICHMENT_PROMPT_VERSION } from "./ontology-context";
import { OpenAiCompatibleProvider, type LlmProvider } from "./providers/openai-compatible";
import { validateResearchBundle } from "./validate-bundle";

export interface EnrichmentLlmResult {
  bundle: ResearchBundle;
  metadata: ResearchBundleMetadata;
}

function getOpenAiApiKey(): string {
  return process.env.OPENAI_API_KEY?.trim() || process.env.ENRICHMENT_LLM_API_KEY?.trim() || "";
}

function getOpenAiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || process.env.ENRICHMENT_LLM_MODEL?.trim() || "gpt-5.4";
}

export function isEnrichmentLlmConfigured(): boolean {
  return Boolean(getOpenAiApiKey());
}

function getOntologyContext(ontology?: ResearchOntologyContext): ResearchOntologyContext {
  return ontology ?? buildResearchOntologyContext();
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
    throw new Error("Enrichment LLM response was not valid JSON.");
  }
}

function buildFallbackEvidence(packet: ResearchPacket, targetId?: string): Array<Record<string, unknown>> {
  const matchingTargets = targetId
    ? packet.evidence.filter((entry) => entry.target.id === targetId)
    : packet.evidence;
  return matchingTargets
    .flatMap((entry) => entry.records)
    .slice(0, 5)
    .map((record) => ({
      evidenceId: record.evidenceId,
      source_id: record.source_id,
      source_name: record.source_name,
      source_type: record.source_type,
      url: record.url,
      retrieved_at: record.retrieved_at,
      excerpt: record.excerpt,
      confidence: record.confidence,
      notes: "Attached automatically because the LLM omitted explicit provenance.",
      structuredFacts: {
        properties: record.properties,
        relatedNodes: record.relatedNodes ?? [],
        relatedEdges: record.relatedEdges ?? [],
      },
    }));
}

function attachFallbackEvidence(rawBundle: unknown, packet: ResearchPacket): unknown {
  if (!rawBundle || typeof rawBundle !== "object" || Array.isArray(rawBundle)) {
    return rawBundle;
  }
  const bundle = { ...(rawBundle as Record<string, unknown>) };

  bundle.propertyChanges = Array.isArray(bundle.propertyChanges)
    ? bundle.propertyChanges.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        const candidate = { ...(item as Record<string, unknown>) };
        const hasEvidence = Array.isArray(candidate.evidence) && candidate.evidence.length > 0;
        if (!hasEvidence) {
          candidate.evidence = buildFallbackEvidence(packet, typeof candidate.targetId === "string" ? candidate.targetId : undefined);
        }
        return candidate;
      })
    : bundle.propertyChanges;

  bundle.nodeCandidates = Array.isArray(bundle.nodeCandidates)
    ? bundle.nodeCandidates.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        const candidate = { ...(item as Record<string, unknown>) };
        const hasEvidence = Array.isArray(candidate.evidence) && candidate.evidence.length > 0;
        if (!hasEvidence) {
          candidate.evidence = buildFallbackEvidence(packet);
        }
        return candidate;
      })
    : bundle.nodeCandidates;

  bundle.edgeCandidates = Array.isArray(bundle.edgeCandidates)
    ? bundle.edgeCandidates.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        const candidate = { ...(item as Record<string, unknown>) };
        const hasEvidence = Array.isArray(candidate.evidence) && candidate.evidence.length > 0;
        if (!hasEvidence) {
          candidate.evidence = buildFallbackEvidence(packet);
        }
        return candidate;
      })
    : bundle.edgeCandidates;

  return bundle;
}

function createProvider(): LlmProvider {
  const apiKey = getOpenAiApiKey();
  const model = getOpenAiModel();
  if (!apiKey) {
    throw new Error("Enrichment LLM is not configured. Set OPENAI_API_KEY.");
  }
  return new OpenAiCompatibleProvider({
    apiKey,
    model,
    baseUrl:
      process.env.OPENAI_BASE_URL?.trim() ||
      process.env.ENRICHMENT_LLM_BASE_URL?.trim() ||
      "https://api.openai.com/v1",
    providerName: "OpenAI",
  });
}

export async function synthesizeResearchBundle(
  packet: ResearchPacket,
  options?: {
    ontology?: ResearchOntologyContext;
    targets?: ReviewTargetEntity[];
  }
): Promise<EnrichmentLlmResult> {
  // #region agent log
  const model = getOpenAiModel();
  const hasKey = Boolean(getOpenAiApiKey());
  fetch("http://127.0.0.1:7290/ingest/d02d8ae0-2fcc-4270-9ab1-7e7cc64f475b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e8d527" },
    body: JSON.stringify({
      sessionId: "e8d527",
      runId: "run1",
      hypothesisId: "H1",
      location: "llm/index.ts:synthesizeResearchBundle:entry",
      message: "synthesizeResearchBundle started",
      data: { packetSessionId: packet.sessionId, model, hasKey, evidenceCount: packet.evidence.reduce((s, t) => s + t.records.length, 0) },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const provider = createProvider();
  // #region agent log
  fetch("http://127.0.0.1:7290/ingest/d02d8ae0-2fcc-4270-9ab1-7e7cc64f475b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e8d527" },
    body: JSON.stringify({
      sessionId: "e8d527",
      runId: "run1",
      hypothesisId: "H5",
      location: "llm/index.ts:synthesizeResearchBundle:before-synthesize",
      message: "calling OpenAI provider.synthesize",
      data: { model },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const providerResult = await provider.synthesize(packet);
  // #region agent log
  fetch("http://127.0.0.1:7290/ingest/d02d8ae0-2fcc-4270-9ab1-7e7cc64f475b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e8d527" },
    body: JSON.stringify({
      sessionId: "e8d527",
      runId: "run1",
      hypothesisId: "H3",
      location: "llm/index.ts:synthesizeResearchBundle:after-synthesize",
      message: "OpenAI returned successfully",
      data: { model: providerResult.model, rawTextLength: providerResult.rawText?.length ?? 0 },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const ontology = getOntologyContext(options?.ontology ?? packet.ontology);
  const rawJson = extractJson(providerResult.rawText);
  // #region agent log
  fetch("http://127.0.0.1:7290/ingest/d02d8ae0-2fcc-4270-9ab1-7e7cc64f475b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e8d527" },
    body: JSON.stringify({
      sessionId: "e8d527",
      runId: "run1",
      hypothesisId: "H4",
      location: "llm/index.ts:synthesizeResearchBundle:after-extractJson",
      message: "extractJson succeeded",
      data: { hasRawJson: !!rawJson, keys: rawJson && typeof rawJson === "object" && !Array.isArray(rawJson) ? Object.keys(rawJson as object) : [] },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const normalizedRawBundle = attachFallbackEvidence(rawJson, packet);
  // #region agent log
  fetch("http://127.0.0.1:7290/ingest/d02d8ae0-2fcc-4270-9ab1-7e7cc64f475b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e8d527" },
    body: JSON.stringify({
      sessionId: "e8d527",
      runId: "run1",
      hypothesisId: "H4",
      location: "llm/index.ts:synthesizeResearchBundle:after-attachFallback",
      message: "attachFallbackEvidence succeeded",
      data: {},
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const bundle = validateResearchBundle(normalizedRawBundle, {
    sessionId: packet.sessionId,
    targets: options?.targets ?? packet.targets,
    ontology,
  });
  // #region agent log
  fetch("http://127.0.0.1:7290/ingest/d02d8ae0-2fcc-4270-9ab1-7e7cc64f475b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e8d527" },
    body: JSON.stringify({
      sessionId: "e8d527",
      runId: "run1",
      hypothesisId: "H4",
      location: "llm/index.ts:synthesizeResearchBundle:after-validate",
      message: "validateResearchBundle succeeded",
      data: { nodeCount: bundle.nodeCandidates.length, edgeCount: bundle.edgeCandidates.length, propertyCount: bundle.propertyChanges.length },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const metadata: ResearchBundleMetadata = {
    generator: "llm",
    provider: providerResult.provider,
    model: providerResult.model,
    promptVersion: ENRICHMENT_PROMPT_VERSION,
    evidenceRecordCount: packet.evidence.reduce((sum, target) => sum + target.records.length, 0),
    sourceCount: packet.sourcePlan?.entries.filter((entry) => entry.applicableTargetIds.length > 0).length,
  };

  return {
    bundle: {
      ...bundle,
      metadata: {
        ...metadata,
        ...(bundle.metadata ?? {}),
        generator: "llm",
        provider: providerResult.provider,
        model: providerResult.model,
        promptVersion: ENRICHMENT_PROMPT_VERSION,
        evidenceRecordCount: metadata.evidenceRecordCount,
        sourceCount: metadata.sourceCount,
      },
    },
    metadata,
  };
}
