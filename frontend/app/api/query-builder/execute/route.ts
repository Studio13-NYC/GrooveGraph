import neo4j, { type Integer, type Node as Neo4jNode, type Relationship as Neo4jRelationship } from "neo4j-driver";
import { NextRequest, NextResponse } from "next/server";
import { createTraceLogger, resolveTraceId } from "@/lib/trace";
import { loadOntologyRuntime } from "@/ontology";
import { compileQueryStateToCypher, type QueryState } from "@/query-builder";
import { getNeo4jConfig } from "@/store/neo4j-config";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 60;

type GraphNodePayload = {
  id: string;
  label: string;
  name: string;
  labels?: string[];
  nodeKind?: "focus" | "entity";
  entityLabel?: string;
};

type GraphLinkPayload = {
  source: string;
  target: string;
  type: string;
};

type BuildGraphResult = {
  graph: {
    nodes: GraphNodePayload[];
    links: GraphLinkPayload[];
    focusNodeId?: string;
  };
  sampleMatches: Array<{ chain: string[] }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isQueryNodeSelector(value: unknown): value is QueryState["start"] {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.label) &&
    isNonEmptyString(value.propertyKey) &&
    isString(value.value)
  );
}

function isQueryDirection(value: unknown): value is "outbound" | "inbound" {
  return value === "outbound" || value === "inbound";
}

function isQueryState(value: unknown): value is QueryState {
  if (!isRecord(value)) return false;
  if (!isQueryNodeSelector(value.start)) return false;
  if (!Array.isArray(value.steps)) return false;
  for (const step of value.steps) {
    if (!isRecord(step)) return false;
    if (!isNonEmptyString(step.relationshipType)) return false;
    if (!isQueryDirection(step.direction)) return false;
    if (!isQueryNodeSelector(step.target)) return false;
  }
  return true;
}

function integerToNumber(value: Integer | unknown): number {
  if (neo4j.isInt(value)) {
    return (value as Integer).toNumber();
  }
  return Number(value);
}

function toNodeId(node: Neo4jNode): string {
  const explicitId = node.properties?.id;
  if (typeof explicitId === "string" && explicitId.trim()) return explicitId;
  if (neo4j.isInt(node.identity)) return `neo4j:${integerToNumber(node.identity)}`;
  return String(node.identity);
}

function toNodeName(node: Neo4jNode): string {
  const candidate =
    node.properties?.name ??
    node.properties?.title ??
    node.properties?.venue ??
    node.properties?.id;
  return typeof candidate === "string" && candidate.trim() ? candidate : toNodeId(node);
}

function toEntityLabel(node: Neo4jNode): string {
  const firstLabel = node.labels.find((label) => label !== "GraphEntity");
  return firstLabel ?? node.labels[0] ?? "Entity";
}

function asNeo4jLimit(value: unknown): Integer {
  const fallback = 25;
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return neo4j.int(Math.max(1, Math.floor(numeric)));
}

function buildGraphFromRecords(records: neo4j.QueryResult["records"], stepCount: number): BuildGraphResult {
  const nodes = new Map<string, GraphNodePayload>();
  const links = new Map<string, GraphLinkPayload>();
  const sampleMatches: Array<{ chain: string[] }> = [];

  for (const record of records) {
    const chain: string[] = [];
    for (let i = 0; i <= stepCount; i += 1) {
      const rawNode = record.get(`n${i}`) as Neo4jNode | null;
      if (!rawNode) continue;
      const id = toNodeId(rawNode);
      const entityLabel = toEntityLabel(rawNode);
      const name = toNodeName(rawNode);
      chain.push(name);
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          label: entityLabel,
          name,
          labels: rawNode.labels,
          nodeKind: i === 0 ? "focus" : "entity",
          entityLabel,
        });
      }
    }

    for (let i = 0; i < stepCount; i += 1) {
      const fromNode = record.get(`n${i}`) as Neo4jNode | null;
      const toNode = record.get(`n${i + 1}`) as Neo4jNode | null;
      const rawRel = record.get(`r${i}`) as Neo4jRelationship | null;
      if (!fromNode || !toNode || !rawRel) continue;
      const source = toNodeId(fromNode);
      const target = toNodeId(toNode);
      const relIdProperty = rawRel.properties?.id;
      const edgeId =
        typeof relIdProperty === "string" && relIdProperty.trim()
          ? relIdProperty
          : `${source}:${rawRel.type}:${target}:${integerToNumber(rawRel.identity)}`;
      if (!links.has(edgeId)) {
        links.set(edgeId, { source, target, type: rawRel.type });
      }
    }

    if (chain.length > 0 && sampleMatches.length < 10) {
      sampleMatches.push({ chain });
    }
  }

  const nodeValues = [...nodes.values()];
  return {
    graph: {
      nodes: nodeValues,
      links: [...links.values()],
      focusNodeId: nodeValues[0]?.id,
    },
    sampleMatches,
  };
}

export async function POST(request: NextRequest) {
  const traceId = resolveTraceId(request.headers);
  const trace = createTraceLogger(traceId, "api.query-builder.execute");
  const startedAt = Date.now();

  trace.log("request.received", { method: request.method, path: "/api/query-builder/execute" });

  const rawBody = await request.json().catch(() => ({}));
  const payload = rawBody as { queryState?: unknown };

  if (!isQueryState(payload.queryState)) {
    return NextResponse.json(
      {
        traceId,
        error:
          "Invalid queryState payload. Expected shape: { start:{label,propertyKey,value}, steps:[{relationshipType,direction,target:{label,propertyKey,value}}], limit? }",
      },
      { status: 400, headers: { "x-trace-id": traceId } }
    );
  }

  let driver: neo4j.Driver | null = null;
  let session: neo4j.Session | null = null;
  try {
    const ontology = loadOntologyRuntime();
    const compiled = compileQueryStateToCypher(payload.queryState, ontology);

    const config = getNeo4jConfig();
    driver = neo4j.driver(config.uri, neo4j.auth.basic(config.username, config.password));
    session = driver.session({ database: config.database, defaultAccessMode: neo4j.session.READ });

    const runParams: Record<string, unknown> = { ...compiled.params, limit: asNeo4jLimit(compiled.params.limit) };

    const result = await session.run(compiled.cypher, runParams);
    const built = buildGraphFromRecords(result.records, payload.queryState.steps.length);

    trace.log("execute.completed", {
      recordCount: result.records.length,
      nodeCount: built.graph.nodes.length,
      linkCount: built.graph.links.length,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        traceId,
        compiled,
        graph: built.graph,
        resultCount: result.records.length,
        sampleMatches: built.sampleMatches,
        metrics: { durationMs: Date.now() - startedAt },
      },
      { headers: { "x-trace-id": traceId } }
    );
  } catch (error) {
    trace.log("execute.failed", {
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        traceId,
        error: error instanceof Error ? error.message : "Failed to execute query",
      },
      { status: 500, headers: { "x-trace-id": traceId } }
    );
  } finally {
    if (session) await session.close();
    if (driver) await driver.close();
  }
}
