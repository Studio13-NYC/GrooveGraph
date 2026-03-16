/**
 * Extraction orchestrator (Phase 2). Dispatches to the appropriate adapter(s) by
 * input type and returns result plus per-run metadata for evaluation.
 * Supports engine modes: single (default), ab_test, dual_run, ensemble (Phase 7).
 */

import type { ResearchOntologyContext } from "../types";
import type { ExtractionIR } from "../types";
import { hasExtractionMetadata } from "./types";
import type {
  ExtractionEngineMode,
  ExtractionResult,
  ExtractionRunMetadata,
} from "./types";
import { tripletExtractionAdapter } from "../adapters/triplet-extraction-adapter";
import { spanMentionExtractionAdapter } from "../adapters/span-mention-extraction-adapter";
import { spanMentionCompromiseAdapter } from "../adapters/span-mention-compromise-adapter";
import type { ExtractionAdapter, ExtractionInput } from "./types";
import { mergeExtractionIR } from "./merge-ir";

/** All adapters that can run for span_mention (for dual_run/ensemble). */
const SPAN_MENTION_ENGINES: ExtractionAdapter[] = [
  spanMentionExtractionAdapter,
  spanMentionCompromiseAdapter,
];

function getEnginesForInput(input: ExtractionInput): ExtractionAdapter[] {
  if (input.type === "triplet") return [tripletExtractionAdapter];
  if (input.type === "span_mention") return SPAN_MENTION_ENGINES;
  throw new Error(`Unknown extraction input type: ${(input as { type: string }).type}`);
}

function getPrimaryEngine(input: ExtractionInput): ExtractionAdapter {
  if (input.type === "triplet") return tripletExtractionAdapter;
  if (input.type === "span_mention") {
    const primary = process.env.ENRICHMENT_ENGINE_PRIMARY?.trim()?.toLowerCase();
    if (primary === "compromise") return spanMentionCompromiseAdapter;
    return spanMentionExtractionAdapter;
  }
  throw new Error(`Unknown extraction input type: ${(input as { type: string }).type}`);
}

function getEngineMode(): ExtractionEngineMode {
  const v = process.env.ENRICHMENT_EXTRACTION_MODE?.trim()?.toLowerCase();
  if (v === "ab_test" || v === "dual_run" || v === "ensemble") return v;
  return "single";
}

export interface RunExtractionOptions {
  /** Override engine mode (default from ENRICHMENT_EXTRACTION_MODE or "single"). */
  mode?: ExtractionEngineMode;
}

export interface RunExtractionResult {
  result: ExtractionResult;
  runMetadata: ExtractionRunMetadata;
}

function irFromResult(result: ExtractionResult): ExtractionIR {
  return hasExtractionMetadata(result) ? result.ir : (result as ExtractionIR);
}

/**
 * Run extraction for the given input and ontology; returns result and
 * per-engine run metadata. For dual_run/ensemble with span_mention, runs
 * both engines and merges IR (mention dedupe by span, relation union).
 */
export async function runExtraction(
  input: ExtractionInput,
  ontology: ResearchOntologyContext,
  options?: RunExtractionOptions
): Promise<RunExtractionResult> {
  const mode = options?.mode ?? getEngineMode();
  const engines = getEnginesForInput(input);

  if (mode === "single" || engines.length <= 1) {
    const adapter = mode === "single" ? getPrimaryEngine(input) : engines[0];
    const start = performance.now();
    const result = await adapter.extract(input, ontology);
    const latencyMs = Math.round(performance.now() - start);
    const ir = irFromResult(result);
    const runMetadata: ExtractionRunMetadata = {
      engineName: adapter.name,
      engineMode: mode,
      latencyMs,
      mentionCount: ir.mentions.length,
      relationCount: ir.relations.length,
    };
    return { result, runMetadata };
  }

  if (mode === "ab_test") {
    const strategy = process.env.ENRICHMENT_AB_BUCKET_STRATEGY?.trim()?.toLowerCase();
    const idx =
      strategy === "hash"
        ? Math.abs(hashString(JSON.stringify(input))) % engines.length
        : Math.floor(Math.random() * engines.length);
    const adapter = engines[idx];
    const start = performance.now();
    const result = await adapter.extract(input, ontology);
    const latencyMs = Math.round(performance.now() - start);
    const ir = irFromResult(result);
    const runMetadata: ExtractionRunMetadata = {
      engineName: adapter.name,
      engineMode: "ab_test",
      latencyMs,
      mentionCount: ir.mentions.length,
      relationCount: ir.relations.length,
    };
    return { result, runMetadata };
  }

  // dual_run or ensemble: run all engines, merge IR
  const start = performance.now();
  const results = await Promise.all(engines.map((a) => a.extract(input, ontology)));
  const latencyMs = Math.round(performance.now() - start);
  const irs = results.map(irFromResult);
  const merged = irs.reduce((acc, ir) => mergeExtractionIR(acc, ir));
  const runMetadata: ExtractionRunMetadata = {
    engineName: mode === "ensemble" ? "ensemble" : "dual_run",
    engineMode: mode,
    latencyMs,
    mentionCount: merged.mentions.length,
    relationCount: merged.relations.length,
    conflictCount: 0,
  };

  const result: ExtractionResult = merged;
  return { result, runMetadata };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}
