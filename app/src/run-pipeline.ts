import { readRunRecord, writeArtifact, writeRunRecord } from "./artifacts.ts";
import { collectEvidence } from "./evidence.ts";
import { callExtractionService } from "./extract-service.ts";
import { persistGraphPlan, readGraphContext } from "./graph-bridge.ts";
import { createRunId } from "./id.ts";
import { buildPersistencePlan } from "./persistence-plan.ts";
import { planSourceQueries } from "./query-planner.ts";
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
] as const;

const STAGE_SEQUENCE: StageName[] = ["plan", "evidence", "extract", "persistence_proposal", "commit"];

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

function artifactByStage(run: RunRecord, stage: StageName): RunArtifact | null {
  return run.artifacts.find((artifact) => artifact.stage === stage) ?? null;
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
    const normalized = String(node.metadata_preview?.normalized_name || "").trim() || normalizeKey(node.label);
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

function nextStageAfter(stage: StageName): StageName | null {
  const index = STAGE_SEQUENCE.indexOf(stage);
  if (index < 0 || index === STAGE_SEQUENCE.length - 1) {
    return null;
  }
  return STAGE_SEQUENCE[index + 1];
}

function buildExtractionPayload(question: string, graphContext: any, evidence: any): any {
  const contextEntities = Array.isArray(graphContext?.nodes)
    ? graphContext.nodes.slice(0, 24).map((node: any) => ({
        label: node.type,
        canonical: node.label,
        aliases: node.metadata_preview?.aliases ?? [],
      }))
    : [];

  return {
    question,
    labels: [...EXTRACTION_LABELS],
    graph_context: {
      nodes: Array.isArray(graphContext?.nodes) ? graphContext.nodes.slice(0, 20) : [],
      edges: Array.isArray(graphContext?.edges) ? graphContext.edges.slice(0, 20) : [],
    },
    evidence,
    text: evidence.extract_text,
    schema: {
      entityTypes: [...EXTRACTION_LABELS],
      knownEntities: contextEntities,
    },
    options: {
      use_aliases: true,
      use_model: true,
      useLiteralProperties: true,
    },
  };
}

function proposalPreviewGraph(baseGraph: GraphView, proposal: any): GraphView {
  const nodes = [...(baseGraph?.nodes ?? [])];
  const edges = [...(baseGraph?.edges ?? [])];
  const focalIds = [...(baseGraph?.view?.focal_ids ?? [])];

  for (const node of proposal?.nodes ?? []) {
    const graphId = `${node.label}:${node.normalized_name}`;
    nodes.push({
      id: graphId,
      label: node.name,
      type: node.label,
      status: node.graph_status,
      source_flags: [node.external_source || "proposal"].filter(Boolean),
      degree_hint: 0,
      metadata_preview: {
        normalized_name: node.normalized_name,
        summary: node.summary,
        source_url: node.source_url,
      },
    });
    focalIds.push(graphId);
  }

  const refToId = new Map<string, string>((proposal?.nodes ?? []).map((node: any) => [node.ref, `${node.label}:${node.normalized_name}`]));
  for (const relation of proposal?.relations ?? []) {
    const sourceId = refToId.get(relation.left_ref);
    const targetId = refToId.get(relation.right_ref);
    if (!sourceId || !targetId) {
      continue;
    }
    edges.push({
      id: `${relation.kind}:${sourceId}:${targetId}`,
      source: sourceId,
      target: targetId,
      type: relation.kind,
      status: "draft_added",
      provenance_hint: "proposal",
    });
  }

  return sanitizeGraphView({
    nodes,
    edges,
    view: {
      focal_ids: focalIds,
      filters: Array.from(new Set(nodes.map((node) => node.type))).sort(),
      legend: baseGraph?.view?.legend ?? [],
      counts: { nodes: nodes.length, edges: edges.length },
    },
  });
}

function planSummary(question: string, queryPlan: any): string {
  const interpretation = Array.isArray(queryPlan?.interpretations) && queryPlan.interpretations.length
    ? queryPlan.interpretations[0]
    : question;
  return `Plan ready for review: ${interpretation}`;
}

export function buildGraphView(run: RunRecord): GraphView {
  return sanitizeGraphView(run.graph);
}

export async function loadRunRecord(runId: string): Promise<RunRecord | null> {
  return readRunRecord(runId);
}

export async function createRun(question: string): Promise<RunRecord> {
  const runId = createRunId(question);
  const graphContext = await readGraphContext(question);
  const queryPlan = await planSourceQueries(question, graphContext);
  const warnings = [
    ...(graphContext?.warnings ?? []),
    ...(queryPlan.planner_status === "fallback" ? [queryPlan.summary] : []),
  ];

  const planArtifact = await recordStage(
    artifactTemplate(runId, "plan", { question }),
    { graph_context: graphContext, query_plan: queryPlan },
    {
      graph_nodes: Array.isArray(graphContext?.nodes) ? graphContext.nodes.length : 0,
      graph_edges: Array.isArray(graphContext?.edges) ? graphContext.edges.length : 0,
      artist_candidates: Array.isArray(queryPlan.artist_candidates) ? queryPlan.artist_candidates.length : 0,
      recording_candidates: Array.isArray(queryPlan.recording_candidates) ? queryPlan.recording_candidates.length : 0,
    },
    warnings,
    graphContext?.errors ?? [],
  );

  const run: RunRecord = {
    runId,
    question,
    status: "awaiting_approval",
    summary: planSummary(question, queryPlan),
    currentStage: "plan",
    nextStage: "evidence",
    awaitingApproval: true,
    artifacts: [planArtifact],
    graph: sanitizeGraphView(graphContext as GraphView),
  };

  await writeRunRecord(run);
  return run;
}

async function advanceToEvidence(run: RunRecord): Promise<RunRecord> {
  const planArtifact = artifactByStage(run, "plan");
  const graphContext = (planArtifact?.output_sample as any)?.graph_context ?? { nodes: [], edges: [], view: { focal_ids: [], filters: [], legend: [], counts: {} } };
  const queryPlan = (planArtifact?.output_sample as any)?.query_plan ?? {};
  const evidence = await collectEvidence(run.question, graphContext, queryPlan);
  const evidenceWarnings = Object.values(evidence.sources)
    .filter((source: any) => source && source.ok === false)
    .map((source: any) => `${source.source}:${source.detail ?? "unavailable"}`);

  const evidenceArtifact = await recordStage(
    artifactTemplate(run.runId, "evidence", { question: run.question, query_plan: queryPlan }),
    { plan: evidence.plan, sources: evidence.sources, summary_text: evidence.summary_text, extract_text: evidence.extract_text },
    {
      wikipedia_items: evidence.sources.wikipedia.items.length,
      musicbrainz_items: evidence.sources.musicbrainz.items.length,
      discogs_items: evidence.sources.discogs.items.length,
      web_items: evidence.sources.web.items.length,
    },
    evidenceWarnings,
    [],
  );

  const updated: RunRecord = {
    ...run,
    status: "awaiting_approval",
    summary: "Evidence bundle ready for review.",
    currentStage: "evidence",
    nextStage: "extract",
    awaitingApproval: true,
    artifacts: [...run.artifacts, evidenceArtifact],
  };
  await writeRunRecord(updated);
  return updated;
}

async function advanceToExtract(run: RunRecord): Promise<RunRecord> {
  const planArtifact = artifactByStage(run, "plan");
  const evidenceArtifact = artifactByStage(run, "evidence");
  const graphContext = (planArtifact?.output_sample as any)?.graph_context ?? { nodes: [], edges: [], view: { focal_ids: [], filters: [], legend: [], counts: {} } };
  const evidence = {
    plan: (evidenceArtifact?.output_sample as any)?.plan ?? {},
    sources: (evidenceArtifact?.output_sample as any)?.sources ?? {},
    summary_text: (evidenceArtifact?.output_sample as any)?.summary_text ?? "",
    extract_text: (evidenceArtifact?.output_sample as any)?.extract_text ?? "",
  };

  const extractPayload = buildExtractionPayload(run.question, graphContext, evidence);
  const extract = await callExtractionService(extractPayload);
  const diagnostics = extract.body?.diagnostics ?? {};
  const extractWarnings = [
    ...(extract.ok ? [] : [String(diagnostics.detail || `extract_failed_${extract.status_code}`)]),
    ...(diagnostics.spacy_error ? [String(diagnostics.spacy_error)] : []),
  ];

  const extractArtifact = await recordStage(
    artifactTemplate(run.runId, "extract", {
      question: run.question,
      labels: extractPayload.labels,
    }),
    extract.body,
    {
      entities: Array.isArray(extract.body?.entities) ? extract.body.entities.length : 0,
      relations: Array.isArray(extract.body?.relations) ? extract.body.relations.length : 0,
      properties: Array.isArray(extract.body?.properties) ? extract.body.properties.length : 0,
    },
    extractWarnings,
    extract.ok ? [] : [String(diagnostics.detail || "extract_failed")],
    !extract.ok,
  );

  const updated: RunRecord = {
    ...run,
    status: "awaiting_approval",
    summary: "Extraction output ready for review.",
    currentStage: "extract",
    nextStage: "persistence_proposal",
    awaitingApproval: true,
    artifacts: [...run.artifacts, extractArtifact],
  };
  await writeRunRecord(updated);
  return updated;
}

async function advanceToProposal(run: RunRecord): Promise<RunRecord> {
  const planArtifact = artifactByStage(run, "plan");
  const evidenceArtifact = artifactByStage(run, "evidence");
  const extractArtifact = artifactByStage(run, "extract");
  const graphContext = (planArtifact?.output_sample as any)?.graph_context ?? { nodes: [], edges: [], view: { focal_ids: [], filters: [], legend: [], counts: {} } };
  const evidence = {
    plan: (evidenceArtifact?.output_sample as any)?.plan ?? {},
    sources: (evidenceArtifact?.output_sample as any)?.sources ?? {},
    summary_text: (evidenceArtifact?.output_sample as any)?.summary_text ?? "",
  };
  const extractBody = extractArtifact?.output_sample ?? {};
  const proposal = buildPersistencePlan(run.runId, run.question, extractBody, evidence, graphContext);
  const blocked = proposal.decision !== "persist_draft";
  const proposalArtifact = await recordStage(
    artifactTemplate(run.runId, "persistence_proposal", { question: run.question }),
    proposal,
    {
      nodes: proposal.nodes.length,
      relations: proposal.relations.length,
      rejected: proposal.rejected_candidates.length,
      unpersisted: proposal.unpersisted_candidates.length,
    },
    blocked && proposal.blocked_reason ? [proposal.blocked_reason] : [],
    [],
    blocked,
  );

  const updated: RunRecord = {
    ...run,
    status: blocked ? "completed" : "awaiting_approval",
    summary: blocked ? "Persistence proposal blocked: no clean connected batch is ready." : "Persistence proposal ready for review.",
    currentStage: "persistence_proposal",
    nextStage: blocked ? null : "commit",
    awaitingApproval: !blocked,
    artifacts: [...run.artifacts, proposalArtifact],
    graph: proposalPreviewGraph(run.graph, proposal),
  };
  await writeRunRecord(updated);
  return updated;
}

async function advanceToCommit(run: RunRecord): Promise<RunRecord> {
  const proposalArtifact = artifactByStage(run, "persistence_proposal");
  const proposal = proposalArtifact?.output_sample ?? {};
  const typedbWrite = await persistGraphPlan(proposal);
  const blocked = typedbWrite?.ok === false || proposal?.decision !== "persist_draft";
  const commitArtifact = await recordStage(
    artifactTemplate(run.runId, "commit", { decision: proposal?.decision || "skip_persist" }),
    typedbWrite,
    {
      written_nodes: Array.isArray(typedbWrite?.created_entities) ? typedbWrite.created_entities.length : 0,
      merged_entities: Array.isArray(typedbWrite?.merged_entities) ? typedbWrite.merged_entities.length : 0,
      written_edges: Array.isArray(typedbWrite?.created_relations) ? typedbWrite.created_relations.length : 0,
    },
    typedbWrite?.warnings ?? [],
    typedbWrite?.errors ?? [],
    blocked,
  );

  const updated: RunRecord = {
    ...run,
    status: blocked ? "failed" : "completed",
    summary: blocked ? "Commit failed or was blocked." : "Draft graph batch committed to the reset database.",
    currentStage: "commit",
    nextStage: null,
    awaitingApproval: false,
    artifacts: [...run.artifacts, commitArtifact],
    graph: sanitizeGraphView((typedbWrite?.graph ?? run.graph) as GraphView),
  };
  await writeRunRecord(updated);
  return updated;
}

export async function advanceRun(runId: string): Promise<RunRecord> {
  const run = await loadRunRecord(runId);
  if (!run) {
    throw new Error("run_not_found");
  }
  if (!run.awaitingApproval || !run.nextStage) {
    return run;
  }

  if (run.nextStage === "evidence") {
    return advanceToEvidence(run);
  }
  if (run.nextStage === "extract") {
    return advanceToExtract(run);
  }
  if (run.nextStage === "persistence_proposal") {
    return advanceToProposal(run);
  }
  if (run.nextStage === "commit") {
    return advanceToCommit(run);
  }
  return run;
}
