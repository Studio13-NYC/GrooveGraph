import { randomUUID } from "node:crypto";
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

class MutableGraphEdge extends GraphEdge {}

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
    kind?: "node" | "relationship";
    node?: ProposedNode;
    relationship?: ProposedRelationship;
    nodes?: ProposedNode[];
  };

  if (body.kind === "node") {
    if (!isProposedNode(body.node)) {
      return NextResponse.json({ traceId, error: "Invalid node proposal payload." }, { status: 400 });
    }
    const persisted = await ensureNodePersisted(body.node);
    await persistGraphStore();
    trace.log("node.accepted", {
      canonicalKey: body.node.canonicalKey,
      nodeId: persisted.id,
      created: persisted.created,
    });
    return NextResponse.json(
      {
        traceId,
        status: "accepted",
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
        status: "accepted",
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
