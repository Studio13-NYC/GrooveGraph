import { randomUUID } from "node:crypto";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface TraceLogger {
  traceId: string;
  log: (stage: string, data?: Record<string, JsonValue | undefined>) => void;
}

function sanitizeData(data: Record<string, JsonValue | undefined> | undefined): Record<string, JsonValue> {
  if (!data) return {};
  const sanitized: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function resolveTraceId(headers: Headers): string {
  const existing = headers.get("x-trace-id")?.trim();
  if (existing) {
    return existing;
  }
  return randomUUID();
}

export function createTraceLogger(traceId: string, source: string): TraceLogger {
  return {
    traceId,
    log: (stage, data) => {
      const payload = {
        level: "info",
        source,
        traceId,
        stage,
        timestamp: new Date().toISOString(),
        ...sanitizeData(data),
      };
      console.log(JSON.stringify(payload));
    },
  };
}
