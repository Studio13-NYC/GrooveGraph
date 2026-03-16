/**
 * Span/mention extraction adapter using compromise NER (Phase 2).
 * Second engine for span_mention; used in dual_run/ensemble with rule-based adapter.
 */

import type { ExtractionIR, ResearchOntologyContext } from "../types";
import type {
  ExtractionAdapter,
  ExtractionResult,
  SpanMentionExtractionInput,
} from "../extraction/types";
import { extractMentionsWithCompromise } from "../extraction/compromise-mentions";

export const SPAN_MENTION_COMPROMISE_ADAPTER_NAME = "span_mention_compromise";

export const spanMentionCompromiseAdapter: ExtractionAdapter = {
  name: SPAN_MENTION_COMPROMISE_ADAPTER_NAME,

  async extract(
    input: SpanMentionExtractionInput,
    ontology: ResearchOntologyContext
  ): Promise<ExtractionResult> {
    if (input.type !== "span_mention") {
      throw new Error(
        `SpanMentionCompromiseAdapter expects type "span_mention", got "${(input as { type: string }).type}".`
      );
    }
    const mentions = extractMentionsWithCompromise(input.text, ontology, {
      sourceId: input.sourceId,
      confidence: "medium",
    });
    const ir: ExtractionIR = {
      mentions,
      relations: [],
      sourceId: input.sourceId,
    };
    return ir;
  },
};
