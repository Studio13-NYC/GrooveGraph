/**
 * Triplet exploration pipeline: subject —[relationship]—> object.
 * Single GPT-5.4 call returns all information that fits the pattern (e.g. guitars Paul Weller plays).
 */

import { Agent, fetch as undiciFetch } from "undici";
import type {
  ResearchBundle,
  ResearchBundleMetadata,
  ResearchOntologyContext,
  ReviewTargetEntity,
} from "../types";
import type { TripletSpec } from "../triplet";
import { buildResearchOntologyContext } from "../llm/ontology-context";
import { validateResearchBundle } from "../llm/validate-bundle";
import {
  buildTripletExplorationPrompt,
  TRIPLET_EXPLORATION_PROMPT_VERSION,
} from "./triplet-exploration-schema";
import { getLlmOnlyProvenance } from "./llm-only-schema";
import {
  deriveExtractionComplexity,
  getModelForTask,
} from "../extraction/complexity";
import { withRetry } from "../llm/fetch-with-retry";

const LOG_PREFIX = "[triplet-pipeline]";

function getApiKey(): string {
  return (
    process.env.OPENAI_API_KEY?.trim() || process.env.ENRICHMENT_LLM_API_KEY?.trim() || ""
  );
}

function getBaseUrl(): string {
  return (
    process.env.OPENAI_BASE_URL?.trim() ||
    process.env.ENRICHMENT_LLM_BASE_URL?.trim() ||
    "https://api.openai.com/v1"
  );
}

/** Model for triplet exploration; TRIPLET_LLM_MODEL overrides; else task-level (triplet_expand) + complexity. */
function getModel(options?: { hasAnySubject?: boolean; hasAnyObject?: boolean }, targets?: ReviewTargetEntity[]): string {
  const explicitTripletModel = process.env.TRIPLET_LLM_MODEL?.trim();
  if (explicitTripletModel) return explicitTripletModel;

  const hasAnyScope = !!(options?.hasAnySubject || options?.hasAnyObject);
  const ir = {
    mentions: (targets ?? []).map((t) => ({ id: t.id, text: t.name, label: t.label })),
    relations: [] as Array<{ id: string; type: string; fromMentionId: string; toMentionId: string }>,
  };
  const complexity = deriveExtractionComplexity(ir, { hasAnyScope });
  return getModelForTask("triplet_expand", complexity);
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
    throw new Error("Triplet exploration: response was not valid JSON.");
  }
}

function attachProvenance(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const bundle = { ...(raw as Record<string, unknown>) };
  const provenance = [getLlmOnlyProvenance()];

  const withProvenance = <T extends Record<string, unknown>>(item: T): T => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const candidate = { ...(item as Record<string, unknown>) };
    const existing = candidate.provenance;
    if (!Array.isArray(existing) || existing.length === 0) {
      candidate.provenance = provenance;
    }
    return candidate as T;
  };

  bundle.propertyChanges = Array.isArray(bundle.propertyChanges)
    ? bundle.propertyChanges.map((item) => withProvenance(item as Record<string, unknown>))
    : bundle.propertyChanges;
  bundle.nodeCandidates = Array.isArray(bundle.nodeCandidates)
    ? bundle.nodeCandidates.map((item) => withProvenance(item as Record<string, unknown>))
    : bundle.nodeCandidates;
  bundle.edgeCandidates = Array.isArray(bundle.edgeCandidates)
    ? bundle.edgeCandidates.map((item) => withProvenance(item as Record<string, unknown>))
    : bundle.edgeCandidates;

  return bundle;
}

export interface TripletExplorationResult {
  bundle: ResearchBundle;
  metadata: ResearchBundleMetadata;
}

/**
 * Run triplet exploration: prompt GPT-5.4 with subject—relationship—object, return validated bundle.
 * Targets must be [subjectTarget, objectTarget] with ids matching the stubs used in the session.
 */
export type TripletPipelineOptions = {
  ontology?: ResearchOntologyContext;
  scopeTarget?: ReviewTargetEntity;
  hasAnySubject?: boolean;
  hasAnyObject?: boolean;
};

export async function runTripletExplorationPipeline(
  sessionId: string,
  triplet: TripletSpec,
  targets: ReviewTargetEntity[],
  options?: TripletPipelineOptions
): Promise<TripletExplorationResult> {
  console.log(
    `${LOG_PREFIX} start sessionId=${sessionId} triplet=${triplet.subject.label}:${triplet.subject.name} — ${triplet.relationship} — ${triplet.object.label}:${triplet.object.name} targets=${targets.length}`
  );
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error(`${LOG_PREFIX} missing API key`);
    throw new Error(
      "Triplet exploration requires OPENAI_API_KEY or ENRICHMENT_LLM_API_KEY."
    );
  }

  const ontology = options?.ontology ?? buildResearchOntologyContext();
  const { system, user } = buildTripletExplorationPrompt(sessionId, triplet, targets, ontology, {
    scopeTarget: options?.scopeTarget,
    hasAnySubject: options?.hasAnySubject,
    hasAnyObject: options?.hasAnyObject,
  });
  const model = getModel(
    { hasAnySubject: options?.hasAnySubject, hasAnyObject: options?.hasAnyObject },
    targets
  );
  const baseUrl = getBaseUrl().replace(/\/$/, "");
  const url = `${baseUrl}/chat/completions`;
  console.log(
    `${LOG_PREFIX} LLM request url=${url} model=${model} systemLen=${system.length} userLen=${user.length}`
  );

  const requestBody = {
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: String(system) },
      { role: "user", content: String(user) },
    ],
  };
  let bodyString: string;
  try {
    bodyString = JSON.stringify(requestBody);
  } catch (serializeErr) {
    console.error(`${LOG_PREFIX} Failed to serialize request body:`, serializeErr);
    throw new Error("Triplet exploration: failed to build request body for OpenAI.");
  }

  const timeoutMs =
    Number(process.env.TRIPLET_LLM_TIMEOUT_MS) || Number(process.env.ENRICHMENT_LLM_TIMEOUT_MS) || 600_000;
  const dispatcher = new Agent({
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  });
  const response = await withRetry(
    async () => {
      const res = await undiciFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: bodyString,
        dispatcher,
      });
      if (!res.ok && res.status >= 500) {
        const err = new Error(`HTTP ${res.status}`);
        (err as Error & { status?: number }).status = res.status;
        throw err;
      }
      return res;
    },
    { logPrefix: LOG_PREFIX }
  );

  console.log(`${LOG_PREFIX} LLM response status=${response.status}`);
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`${LOG_PREFIX} LLM error body:`, errorText.slice(0, 500));
    throw new Error(
      `Triplet exploration request failed with ${response.status}.${errorText ? ` ${errorText}` : ""}`
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
    throw new Error("Triplet exploration returned an empty response.");
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
    promptVersion: TRIPLET_EXPLORATION_PROMPT_VERSION,
    evidenceRecordCount: 0,
    sourceCount: 1,
    notes: `Triplet exploration: ${triplet.subject.label}:${triplet.subject.name} — ${triplet.relationship} — ${triplet.object.label}:${triplet.object.name}.`,
  };

  const mergedBundle: ResearchBundle = {
    ...bundle,
    metadata: {
      ...metadata,
      ...(bundle.metadata ?? {}),
      generator: "llm",
      provider: "OpenAI",
      model,
      promptVersion: TRIPLET_EXPLORATION_PROMPT_VERSION,
    },
  };

  console.log(`${LOG_PREFIX} done returning bundle`);
  return { bundle: mergedBundle, metadata };
}
