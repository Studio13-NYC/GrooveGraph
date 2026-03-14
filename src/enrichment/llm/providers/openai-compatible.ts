import type { ResearchPacket } from "../../types";
import { buildEnrichmentLlmPrompt } from "../prompt";

export interface LlmProviderResult {
  rawText: string;
  provider: string;
  model: string;
}

export interface LlmProvider {
  synthesize(packet: ResearchPacket): Promise<LlmProviderResult>;
}

type OpenAiCompatibleConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
  providerName: string;
};

type ChatCompletionsResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

type ChatMessageContent = string | Array<{ type?: string; text?: string }> | undefined;

function normalizeMessageContent(content: ChatMessageContent): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === "string" ? item.text : ""))
      .join("")
      .trim();
  }
  return "";
}

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(private readonly config: OpenAiCompatibleConfig) {}

  async synthesize(packet: ResearchPacket): Promise<LlmProviderResult> {
    const prompt = buildEnrichmentLlmPrompt(packet);
    const url = `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`;
    // #region agent log
    fetch("http://127.0.0.1:7290/ingest/d02d8ae0-2fcc-4270-9ab1-7e7cc64f475b", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e8d527" },
      body: JSON.stringify({
        sessionId: "e8d527",
        runId: "run1",
        hypothesisId: "H5",
        location: "openai-compatible.ts:synthesize:before-fetch",
        message: "OpenAI request starting",
        data: { model: this.config.model, baseUrl: this.config.baseUrl, urlLength: url.length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      }),
    });

    // #region agent log
    const status = response.status;
    const ok = response.ok;
    fetch("http://127.0.0.1:7290/ingest/d02d8ae0-2fcc-4270-9ab1-7e7cc64f475b", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e8d527" },
      body: JSON.stringify({
        sessionId: "e8d527",
        runId: "run1",
        hypothesisId: "H3",
        location: "openai-compatible.ts:synthesize:after-fetch",
        message: "OpenAI response received",
        data: { status, ok, model: this.config.model },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (!response.ok) {
      const errorText = await response.text();
      // #region agent log
      fetch("http://127.0.0.1:7290/ingest/d02d8ae0-2fcc-4270-9ab1-7e7cc64f475b", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e8d527" },
        body: JSON.stringify({
          sessionId: "e8d527",
          runId: "run1",
          hypothesisId: "H3",
          location: "openai-compatible.ts:synthesize:error-response",
          message: "OpenAI returned non-OK",
          data: { status, errorBodyPreview: errorText.slice(0, 500) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw new Error(
        `Enrichment LLM request failed with ${response.status}.${errorText ? ` ${errorText}` : ""}`
      );
    }

    const payload = (await response.json()) as ChatCompletionsResponse;
    const rawText = normalizeMessageContent(payload.choices?.[0]?.message?.content);
    if (!rawText) {
      throw new Error("Enrichment LLM returned an empty response.");
    }

    return {
      rawText,
      provider: this.config.providerName,
      model: this.config.model,
    };
  }
}
