import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getEnvValue } from "./src/env.ts";
import { readGraphBridgeHealth } from "./src/graph-bridge.ts";
import { advanceRun, buildGraphView, createRun, loadRunRecord } from "./src/run-pipeline.ts";
import { jsonResponse, notFoundResponse, parseJsonBody, textResponse } from "./src/http.ts";
import { ensureRuntimeDirectories, getPublicAssetPath, listRunArtifacts, resolveArtifactPath } from "./src/runtime-paths.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

await ensureRuntimeDirectories();

function routeRunPath(pathname: string): { runId: string; tail: string[] } | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "runs" || parts.length < 2) {
    return null;
  }
  return { runId: parts[1], tail: parts.slice(2) };
}

async function readExtractorHealth(): Promise<any> {
  const baseUrl = getEnvValue("LOCAL_ENTITY_SERVICE_URL", "http://127.0.0.1:8200");
  try {
    const response = await fetch(`${baseUrl}/health`);
    if (!response.ok) {
      return { ok: false, service: "entity-service", error: `health_${response.status}` };
    }
    return await response.json();
  } catch (error) {
    return {
      ok: false,
      service: "entity-service",
      error: error instanceof Error ? error.message : "entity_service_unreachable",
    };
  }
}

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const pathname = url.pathname;
  const runRoute = routeRunPath(pathname);

  if (method === "GET" && pathname === "/health") {
    const [graphBridge, extractor] = await Promise.all([readGraphBridgeHealth(), readExtractorHealth()]);
    return jsonResponse(res, 200, {
      ok: true,
      service: "groovegraph-app",
      components: {
        graph_bridge: graphBridge,
        entity_service: extractor,
      },
    });
  }

  if (method === "POST" && pathname === "/runs") {
    try {
      const body = await parseJsonBody<{ question?: string }>(req);
      if (!body.question || !body.question.trim()) {
        return jsonResponse(res, 400, { ok: false, error: "question_required" });
      }
      const run = await createRun(body.question.trim());
      return jsonResponse(res, 200, {
        ok: true,
        run_id: run.runId,
        status: run.status,
        summary: run.summary,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      return jsonResponse(res, 500, { ok: false, error: "run_failed", detail: message });
    }
  }

  if (runRoute && method === "POST" && runRoute.tail.length === 1 && runRoute.tail[0] === "advance") {
    try {
      const run = await advanceRun(runRoute.runId);
      return jsonResponse(res, 200, {
        ok: true,
        run_id: run.runId,
        status: run.status,
        summary: run.summary,
        current_stage: run.currentStage,
        next_stage: run.nextStage,
        awaiting_approval: run.awaitingApproval,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      return jsonResponse(res, 500, { ok: false, error: "advance_failed", detail: message });
    }
  }

  if (method === "GET" && pathname === "/runs") {
    const runEntries = await listRunArtifacts();
    const runs = (await Promise.all(
      runEntries.map(async (entry) => {
        const run = await loadRunRecord(entry.run_id);
        if (!run) {
          return null;
        }
        return {
          run_id: run.runId,
          question: run.question,
          summary: run.summary,
          status: run.status,
          current_stage: run.currentStage,
          next_stage: run.nextStage,
          awaiting_approval: run.awaitingApproval,
        };
      }),
    ))
      .filter(Boolean)
      .sort((left: any, right: any) => String(right.run_id).localeCompare(String(left.run_id)));
    return jsonResponse(res, 200, { ok: true, runs });
  }

  if (runRoute && method === "GET") {
    const { runId, tail } = runRoute;
    const run = await loadRunRecord(runId);
    if (!run) {
      return notFoundResponse(res, "run_not_found");
    }

    if (tail.length === 0) {
      return jsonResponse(res, 200, { ok: true, run });
    }

    if (tail[0] === "graph") {
      return jsonResponse(res, 200, { ok: true, graph: buildGraphView(run) });
    }

    if (tail[0] === "artifacts" && tail[1]) {
      const artifactPath = resolveArtifactPath(runId, tail[1]);
      if (!artifactPath) {
        return notFoundResponse(res, "artifact_not_found");
      }
      const raw = await readFile(artifactPath, "utf8");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.writeHead(200);
      res.end(raw);
      return;
    }
  }

  if (method === "GET" && pathname === "/") {
    const html = await readFile(path.join(publicDir, "index.html"), "utf8");
    return textResponse(res, 200, html, "text/html; charset=utf-8");
  }

  if (method === "GET" && pathname.startsWith("/assets/")) {
    const assetPath = getPublicAssetPath(pathname);
    if (!assetPath) {
      return notFoundResponse(res, "asset_not_found");
    }
    const contentType =
      assetPath.endsWith(".css") ? "text/css; charset=utf-8" :
      assetPath.endsWith(".js") ? "application/javascript; charset=utf-8" :
      "text/plain; charset=utf-8";
    const body = await readFile(assetPath, "utf8");
    return textResponse(res, 200, body, contentType);
  }

  return notFoundResponse(res, "route_not_found");
});

const port = Number.parseInt(process.env.PORT ?? "3100", 10);
server.listen(port, () => {
  console.log(`GrooveGraph app listening on http://127.0.0.1:${port}`);
});
