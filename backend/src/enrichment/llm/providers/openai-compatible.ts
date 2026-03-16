import type { ResearchPacket } from "../../types";
import { buildEnrichmentLlmPrompt } from "../prompt";
import { getTextFromResponsesOutput, type ResponsesApiPayload } from "../responses-api";

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

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(private readonly config: OpenAiCompatibleConfig) {}

  async synthesize(packet: ResearchPacket): Promise<LlmProviderResult> {
    const prompt = buildEnrichmentLlmPrompt(packet);
    const url = `${this.config.baseUrl.replace(/\/$/, "")}/responses`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        input: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        text: { format: { type: "json_object" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Enrichment LLM request failed with ${response.status}.${errorText ? ` ${errorText}` : ""}`
      );
    }

    const payload = (await response.json()) as ResponsesApiPayload;
    const rawText = getTextFromResponsesOutput(payload);
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
