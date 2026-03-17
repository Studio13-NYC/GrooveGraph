import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { GraphEdge } from "@/domain/GraphEdge";
import { createTraceLogger, resolveTraceId } from "@/lib/trace";
import { createStubEntity } from "@/lib/graph-mutations";
import { resolveEntityNode } from "@/lib/exploration";
import { getGraphStore, persistGraphStore } from "@/load/persist-graph";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 60;

type ProposedNode = { label: string; value: string; canonicalKey: string };
type ProposedRelationship = {
  type: string;
  fromCanonicalKey: string;
  toCanonicalKey: string;
  direction: "outbound" | "inbound";
  canonicalKey: string;
};
type ProposalAction = "accept" | "reject" | "propose";
type ProposalDecisionStatus = "accepted" | "rejected" | "proposed";
type ProposalDecision = {
  id: string;
  createdAt: string;
  updatedAt: string;
  canonicalKey: string;
  kind: "node" | "relationship";
  action: ProposalDecisionStatus;
};

class MutableGraphEdge extends GraphEdge {}

function getProposalDecisionFilePath(): string {
  return path.join(process.cwd(), "data", "query-builder-insights", "proposal-decisions.json");
}

function ensureProposalDecisionDirectory(): void {
  const dir = path.dirname(getProposalDecisionFilePath());
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function loadProposalDecisions(): ProposalDecision[] {
  const filePath = getProposalDecisionFilePath();
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ProposalDecision => {
      return Boolean(item && typeof item === "object" && typeof (item as ProposalDecision).canonicalKey === "string");
    });
  } catch {
    return [];
  }
}

function saveProposalDecisions(items: ProposalDecision[]): void {
  ensureProposalDecisionDirectory();
  writeFileSync(getProposalDecisionFilePath(), JSON.stringify(items, null, 2), "utf8");
}

function recordProposalDecision(input: {
  canonicalKey: string;
  kind: "node" | "relationship";
  action: ProposalDecisionStatus;
}): ProposalDecision {
  const current = loadProposalDecisions();
  const existing = current.find((item) => item.canonicalKey === input.canonicalKey && item.kind === input.kind);
  const now = new Date().toISOString();
  const decision: ProposalDecision = existing
    ? { ...existing, action: input.action, updatedAt: now }
    : {
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        canonicalKey: input.canonicalKey,
        kind: input.kind,
        action: input.action,
      };
  const next = [decision, ...current.filter((item) => !(item.canonicalKey === input.canonicalKey && item.kind === input.kind))].slice(0, 5000);
  saveProposalDecisions(next);
  return decision;
}

function isProposedNode(value: unknown): value is ProposedNode {
  if (!value || typeof value !== "object") return false;
  const v = value as ProposedNode;
  return (
    typeof v.label === "string" &&
    typeof v.value === "string" &&
    typeof v.canonicalKey === "string" &&
    v.label.trim().length > 0 &&
    v.value.trim().length > 0 &&
    v.canonicalKey.trim().length > 0
  );
}

function isProposedRelationship(value: unknown): value is ProposedRelationship {
  if (!value || typeof value !== "object") return false;
  const v = value as ProposedRelationship;
  return (
    typeof v.type === "string" &&
    typeof v.fromCanonicalKey === "string" &&
    typeof v.toCanonicalKey === "string" &&
    (v.direction === "outbound" || v.direction === "inbound") &&
    typeof v.canonicalKey === "string"
  );
}

async function ensureNodePersisted(node: ProposedNode): Promise<{ id: string; created: boolean }> {
  const store = await getGraphStore();
  const existing = await resolveEntityNode(store, node.label, node.value);
  if (existing) {
    return { id: existing.id, created: false };
  }
  const created = await createStubEntity(store, {
    label: node.label,
    name: node.value,
    id: `proposal-${randomUUID().slice(0, 12)}`,
  });
  return { id: created.id, created: true };
}

export async function POST(request: NextRequest) {
  const traceId = resolveTraceId(request.headers);
  const trace = createTraceLogger(traceId, "api.query-builder.accept-proposal");
  trace.log("request.received", { path: "/api/query-builder/accept-proposal", method: request.method });

  const body = (await request.json().catch(() => ({}))) as {
    action?: ProposalAction;
    kind?: "node" | "relationship";
    node?: ProposedNode;
    relationship?: ProposedRelationship;
    nodes?: ProposedNode[];
  };
  const action: ProposalAction = body.action === "reject" || body.action === "propose" ? body.action : "accept";

  if (body.kind === "node") {
    if (!isProposedNode(body.node)) {
      return NextResponse.json({ traceId, error: "Invalid node proposal payload." }, { status: 400 });
    }
    if (action !== "accept") {
      const decision = recordProposalDecision({
        canonicalKey: body.node.canonicalKey,
        kind: "node",
        action: action === "reject" ? "rejected" : "proposed",
      });
      trace.log("node.tagged", { canonicalKey: body.node.canonicalKey, action: decision.action });
      return NextResponse.json(
        {
          traceId,
          status: decision.action,
          kind: "node",
          canonicalKey: body.node.canonicalKey,
          created: false,
        },
        { headers: { "x-trace-id": traceId } }
      );
    }
    const persisted = await ensureNodePersisted(body.node);
    await persistGraphStore();
    const decision = recordProposalDecision({
      canonicalKey: body.node.canonicalKey,
      kind: "node",
      action: "accepted",
    });
    trace.log("node.accepted", {
      canonicalKey: body.node.canonicalKey,
      nodeId: persisted.id,
      created: persisted.created,
    });
    return NextResponse.json(
      {
        traceId,
        status: decision.action,
        kind: "node",
        canonicalKey: body.node.canonicalKey,
        nodeId: persisted.id,
        created: persisted.created,
      },
      { headers: { "x-trace-id": traceId } }
    );
  }

  if (body.kind === "relationship") {
    if (!isProposedRelationship(body.relationship)) {
      return NextResponse.json({ traceId, error: "Invalid relationship proposal payload." }, { status: 400 });
    }
    if (action !== "accept") {
      const decision = recordProposalDecision({
        canonicalKey: body.relationship.canonicalKey,
        kind: "relationship",
        action: action === "reject" ? "rejected" : "proposed",
      });
      trace.log("relationship.tagged", { canonicalKey: body.relationship.canonicalKey, action: decision.action });
      return NextResponse.json(
        {
          traceId,
          status: decision.action,
          kind: "relationship",
          canonicalKey: body.relationship.canonicalKey,
          created: false,
        },
        { headers: { "x-trace-id": traceId } }
      );
    }
    const nodeMap = new Map<string, ProposedNode>();
    for (const candidate of body.nodes ?? []) {
      if (isProposedNode(candidate)) {
        nodeMap.set(candidate.canonicalKey, candidate);
      }
    }

    const fromProposal = nodeMap.get(body.relationship.fromCanonicalKey);
    const toProposal = nodeMap.get(body.relationship.toCanonicalKey);
    if (!fromProposal || !toProposal) {
      return NextResponse.json(
        { traceId, error: "Relationship proposal is missing from/to node payloads." },
        { status: 400 }
      );
    }

    const fromPersisted = await ensureNodePersisted(fromProposal);
    const toPersisted = await ensureNodePersisted(toProposal);
    const store = await getGraphStore();
    const edgeType = body.relationship.type;
    const fromNodeId = body.relationship.direction === "outbound" ? fromPersisted.id : toPersisted.id;
    const toNodeId = body.relationship.direction === "outbound" ? toPersisted.id : fromPersisted.id;

    const existing = await store.findEdges({
      type: edgeType,
      fromNodeId,
      toNodeId,
      maxResults: 1,
    });

    let edgeId = existing[0]?.id ?? "";
    let created = false;
    if (!edgeId) {
      edgeId = `proposal-edge-${randomUUID().slice(0, 12)}`;
      await store.createEdge(
        new MutableGraphEdge(
          edgeId,
          edgeType,
          fromNodeId,
          toNodeId,
          {},
          {
            proposed: false,
            accepted_via: "query-builder",
            accepted_trace_id: traceId,
          }
        )
      );
      created = true;
    }
    await persistGraphStore();
    const decision = recordProposalDecision({
      canonicalKey: body.relationship.canonicalKey,
      kind: "relationship",
      action: "accepted",
    });
    trace.log("relationship.accepted", {
      canonicalKey: body.relationship.canonicalKey,
      edgeId,
      created,
      fromNodeId,
      toNodeId,
      edgeType,
    });
    return NextResponse.json(
      {
        traceId,
        status: decision.action,
        kind: "relationship",
        canonicalKey: body.relationship.canonicalKey,
        edgeId,
        created,
      },
      { headers: { "x-trace-id": traceId } }
    );
  }

  return NextResponse.json(
    { traceId, error: "Invalid kind. Expected 'node' or 'relationship'." },
    { status: 400, headers: { "x-trace-id": traceId } }
  );
}
