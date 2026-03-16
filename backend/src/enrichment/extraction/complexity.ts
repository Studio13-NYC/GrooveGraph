/**
 * Extraction complexity and model routing (Phase 6). Derives complexity from IR
 * and optional scope; returns model name from env knobs for cost/accuracy balance.
 * Task-level routing: getModelForTask(taskType, complexity?) for precheck, normalize,
 * relation_extract, synthesis, triplet_expand.
 */

import type { ExtractionIR } from "../types";

export type ExtractionComplexity = "low" | "medium" | "high";

/** Task types for model routing (precheck → small, triplet_expand → frontier). */
export type ExtractionTaskType =
  | "precheck"
  | "normalize"
  | "relation_extract"
  | "synthesis"
  | "triplet_expand";

export interface ComplexityOptions {
  /** True when triplet has any:any or subject/object placeholder (broader query). */
  hasAnyScope?: boolean;
}

/** Default thresholds; override via ENRICHMENT_COMPLEXITY_FRONTIER_THRESHOLD (mention count). */
const DEFAULT_LOW_MENTION_CAP = 5;
const DEFAULT_HIGH_MENTION_THRESHOLD = 20;
const DEFAULT_HIGH_RELATION_THRESHOLD = 12;

/**
 * Derive complexity from IR size and options. Used to route to small/medium/frontier model.
 */
export function deriveExtractionComplexity(
  ir: ExtractionIR,
  options?: ComplexityOptions
): ExtractionComplexity {
  const mentionCount = ir.mentions.length;
  const relationCount = ir.relations.length;
  const threshold =
    typeof process !== "undefined" && process.env?.ENRICHMENT_COMPLEXITY_FRONTIER_THRESHOLD != null
      ? Number(process.env.ENRICHMENT_COMPLEXITY_FRONTIER_THRESHOLD)
      : DEFAULT_HIGH_MENTION_THRESHOLD;

  if (options?.hasAnyScope === true) return "high";
  if (mentionCount > threshold || relationCount > DEFAULT_HIGH_RELATION_THRESHOLD) return "high";
  if (mentionCount <= DEFAULT_LOW_MENTION_CAP && relationCount <= 2) return "low";
  return "medium";
}

/**
 * Return model name for the given complexity. Reads ENRICHMENT_MODEL_SMALL,
 * ENRICHMENT_MODEL_MEDIUM, ENRICHMENT_MODEL_FRONTIER; falls back to
 * OPENAI_MODEL / ENRICHMENT_LLM_MODEL / gpt-5.4.
 */
export function getModelForExtractionComplexity(complexity: ExtractionComplexity): string {
  const fallback =
    (typeof process !== "undefined" &&
      (process.env?.OPENAI_MODEL?.trim() || process.env?.ENRICHMENT_LLM_MODEL?.trim())) ||
    "gpt-5.4";

  if (typeof process === "undefined") return fallback;

  switch (complexity) {
    case "low":
      return process.env?.ENRICHMENT_MODEL_SMALL?.trim() || fallback;
    case "high":
      return process.env?.ENRICHMENT_MODEL_FRONTIER?.trim() || fallback;
    case "medium":
    default:
      return process.env?.ENRICHMENT_MODEL_MEDIUM?.trim() || fallback;
  }
}

/** Default complexity per task when not provided. */
const TASK_DEFAULT_COMPLEXITY: Record<ExtractionTaskType, ExtractionComplexity> = {
  precheck: "low",
  normalize: "low",
  relation_extract: "medium",
  synthesis: "medium",
  triplet_expand: "high",
};

const TASK_ENV_KEYS: Record<ExtractionTaskType, string> = {
  precheck: "ENRICHMENT_MODEL_PRECHECK",
  normalize: "ENRICHMENT_MODEL_NORMALIZE",
  relation_extract: "ENRICHMENT_MODEL_RELATION_EXTRACT",
  synthesis: "ENRICHMENT_MODEL_SYNTHESIS",
  triplet_expand: "ENRICHMENT_MODEL_TRIPLET_EXPAND",
};

/**
 * Return model name for the given task type (and optional complexity).
 * Uses ENRICHMENT_MODEL_PRECHECK, ENRICHMENT_MODEL_NORMALIZE, etc. when set;
 * otherwise falls back to complexity-based routing.
 */
export function getModelForTask(
  taskType: ExtractionTaskType,
  complexity?: ExtractionComplexity
): string {
  const c = complexity ?? TASK_DEFAULT_COMPLEXITY[taskType];
  if (typeof process !== "undefined") {
    const envVal = process.env[TASK_ENV_KEYS[taskType]]?.trim();
    if (envVal) return envVal;
  }
  return getModelForExtractionComplexity(c);
}
