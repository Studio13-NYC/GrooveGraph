/**
 * Helpers for OpenAI Responses API (POST /v1/responses).
 * Use this instead of Chat Completions for new integrations.
 */

/** Response output item: message with content array. */
type OutputMessage = {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
};

/** Response body from POST /v1/responses. */
export type ResponsesApiPayload = {
  output?: OutputMessage[];
  id?: string;
  conversation?: string | { id?: string };
  usage?: Record<string, unknown>;
};

export type ResponsesConversationState = {
  conversationId?: string;
  previousResponseId?: string;
};

export type ResponsesTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function getUsageFromResponsesPayload(payload: ResponsesApiPayload): ResponsesTokenUsage {
  const usage = payload?.usage ?? {};
  const inputTokens = toNumber(
    usage.input_tokens ??
      usage.prompt_tokens ??
      usage.promptTokens
  );
  const outputTokens = toNumber(
    usage.output_tokens ??
      usage.completion_tokens ??
      usage.completionTokens
  );
  const totalTokens = toNumber(
    usage.total_tokens ??
      usage.totalTokens
  );
  return {
    inputTokens,
    outputTokens,
    totalTokens: totalTokens || inputTokens + outputTokens,
  };
}

export function getConversationIdFromResponsesPayload(payload: ResponsesApiPayload): string | undefined {
  if (typeof payload.conversation === "string" && payload.conversation.trim()) {
    return payload.conversation.trim();
  }
  if (payload.conversation && typeof payload.conversation === "object") {
    const id = payload.conversation.id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return undefined;
}

/**
 * Extract the combined text from a Responses API response.
 * Walks output[] for type "message", then content[] for type "output_text", and concatenates .text.
 */
export function getTextFromResponsesOutput(payload: ResponsesApiPayload): string {
  const output = payload?.output;
  if (!Array.isArray(output)) {
    console.warn("[responses-api] No output array; payload keys:", Object.keys(payload ?? {}));
    return "";
  }

  const parts: string[] = [];
  for (const item of output) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const block of item.content) {
      if (block?.type === "output_text" && typeof block.text === "string") {
        parts.push(block.text);
      }
    }
  }
  const text = parts.join("").trim();
  if (!text && output.length > 0) {
    const first = output[0] as Record<string, unknown>;
    console.warn(
      "[responses-api] output has",
      output.length,
      "items but no output_text; first item type=",
      first?.type,
      "contentLen=",
      Array.isArray(first?.content) ? (first.content as unknown[]).length : "n/a"
    );
  }
  return text;
}
