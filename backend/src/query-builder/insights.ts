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
  queryState?: QueryState;
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

    return { item, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))
    .map((entry) => entry.item);
}
