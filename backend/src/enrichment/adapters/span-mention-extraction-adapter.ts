/**
 * Span/mention extraction adapter (Phase 2). Uses rule-based mention extraction
 * (capitalized phrases); relations empty. Add wink-nlp/compromise or LLM for
 * relations and better NER later.
 */

import type { ExtractionIR, ResearchOntologyContext } from "../types";
import type {
  ExtractionAdapter,
  ExtractionResult,
  SpanMentionExtractionInput,
} from "../extraction/types";
import { extractMentionsFromText } from "../extraction/rule-based-mentions";

export const SPAN_MENTION_EXTRACTION_ADAPTER_NAME = "span_mention";

export const spanMentionExtractionAdapter: ExtractionAdapter = {
  name: SPAN_MENTION_EXTRACTION_ADAPTER_NAME,

  async extract(
    input: SpanMentionExtractionInput,
    ontology: ResearchOntologyContext
  ): Promise<ExtractionResult> {
    if (input.type !== "span_mention") {
      throw new Error(
        `SpanMentionExtractionAdapter expects type "span_mention", got "${(input as { type: string }).type}".`
      );
    }
    const mentions = extractMentionsFromText(input.text, ontology, {
      sourceId: input.sourceId,
      confidence: "low",
    });
    const ir: ExtractionIR = {
      mentions,
      relations: [],
      sourceId: input.sourceId,
    };
    return ir;
  },
};
