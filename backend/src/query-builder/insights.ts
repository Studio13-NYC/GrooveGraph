import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { QueryState } from "./types";

export interface QueryInsight {
  id: string;
  createdAt: string;
  prompt: string;
  normalizedPrompt: string;
  strategy: string;
  success: boolean;
  traceId?: string;
  note?: string;
  feedbackScore?: number;
  feedbackCount?: number;
  queryState?: QueryState;
}

export interface QueryInsightFeedback {
  id: string;
  createdAt: string;
  traceId: string;
  rating: 1 | -1;
  context: "interpret" | "execute";
  wasEmpty?: boolean;
  note?: string;
}

const DEFAULT_MAX_INSIGHTS = 200;

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenize(prompt: string): string[] {
  return normalizePrompt(prompt)
    .split(/[^a-z0-9_]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function getInsightsFilePath(): string {
  return path.join(process.cwd(), "data", "query-builder-insights", "insights.json");
}

function getFeedbackFilePath(): string {
  return path.join(process.cwd(), "data", "query-builder-insights", "feedback.json");
}

function ensureInsightsDirectory(): void {
  const filePath = getInsightsFilePath();
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadQueryInsights(): QueryInsight[] {
  const filePath = getInsightsFilePath();
  if (!existsSync(filePath)) {
    return [];
  }
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is QueryInsight => {
      return Boolean(item && typeof item === "object" && typeof (item as QueryInsight).id === "string");
    });
  } catch {
    return [];
  }
}

export function appendQueryInsight(
  input: Omit<QueryInsight, "id" | "createdAt" | "normalizedPrompt">,
  options?: { maxItems?: number }
): QueryInsight {
  const current = loadQueryInsights();
  const next: QueryInsight = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    normalizedPrompt: normalizePrompt(input.prompt),
    ...input,
  };

  const maxItems = options?.maxItems ?? DEFAULT_MAX_INSIGHTS;
  const updated = [next, ...current].slice(0, Math.max(10, maxItems));
  ensureInsightsDirectory();
  writeFileSync(getInsightsFilePath(), JSON.stringify(updated, null, 2), "utf8");
  return next;
}

export function recordQueryInsightFeedback(input: {
  traceId: string;
  rating: 1 | -1;
  context: "interpret" | "execute";
  wasEmpty?: boolean;
  note?: string;
}): QueryInsightFeedback {
  const insights = loadQueryInsights();
  const target = insights.find((item) => item.traceId === input.traceId);
  if (target) {
    target.feedbackScore = (target.feedbackScore ?? 0) + input.rating;
    target.feedbackCount = (target.feedbackCount ?? 0) + 1;
    ensureInsightsDirectory();
    writeFileSync(getInsightsFilePath(), JSON.stringify(insights, null, 2), "utf8");
  }

  const feedbackPath = getFeedbackFilePath();
  let existing: QueryInsightFeedback[] = [];
  if (existsSync(feedbackPath)) {
    try {
      const raw = readFileSync(feedbackPath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        existing = parsed.filter((item): item is QueryInsightFeedback => {
          return Boolean(item && typeof item === "object" && typeof (item as QueryInsightFeedback).id === "string");
        });
      }
    } catch {
      existing = [];
    }
  }

  const next: QueryInsightFeedback = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    traceId: input.traceId,
    rating: input.rating,
    context: input.context,
    wasEmpty: input.wasEmpty,
    note: input.note,
  };
  ensureInsightsDirectory();
  writeFileSync(feedbackPath, JSON.stringify([next, ...existing].slice(0, 1000), null, 2), "utf8");
  return next;
}

export function findRelevantInsights(prompt: string, limit = 5): QueryInsight[] {
  const normalized = normalizePrompt(prompt);
  const insights = loadQueryInsights().filter((item) => item.success && item.queryState);
  const promptTokens = new Set(tokenize(prompt));

  const scored = insights.map((item) => {
    let score = 0;
    if (item.normalizedPrompt === normalized) {
      score += 100;
    }

    const insightTokens = tokenize(item.prompt);
    for (const token of insightTokens) {
      if (promptTokens.has(token)) score += 1;
    }

    score += item.feedbackScore ?? 0;
    if ((item.feedbackCount ?? 0) > 0 && (item.feedbackScore ?? 0) <= -2) {
      score -= 3;
    }

    return { item, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))
    .map((entry) => entry.item);
}
