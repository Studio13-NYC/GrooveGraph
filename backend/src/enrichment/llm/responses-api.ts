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
};

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
