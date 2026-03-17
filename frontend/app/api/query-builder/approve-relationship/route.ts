import { writeFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { createTraceLogger, resolveTraceId } from "@/lib/trace";
import { markRelationshipProposalAccepted } from "@/query-builder";
import { getOntologySchemaPath, loadOntologyRuntime, loadOntologySchema, type OntologySchema } from "@/ontology";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 30;

type ApprovalPayload = {
  proposalId: string;
  relationshipType: string;
  direction: "outbound" | "inbound";
  fromLabel: string;
  toLabel: string;
};

function applyRelationshipApproval(schema: OntologySchema, payload: ApprovalPayload): OntologySchema {
  const relationshipType = payload.relationshipType.trim();
  const canonicalFrom = payload.fromLabel.trim();
  const canonicalTo = payload.toLabel.trim();
  const subjectLabel = payload.direction === "outbound" ? canonicalFrom : canonicalTo;
  const objectLabel = payload.direction === "outbound" ? canonicalTo : canonicalFrom;

  const clone: OntologySchema = {
    ...schema,
    entities: Object.fromEntries(
      Object.entries(schema.entities).map(([label, entity]) => [
        label,
        {
          ...entity,
          allowedRelationshipsAsSubject: entity.allowedRelationshipsAsSubject
            ? [...entity.allowedRelationshipsAsSubject]
            : undefined,
          allowedRelationshipsAsObject: entity.allowedRelationshipsAsObject
            ? [...entity.allowedRelationshipsAsObject]
            : undefined,
        },
      ])
    ),
    relationships: schema.relationships.map((item) => ({
      ...item,
      subjectLabels: [...item.subjectLabels],
      objectLabels: [...item.objectLabels],
      synonyms: item.synonyms ? [...item.synonyms] : undefined,
    })),
  };

  const existing = clone.relationships.find((item) => item.type === relationshipType);
  if (existing) {
    if (!existing.subjectLabels.includes(subjectLabel)) existing.subjectLabels.push(subjectLabel);
    if (!existing.objectLabels.includes(objectLabel)) existing.objectLabels.push(objectLabel);
    const subjectEntity = clone.entities[subjectLabel];
    if (subjectEntity) {
      subjectEntity.allowedRelationshipsAsSubject = Array.from(
        new Set([...(subjectEntity.allowedRelationshipsAsSubject ?? []), relationshipType])
      );
    }
    const objectEntity = clone.entities[objectLabel];
    if (objectEntity) {
      objectEntity.allowedRelationshipsAsObject = Array.from(
        new Set([...(objectEntity.allowedRelationshipsAsObject ?? []), relationshipType])
      );
    }
    return clone;
  }

  clone.relationships.push({
    type: relationshipType,
    description: "User-approved relationship from proposed query interpretation.",
    subjectLabels: [subjectLabel],
    objectLabels: [objectLabel],
    synonyms: [relationshipType.toLowerCase().replace(/_/g, " ")],
  });
  const subjectEntity = clone.entities[subjectLabel];
  if (subjectEntity) {
    subjectEntity.allowedRelationshipsAsSubject = Array.from(
      new Set([...(subjectEntity.allowedRelationshipsAsSubject ?? []), relationshipType])
    );
  }
  const objectEntity = clone.entities[objectLabel];
  if (objectEntity) {
    objectEntity.allowedRelationshipsAsObject = Array.from(
      new Set([...(objectEntity.allowedRelationshipsAsObject ?? []), relationshipType])
    );
  }
  return clone;
}

export async function POST(request: NextRequest) {
  const traceId = resolveTraceId(request.headers);
  const trace = createTraceLogger(traceId, "api.query-builder.approve-relationship");
  trace.log("request.received", { method: request.method, path: "/api/query-builder/approve-relationship" });

  const body = (await request.json().catch(() => ({}))) as Partial<ApprovalPayload>;
  const payload: ApprovalPayload | null =
    typeof body.proposalId === "string" &&
    typeof body.relationshipType === "string" &&
    (body.direction === "outbound" || body.direction === "inbound") &&
    typeof body.fromLabel === "string" &&
    typeof body.toLabel === "string"
      ? {
          proposalId: body.proposalId,
          relationshipType: body.relationshipType,
          direction: body.direction,
          fromLabel: body.fromLabel,
          toLabel: body.toLabel,
        }
      : null;

  if (!payload) {
    return NextResponse.json(
      { traceId, error: "Invalid payload for relationship approval." },
      { status: 400, headers: { "x-trace-id": traceId } }
    );
  }

  const currentSchema = loadOntologySchema({ forceReload: true });
  const updatedSchema = applyRelationshipApproval(currentSchema, payload);
  const schemaPath = getOntologySchemaPath();
  writeFileSync(schemaPath, `${JSON.stringify(updatedSchema, null, 2)}\n`, "utf8");
  loadOntologyRuntime({ forceReload: true });
  const proposal = markRelationshipProposalAccepted(payload.proposalId);

  trace.log("approval.applied", {
    proposalId: payload.proposalId,
    relationshipType: payload.relationshipType,
    direction: payload.direction,
    fromLabel: payload.fromLabel,
    toLabel: payload.toLabel,
  });

  return NextResponse.json(
    {
      traceId,
      status: "accepted",
      proposal,
    },
    { headers: { "x-trace-id": traceId } }
  );
}
