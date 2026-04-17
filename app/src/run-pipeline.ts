import { readRunRecord, writeArtifact, writeRunRecord } from "./artifacts.ts";
import { collectEvidence } from "./evidence.ts";
import { callExtractionService } from "./extract-service.ts";
import { persistGraphPlan, readGraphContext } from "./graph-bridge.ts";
import { createRunId } from "./id.ts";
import { buildPersistencePlan } from "./persistence-plan.ts";
import { planSourceQueries } from "./query-planner.ts";
import { reviewExtraction } from "./review.ts";
import type { GraphView, RunArtifact, RunRecord, StageName } from "./types.ts";

const EXTRACTION_LABELS = [
  "Artist",
  "Recording",
  "Release",
  "Studio",
  "Equipment",
  "Instrument",
  "Manufacturer",
  "Label",
  "Person",
  "Alias",
];

function artifactTemplate(runId: string, stage: StageName, inputSample: unknown): RunArtifact {
  const now = new Date().toISOString();
  return {
    run_id: runId,
    stage,
    status: "ok",
    started_at: now,
    ended_at: now,
    input_sample: inputSample,
    output_sample: {},
    counts: {},
    warnings: [],
    errors: [],
  };
}

async function recordStage(
  artifact: RunArtifact,
  outputSample: unknown,
  counts: Record<string, number>,
  warnings: string[] = [],
  errors: string[] = [],
  blocked = false,
): Promise<RunArtifact> {
  const completed: RunArtifact = {
    ...artifact,
    status: blocked ? "blocked" : errors.length ? "error" : warnings.length ? "warning" : "ok",
    ended_at: new Date().toISOString(),
    output_sample: outputSample,
    counts,
    warnings,
    errors,
  };
  await writeArtifact(completed.run_id, completed);
  return completed;
}

function buildExtractionPayload(question: string, graphContext: any, evidence: any): any {
  const contextEntities = Array.isArray(graphContext?.nodes)
    ? graphContext.nodes.slice(0, 20).map((node: any) => ({
        label: node.type,
        canonical: node.label,
        aliases: node.metadata_preview?.aliases ?? [],
      }))
    : [];

  return {
    question,
    labels: EXTRACTION_LABELS,
    graph_context: {
      nodes: Array.isArray(graphContext?.nodes) ? graphContext.nodes.slice(0, 20) : [],
      edges: Array.isArray(graphContext?.edges) ? graphContext.edges.slice(0, 20) : [],
    },
    evidence,
    text: [
      evidence.extract_text,
    ].join("\n\n"),
    schema: {
      entityTypes: EXTRACTION_LABELS,
      knownEntities: contextEntities,
    },
    options: {
      use_aliases: true,
      use_model: true,
      useLiteralProperties: false,
    },
  };
}

function normalizeKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function statusRank(status: string): number {
  return status === "existing" ? 2 : status === "draft_added" ? 1 : 0;
}

function sanitizeGraphView(graph: GraphView): GraphView {
  const nodeMap = new Map<string, GraphView["nodes"][number]>();
  const aliasMap = new Map<string, string>();

  for (const node of graph.nodes) {
    const normalized =
      String(node.metadata_preview?.normalized_name || "").trim() ||
      normalizeKey(node.label);
    const canonicalId = `${node.type}:${normalized}`;
    const existing = nodeMap.get(canonicalId);
    if (!existing) {
      nodeMap.set(canonicalId, {
        ...node,
        id: canonicalId,
        source_flags: Array.from(new Set(node.source_flags)),
        metadata_preview: { ...node.metadata_preview, normalized_name: normalized },
      });
      aliasMap.set(node.id, canonicalId);
      continue;
    }

    existing.status = statusRank(node.status) > statusRank(existing.status) ? node.status : existing.status;
    existing.degree_hint = Math.max(existing.degree_hint, node.degree_hint);
    existing.source_flags = Array.from(new Set([...existing.source_flags, ...node.source_flags]));
    existing.metadata_preview = {
      ...existing.metadata_preview,
      ...node.metadata_preview,
      normalized_name: normalized,
    };
    if (existing.label.length < node.label.length && normalizeKey(existing.label) === normalized) {
      existing.label = node.label;
    }
    aliasMap.set(node.id, canonicalId);
  }

  const edgeMap = new Map<string, GraphView["edges"][number]>();
  for (const edge of graph.edges) {
    const source = aliasMap.get(edge.source) ?? edge.source;
    const target = aliasMap.get(edge.target) ?? edge.target;
    if (!nodeMap.has(source) || !nodeMap.has(target) || source === target) {
      continue;
    }
    const edgeId = `${edge.type}:${source}:${target}`;
    if (edgeMap.has(edgeId)) {
      continue;
    }
    edgeMap.set(edgeId, { ...edge, id: edgeId, source, target });
  }

  for (const node of nodeMap.values()) {
    node.degree_hint = 0;
  }
  for (const edge of edgeMap.values()) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (source) source.degree_hint += 1;
    if (target) target.degree_hint += 1;
  }

  const focalIds = (graph.view?.focal_ids ?? [])
    .map((id) => aliasMap.get(id) ?? id)
    .filter((id, index, array) => nodeMap.has(id) && array.indexOf(id) === index);

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
    view: {
      focal_ids: focalIds,
      filters: Array.from(new Set(Array.from(nodeMap.values()).map((node) => node.type))).sort(),
      legend: graph.view?.legend ?? [],
      counts: {
        nodes: nodeMap.size,
        edges: edgeMap.size,
      },
    },
  };
}

export function buildGraphView(run: RunRecord): GraphView {
  return sanitizeGraphView(run.graph);
}

export async function loadRunRecord(runId: string): Promise<RunRecord | null> {
  return readRunRecord(runId);
}

export async function runPipeline(question: string): Promise<RunRecord> {
  const runId = createRunId(question);
  const artifacts: RunArtifact[] = [];

  artifacts.push(
    await recordStage(
      artifactTemplate(runId, "question", { question }),
      { question },
      { characters: question.length },
    ),
  );

  let graphContext = await readGraphContext(question);
  artifacts.push(
    await recordStage(
      artifactTemplate(runId, "graph_context", { question }),
      graphContext,
      {
        nodes: Array.isArray(graphContext?.nodes) ? graphContext.nodes.length : 0,
        edges: Array.isArray(graphContext?.edges) ? graphContext.edges.length : 0,
      },
      graphContext?.warnings ?? [],
      graphContext?.errors ?? [],
    ),
  );

  const queryPlan = await planSourceQueries(question, graphContext);
  const queryPlanWarnings = queryPlan.planner_status === "fallback" ? [queryPlan.summary] : [];
  artifacts.push(
    await recordStage(
      artifactTemplate(runId, "query_planning", { question }),
      queryPlan,
      {
        interpretations: queryPlan.interpretations.length,
        wikipedia_queries: queryPlan.source_queries.wikipedia.length,
        musicbrainz_queries:
          queryPlan.source_queries.musicbrainz_artist.length + queryPlan.source_queries.musicbrainz_recording.length,
        web_queries: queryPlan.source_queries.brave.length,
      },
      queryPlanWarnings,
      [],
      queryPlan.planner_status === "fallback",
    ),
  );

  const evidence = await collectEvidence(question, graphContext, queryPlan);
  const evidenceWarnings = Object.values(evidence.sources)
    .filter((source: any) => source && source.ok === false)
    .map((source: any) => `${source.source}:${source.detail ?? "unavailable"}`);
  artifacts.push(
    await recordStage(
      artifactTemplate(runId, "evidence", { question }),
      { plan: evidence.plan, sources: evidence.sources },
      {
        wikipedia_items: evidence.sources.wikipedia.items.length,
        musicbrainz_items: evidence.sources.musicbrainz.items.length,
        graph_items: evidence.sources.graph_context.items.length,
        web_items: evidence.sources.web.items.length,
      },
      evidenceWarnings,
      [],
    ),
  );

  const extractPayload = buildExtractionPayload(question, graphContext, evidence);
  const extract = await callExtractionService(extractPayload);
  const extractWarnings = extract.ok ? [] : [String(extract.body?.diagnostics?.detail || `extract_failed_${extract.status_code}`)];
  artifacts.push(
    await recordStage(
      artifactTemplate(runId, "extract", {
        payload_preview: {
          question,
          labels: extractPayload.labels,
          graph_nodes: extractPayload.graph_context.nodes.length,
        },
      }),
      extract.body,
      {
        entities: Array.isArray(extract.body?.entities) ? extract.body.entities.length : 0,
        properties: Array.isArray(extract.body?.properties) ? extract.body.properties.length : 0,
        relations: Array.isArray(extract.body?.relations) ? extract.body.relations.length : 0,
      },
      extractWarnings,
      [],
    ),
  );

  const review = await reviewExtraction(question, graphContext, evidence, extract.body);
  const reviewBlocked = review?.persistence_decision === "blocked_review";
  artifacts.push(
    await recordStage(
      artifactTemplate(runId, "review", {
        question,
        extract_entities: Array.isArray(extract.body?.entities) ? extract.body.entities.length : 0,
      }),
      review,
      {
        accepted_entities: Array.isArray(review?.accepted_entities) ? review.accepted_entities.length : 0,
        rejected_entities: Array.isArray(review?.rejected_entities) ? review.rejected_entities.length : 0,
        merge_candidates: Array.isArray(review?.merge_candidates) ? review.merge_candidates.length : 0,
      },
      reviewBlocked ? [String(review?.observations?.[0] || "review_blocked")] : [],
      [],
      reviewBlocked,
    ),
  );

  const persistencePlan = buildPersistencePlan(runId, question, review, extract.body, evidence, graphContext);
  const persistenceBlocked = persistencePlan.decision !== "persist_draft";
  artifacts.push(
    await recordStage(
      artifactTemplate(runId, "persistence_plan", { question }),
      persistencePlan,
      {
        nodes: persistencePlan.nodes.length,
        relations: persistencePlan.relations.length,
        rejected: persistencePlan.rejected_candidates.length,
      },
      persistenceBlocked && persistencePlan.blocked_reason ? [persistencePlan.blocked_reason] : [],
      [],
      persistenceBlocked,
    ),
  );

  const typedbWrite = await persistGraphPlan(persistencePlan);
  const typedbBlocked = persistenceBlocked || typedbWrite?.ok === false;
  artifacts.push(
    await recordStage(
      artifactTemplate(runId, "typedb_write", { decision: persistencePlan.decision }),
      typedbWrite,
      {
        written_nodes: Array.isArray(typedbWrite?.created_entities) ? typedbWrite.created_entities.length : 0,
        merged_entities: Array.isArray(typedbWrite?.merged_entities) ? typedbWrite.merged_entities.length : 0,
        written_edges: Array.isArray(typedbWrite?.created_relations) ? typedbWrite.created_relations.length : 0,
      },
      typedbWrite?.warnings ?? [],
      typedbWrite?.errors ?? [],
      typedbBlocked,
    ),
  );

  graphContext = typedbWrite?.graph ?? graphContext;
  artifacts.push(
    await recordStage(
      artifactTemplate(runId, "graph_delta", { run_id: runId }),
      graphContext,
      {
        nodes: Array.isArray(graphContext?.nodes) ? graphContext.nodes.length : 0,
        edges: Array.isArray(graphContext?.edges) ? graphContext.edges.length : 0,
      },
      graphContext?.warnings ?? [],
      graphContext?.errors ?? [],
    ),
  );

  const status =
    artifacts.some((artifact) => artifact.status === "error") ? "failed" :
    artifacts.some((artifact) => artifact.status === "warning" || artifact.status === "blocked") ? "completed_with_warnings" :
    "completed";

  const run: RunRecord = {
    runId,
    question,
    status,
    summary: review?.summary ?? `Run ${runId} completed.`,
    artifacts,
    graph: graphContext as GraphView,
  };

  await writeRunRecord(run);
  return run;
}
