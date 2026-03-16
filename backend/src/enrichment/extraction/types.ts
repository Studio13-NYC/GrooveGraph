/**
 * Extraction adapter contract (Phase 2). Adapters produce source-agnostic IR
 * from different inputs (triplet, span/mention text, etc.).
 */

import type {
  ExtractionIR,
  ResearchBundleMetadata,
  ResearchOntologyContext,
  ReviewTargetEntity,
} from "../types";
import type { TripletSpec } from "../triplet";

/** Optional bundle metadata when adapter has pipeline provenance (e.g. triplet). */
export interface ExtractionResultWithMetadata {
  ir: ExtractionIR;
  metadata?: ResearchBundleMetadata;
  generatedAt?: string;
  summary?: string;
}

export type ExtractionResult = ExtractionIR | ExtractionResultWithMetadata;

export function hasExtractionMetadata(
  r: ExtractionResult
): r is ExtractionResultWithMetadata {
  return typeof r === "object" && r !== null && "ir" in r && Array.isArray((r as ExtractionResultWithMetadata).ir.mentions);
}

/** Input for triplet-based extraction (sessionId + triplet + targets). */
export interface TripletExtractionInput {
  type: "triplet";
  sessionId: string;
  triplet: TripletSpec;
  targets: ReviewTargetEntity[];
  options?: {
    ontology?: ResearchOntologyContext;
    scopeTarget?: ReviewTargetEntity;
    hasAnySubject?: boolean;
    hasAnyObject?: boolean;
  };
}

/** Input for span/mention extraction (text or document). Reserved for Phase 2. */
export interface SpanMentionExtractionInput {
  type: "span_mention";
  text: string;
  /** Optional document/source id for provenance. */
  sourceId?: string;
}

export type ExtractionInput = TripletExtractionInput | SpanMentionExtractionInput;

export type ExtractionEngineMode = "single" | "ab_test" | "dual_run" | "ensemble";

/** Per-run metadata for evaluation and orchestrator modes (ab_test, dual_run, ensemble). */
export interface ExtractionRunMetadata {
  engineName: string;
  engineVersion?: string;
  engineMode?: ExtractionEngineMode;
  latencyMs: number;
  mentionCount: number;
  relationCount: number;
  conflictCount?: number;
}

export interface ExtractionAdapter {
  readonly name: string;
  /** Produce IR (optionally with bundle metadata for provenance). */
  extract(input: ExtractionInput, ontology: ResearchOntologyContext): Promise<ExtractionResult>;
}
