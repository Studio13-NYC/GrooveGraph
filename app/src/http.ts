import type { IncomingMessage, ServerResponse } from "node:http";

export async function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw || "{}") as T;
}

export function jsonResponse(res: ServerResponse, status: number, payload: unknown): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.writeHead(status);
  res.end(JSON.stringify(payload, null, 2));
}

export function textResponse(res: ServerResponse, status: number, body: string, contentType: string): void {
  res.setHeader("Content-Type", contentType);
  res.writeHead(status);
  res.end(body);
}

export function notFoundResponse(res: ServerResponse, error: string): void {
  jsonResponse(res, 404, { ok: false, error });
}
