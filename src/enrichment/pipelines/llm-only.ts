/**
 * GPT-5.4–only enrichment pipeline. No external sources (Wikipedia, MusicBrainz, etc.).
 * Uses a single LLM call with schema + explanation prompt to produce a ResearchBundle.
 * Swap in via ENRICHMENT_PIPELINE=llm-only.
 */

import type { GraphStore } from "../../store/types";
import type { TripletSpec } from "../triplet";
import type {
  ResearchBundle,
  ResearchBundleMetadata,
  ResearchOntologyContext,
  ReviewTargetEntity,
} from "../types";
import { buildResearchOntologyContext } from "../llm/ontology-context";
import { validateResearchBundle } from "../llm/validate-bundle";
import { buildLlmOnlyPrompt, getLlmOnlyProvenance, LLM_ONLY_PROMPT_VERSION } from "./llm-only-schema";

const LOG_PREFIX = "[llm-only-pipeline]";

function getApiKey(): string {
  const key =
    process.env.OPENAI_API_KEY?.trim() || process.env.ENRICHMENT_LLM_API_KEY?.trim() || "";
  return key;
}

function getBaseUrl(): string {
  return (
    process.env.OPENAI_BASE_URL?.trim() ||
    process.env.ENRICHMENT_LLM_BASE_URL?.trim() ||
    "https://api.openai.com/v1"
  );
}

/** Model for LLM-only pipeline; default gpt-5-nano for low-cost end-to-end runs. */
function getModel(): string {
  return (
    process.env.OPENAI_MODEL?.trim() ||
    process.env.ENRICHMENT_LLM_MODEL?.trim() ||
    "gpt-5-nano"
  );
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
    throw new Error("LLM-only pipeline: response was not valid JSON.");
  }
}

function attachProvenance(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const bundle = { ...(raw as Record<string, unknown>) };
  const provenance = [getLlmOnlyProvenance()];

  const withProvenance = <T extends Record<string, unknown>>(
    item: T,
    key: string
  ): T => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const candidate = { ...(item as Record<string, unknown>) };
    const existing = candidate.provenance;
    if (!Array.isArray(existing) || existing.length === 0) {
      candidate.provenance = provenance;
    }
    return candidate as T;
  };

  bundle.propertyChanges = Array.isArray(bundle.propertyChanges)
    ? bundle.propertyChanges.map((item) => withProvenance(item as Record<string, unknown>, "propertyChanges"))
    : bundle.propertyChanges;
  bundle.nodeCandidates = Array.isArray(bundle.nodeCandidates)
    ? bundle.nodeCandidates.map((item) => withProvenance(item as Record<string, unknown>, "nodeCandidates"))
    : bundle.nodeCandidates;
  bundle.edgeCandidates = Array.isArray(bundle.edgeCandidates)
    ? bundle.edgeCandidates.map((item) => withProvenance(item as Record<string, unknown>, "edgeCandidates"))
    : bundle.edgeCandidates;

  return bundle;
}

export interface LlmOnlyPipelineResult {
  bundle: ResearchBundle;
  metadata: ResearchBundleMetadata;
}

/**
 * Run the LLM-only pipeline: prompt with schema and targets, return a validated ResearchBundle.
 * When triplet is provided (e.g. from extract UI), instructions ask for relationship-specific
 * node and edge candidates (e.g. guitars Paul Weller plays).
 */
export async function runLlmOnlyPipeline(
  sessionId: string,
  targets: ReviewTargetEntity[],
  options?: { ontology?: ResearchOntologyContext; triplet?: TripletSpec }
): Promise<LlmOnlyPipelineResult> {
  console.log(
    `${LOG_PREFIX} start sessionId=${sessionId} targets=${targets.length} targetNames=${targets.map((t) => t.name).join(", ")}${options?.triplet ? ` triplet=${options.triplet.relationship}` : ""}`
  );
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error(`${LOG_PREFIX} missing API key`);
    throw new Error("LLM-only pipeline requires OPENAI_API_KEY or ENRICHMENT_LLM_API_KEY.");
  }

  const ontology = options?.ontology ?? buildResearchOntologyContext();
  const { system, user } = buildLlmOnlyPrompt(sessionId, targets, ontology, options?.triplet);
  const model = getModel();
  const baseUrl = getBaseUrl().replace(/\/$/, "");
  const url = `${baseUrl}/chat/completions`;
  console.log(
    `${LOG_PREFIX} LLM request url=${url} model=${model} systemLen=${system.length} userLen=${user.length}`
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  console.log(`${LOG_PREFIX} LLM response status=${response.status}`);
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`${LOG_PREFIX} LLM error body:`, errorText.slice(0, 500));
    throw new Error(
      `LLM-only pipeline request failed with ${response.status}.${errorText ? ` ${errorText}` : ""}`
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawText =
    typeof payload.choices?.[0]?.message?.content === "string"
      ? payload.choices[0].message.content
      : "";
  if (!rawText) {
    console.error(`${LOG_PREFIX} LLM returned empty content; payload keys:`, Object.keys(payload ?? {}));
    throw new Error("LLM-only pipeline returned an empty response.");
  }
  console.log(`${LOG_PREFIX} LLM raw response length=${rawText.length} first200=${rawText.slice(0, 200)}`);

  let rawBundle: unknown;
  try {
    rawBundle = extractJson(rawText);
    console.log(`${LOG_PREFIX} extractJson ok`);
  } catch (extractErr) {
    console.error(`${LOG_PREFIX} extractJson failed:`, extractErr);
    console.error(`${LOG_PREFIX} rawText sample:`, rawText.slice(0, 400));
    throw extractErr;
  }
  const withProvenance = attachProvenance(rawBundle);
  let bundle: ResearchBundle;
  try {
    bundle = validateResearchBundle(withProvenance, {
      sessionId,
      targets,
      ontology,
    });
    console.log(
      `${LOG_PREFIX} validateResearchBundle ok nodeCandidates=${bundle.nodeCandidates?.length ?? 0} edgeCandidates=${bundle.edgeCandidates?.length ?? 0} propertyChanges=${bundle.propertyChanges?.length ?? 0}`
    );
  } catch (validationErr) {
    console.error(`${LOG_PREFIX} validateResearchBundle failed:`, validationErr);
    throw validationErr;
  }

  const metadata: ResearchBundleMetadata = {
    generator: "llm",
    provider: "OpenAI",
    model,
    promptVersion: LLM_ONLY_PROMPT_VERSION,
    evidenceRecordCount: 0,
    sourceCount: 1,
    notes: "Enrichment from LLM-only pipeline; no external sources.",
  };

  const mergedBundle: ResearchBundle = {
    ...bundle,
    metadata: {
      ...metadata,
      ...(bundle.metadata ?? {}),
      generator: "llm",
      provider: "OpenAI",
      model,
      promptVersion: LLM_ONLY_PROMPT_VERSION,
    },
  };

  console.log(`${LOG_PREFIX} done returning bundle`);
  return { bundle: mergedBundle, metadata };
}

export function isLlmOnlyPipelineConfigured(): boolean {
  return Boolean(getApiKey());
}

/** Check whether to use the LLM-only pipeline (swap). */
export function useLlmOnlyPipeline(): boolean {
  const v = process.env.ENRICHMENT_PIPELINE?.trim().toLowerCase();
  return v === "llm-only" || v === "llm_only";
}
