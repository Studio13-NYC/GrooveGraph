/**
 * Triplet extraction adapter (Phase 2). Runs the existing triplet exploration
 * pipeline and exposes its result as ExtractionIR via bundleToIR.
 */

import type { ResearchOntologyContext } from "../types";
import { runTripletExplorationPipeline } from "../pipelines/triplet-exploration";
import { bundleToIR } from "../extraction/normalize-ir";
import type {
  ExtractionAdapter,
  ExtractionResult,
  TripletExtractionInput,
} from "../extraction/types";

export const TRIPLET_EXTRACTION_ADAPTER_NAME = "triplet";

export const tripletExtractionAdapter: ExtractionAdapter = {
  name: TRIPLET_EXTRACTION_ADAPTER_NAME,

  async extract(
    input: TripletExtractionInput,
    ontology: ResearchOntologyContext
  ): Promise<ExtractionResult> {
    if (input.type !== "triplet") {
      throw new Error(
        `TripletExtractionAdapter expects type "triplet", got "${(input as { type: string }).type}".`
      );
    }
    const result = await runTripletExplorationPipeline(
      input.sessionId,
      input.triplet,
      input.targets,
      {
        ontology: input.options?.ontology ?? ontology,
        scopeTarget: input.options?.scopeTarget,
        hasAnySubject: input.options?.hasAnySubject,
        hasAnyObject: input.options?.hasAnyObject,
      }
    );
    return {
      ir: bundleToIR(result.bundle),
      metadata: result.metadata,
      generatedAt: result.bundle.generatedAt,
      summary: result.bundle.summary,
    };
  },
};
