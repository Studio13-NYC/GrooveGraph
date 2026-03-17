import { writeFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { createTraceLogger, resolveTraceId } from "@/lib/trace";
import {
  buildHumanSummary,
  compileQueryStateToCypher,
  getOntologyAwareNextOptions,
  getRelationshipProposalById,
  interpretQueryPrompt,
  markRelationshipProposalAccepted,
  synthesizeResearchAnswer,
  type QueryState,
} from "@/query-builder";
import { getOntologySchemaPath, loadOntologyRuntime, loadOntologySchema, type OntologySchema } from "@/ontology";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 30;

type ApprovalPayload = {
  proposalId: string;
  relationshipType: string;
  direction: "outbound" | "inbound";
  fromLabel: string;
  toLabel: string;
  aliases?: string[];
  resume?: {
    prompt?: string;
    queryState?: QueryState;
    llmState?: { conversationId?: string; previousResponseId?: string };
  };
};

function isQueryState(value: unknown): value is QueryState {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Record<string, unknown>;
  if (!maybe.start || typeof maybe.start !== "object") return false;
  if (!Array.isArray(maybe.steps)) return false;
  return true;
}

function applyRelationshipApproval(schema: OntologySchema, payload: ApprovalPayload): OntologySchema {
  const relationshipType = payload.relationshipType.trim();
  const canonicalFrom = payload.fromLabel.trim();
  const canonicalTo = payload.toLabel.trim();
  const subjectLabel = payload.direction === "outbound" ? canonicalFrom : canonicalTo;
  const objectLabel = payload.direction === "outbound" ? canonicalTo : canonicalFrom;
  const aliases = Array.from(new Set((payload.aliases ?? []).map((item) => item.trim()).filter(Boolean)));

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
      aliases: item.aliases ? [...item.aliases] : undefined,
    })),
  };

  const existing = clone.relationships.find((item) => item.type === relationshipType);
  if (existing) {
    if (!existing.subjectLabels.includes(subjectLabel)) existing.subjectLabels.push(subjectLabel);
    if (!existing.objectLabels.includes(objectLabel)) existing.objectLabels.push(objectLabel);
    existing.aliases = Array.from(new Set([...(existing.aliases ?? []), ...aliases]));
    existing.synonyms = Array.from(new Set([...(existing.synonyms ?? []), ...aliases]));
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
    synonyms: Array.from(
      new Set([relationshipType.toLowerCase().replace(/_/g, " "), ...aliases])
    ),
    aliases,
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
          aliases: Array.isArray(body.aliases)
            ? body.aliases.filter((item): item is string => typeof item === "string")
            : undefined,
          resume:
            body.resume && typeof body.resume === "object"
              ? {
                  prompt: typeof body.resume.prompt === "string" ? body.resume.prompt : undefined,
                  queryState: isQueryState(body.resume.queryState) ? body.resume.queryState : undefined,
                  llmState:
                    body.resume.llmState && typeof body.resume.llmState === "object"
                      ? {
                          conversationId:
                            typeof body.resume.llmState.conversationId === "string"
                              ? body.resume.llmState.conversationId
                              : undefined,
                          previousResponseId:
                            typeof body.resume.llmState.previousResponseId === "string"
                              ? body.resume.llmState.previousResponseId
                              : undefined,
                        }
                      : undefined,
                }
              : undefined,
        }
      : null;

  if (!payload) {
    return NextResponse.json(
      { traceId, error: "Invalid payload for relationship approval." },
      { status: 400, headers: { "x-trace-id": traceId } }
    );
  }

  const proposalDetails = getRelationshipProposalById(payload.proposalId);
  const mergedAliases = Array.from(
    new Set([...(payload.aliases ?? []), ...(proposalDetails?.aliasCandidates ?? [])])
  );
  const currentSchema = loadOntologySchema({ forceReload: true });
  const updatedSchema = applyRelationshipApproval(currentSchema, {
    ...payload,
    aliases: mergedAliases,
  });
  const schemaPath = getOntologySchemaPath();
  writeFileSync(schemaPath, `${JSON.stringify(updatedSchema, null, 2)}\n`, "utf8");
  const ontology = loadOntologyRuntime({ forceReload: true });
  const proposal = markRelationshipProposalAccepted(payload.proposalId);
  let resumedInterpretation: Record<string, unknown> | undefined;
  if (payload.resume?.queryState || payload.resume?.prompt?.trim()) {
    try {
      let queryState = payload.resume?.queryState;
      let llmState = payload.resume?.llmState;
      let strategy = "resume-query-state";
      let rationale = "Resumed using current query state after ontology approval.";
      if (!queryState && payload.resume?.prompt?.trim()) {
        const interpreted = await interpretQueryPrompt(payload.resume.prompt.trim(), ontology, { llmState });
        llmState = interpreted.llmState;
        strategy = interpreted.strategy;
        rationale = interpreted.rationale;
        if (interpreted.needsFollowUp || !interpreted.queryState) {
          resumedInterpretation = {
            needsFollowUp: true,
            followUpQuestion: interpreted.followUpQuestion,
            followUpOptions: interpreted.followUpOptions,
            relationshipNamingSuggestion: interpreted.relationshipNamingSuggestion,
            strategy,
            rationale,
            llmState,
          };
        } else {
          queryState = interpreted.queryState;
        }
      }
      if (!resumedInterpretation && queryState) {
        let compiled: { cypher: string; params: Record<string, unknown> };
        let compileBlockedReason: string | undefined;
        try {
          compiled = compileQueryStateToCypher(queryState, ontology);
        } catch (error) {
          compileBlockedReason = error instanceof Error ? error.message : String(error);
          compiled = {
            cypher: "-- compile blocked after relationship approval; inspect diagnostics --",
            params: {},
          };
        }
        const summary = buildHumanSummary(queryState);
        const nextOptions = getOntologyAwareNextOptions(queryState, ontology);
        const prompt = payload.resume?.prompt?.trim();
        const research = prompt
          ? await synthesizeResearchAnswer({
              prompt,
              queryState,
              ontology,
              trace,
              llmState,
            })
          : { answerMarkdown: "", strategy: "resume-no-research", proposedAdditions: { nodes: [], relationships: [] } };
        if ("llmState" in research && research.llmState) {
          llmState = research.llmState;
        }

        resumedInterpretation = {
          strategy,
          rationale,
          queryState,
          compiled,
          compileBlockedReason,
          summary,
          nextOptions,
          answerMarkdown: research.answerMarkdown,
          answerStrategy: research.strategy,
          proposedAdditions: research.proposedAdditions,
          llmState,
        };
      }
    } catch (error) {
      resumedInterpretation = {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

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
      resumedInterpretation,
    },
    { headers: { "x-trace-id": traceId } }
  );
}
