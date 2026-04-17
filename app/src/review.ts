import { getEnvValue } from "./env.ts";

const REQUIRED_KEYS = [
  "summary",
  "observations",
  "accepted_entities",
  "rejected_entities",
  "merge_candidates",
  "persistence_decision",
] as const;

function blockedReview(question: string, extractBody: any, reason: string): any {
  return {
    provider: "review_blocked",
    review_status: "blocked",
    summary: `Review blocked for "${question}". Persistence is disabled until GPT review returns a valid structured result.`,
    observations: [reason],
    accepted_entities: [],
    rejected_entities: Array.isArray(extractBody?.entities) ? extractBody.entities : [],
    merge_candidates: [],
    persistence_decision: "blocked_review",
  };
}

function isValidReviewResult(value: any): boolean {
  return Boolean(
    value &&
    REQUIRED_KEYS.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    Array.isArray(value.observations) &&
    Array.isArray(value.accepted_entities) &&
    Array.isArray(value.rejected_entities) &&
    Array.isArray(value.merge_candidates) &&
    typeof value.summary === "string" &&
    typeof value.persistence_decision === "string",
  );
}

function extractOutputText(body: any): string {
  const output = Array.isArray(body?.output) ? body.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part?.type === "output_text" && typeof part?.text === "string") {
        return part.text;
      }
    }
  }
  return "";
}

export async function reviewExtraction(question: string, graphContext: any, evidence: any, extractBody: any): Promise<any> {
  const apiKey = getEnvValue("OPENAI_API_KEY", "").trim();
  const model = getEnvValue("OPENAI_REVIEW_MODEL", "gpt-5.4-mini").trim();
  if (!apiKey) {
    return blockedReview(question, extractBody, "OPENAI_API_KEY is not configured.");
  }

  const prompt = {
    question,
    graph_context: graphContext,
    evidence_sources: evidence.sources,
    extract_result: extractBody,
    instructions: [
      "You are reviewing extracted music graph candidates before draft persistence.",
      "Review the full evidence bundle, not only the narrow answer to the user's prompt.",
      "Accept credible extracted entities that are supported by the evidence corpus even if they are incidental context around the prompt.",
      "Reject malformed, noisy, duplicate, or weakly supported candidates.",
      "For persistence, remember that the current supported v1 draft-write types are Artist, Recording, Studio, Equipment, and Person.",
      "If broader credible entities exist outside that persistence slice, keep them in accepted_entities but do not force persistence on that basis alone.",
      "Only block persistence when the output is invalid or there is no evidence-backed supported connected batch for the current v1 types.",
      "Return valid JSON only with the required keys.",
    ],
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Return JSON only.",
              'Required keys: "summary", "observations", "accepted_entities", "rejected_entities", "merge_candidates", "persistence_decision".',
              'Allowed persistence decisions: "persist_draft", "blocked_review", or "skip_persist".',
              "Judge graph-growth quality from the whole evidence corpus, not just prompt-answer relevance.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify(prompt),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`OpenAI review failed with ${response.status}${errorBody ? `: ${errorBody}` : ""}`);
    }

    const body = await response.json();
    const text = String(body?.choices?.[0]?.message?.content || "");
    if (!text) {
      throw new Error("OpenAI review returned no message content");
    }
    const parsed = JSON.parse(text);
    if (!isValidReviewResult(parsed)) {
      throw new Error("OpenAI review returned invalid schema");
    }
    return {
      ...parsed,
      provider: "openai",
      review_status: parsed.persistence_decision === "blocked_review" ? "blocked" : "ok",
    };
  } catch (error) {
    return blockedReview(
      question,
      extractBody,
      error instanceof Error ? error.message : "OpenAI review failed.",
    );
  }
}
