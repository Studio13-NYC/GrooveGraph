import { NextRequest, NextResponse } from "next/server";
import { POST as exploreTripletPost } from "../explore-triplet/route";
import {
  buildResearchPacket,
  createReviewSession,
  importResearchBundle,
  isAnyPlaceholder,
  parseScopeSpec,
  parseTripletSpec,
  runLlmOnlyPipeline,
} from "@/enrichment";
import { createStubEntity } from "@/lib/graph-mutations";
import { getGraphStore } from "@/load/persist-graph";
import { resolveEntityNode } from "@/lib/exploration";
import type { EnrichmentWorkflowType } from "@/enrichment/types";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const LOG_PREFIX = "[extract]";

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function normalizeWorkflowType(value: unknown): EnrichmentWorkflowType | null {
  if (value === "triplet" || value === "span_mention" || value === "llm_only" || value === "hybrid") {
    return value;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const workflowType = normalizeWorkflowType(body?.workflowType);
    if (!workflowType) {
      return NextResponse.json(
        {
          error:
            "Missing or invalid workflowType. Supported values: triplet, span_mention, llm_only, hybrid.",
        },
        { status: 400 }
      );
    }

    if (workflowType === "triplet") {
      const delegatedRequest = new NextRequest(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify({
          triplet: body?.triplet,
          ...(typeof body?.scope === "string" && body.scope.trim() ? { scope: body.scope.trim() } : {}),
        }),
      });
      return await exploreTripletPost(delegatedRequest);
    }

    if (workflowType === "llm_only") {
      const tripletSpec = typeof body?.triplet === "string" ? body.triplet.trim() : "";
      console.log(`${LOG_PREFIX} llm_only body.triplet:`, tripletSpec || "(empty/missing)");
      if (!tripletSpec) {
        return NextResponse.json(
          {
            error:
              "Missing or invalid body. Send { workflowType: \"llm_only\", triplet: \"artist:Paul Weller PLAYED_INSTRUMENT instrument:guitar\" }.",
          },
          { status: 400 }
        );
      }

      const triplet = parseTripletSpec(tripletSpec);
      if (!triplet) {
        return NextResponse.json(
          {
            error:
              "Triplet could not be parsed. Use format: subjectType:subjectName RELATIONSHIP objectType:objectName.",
          },
          { status: 400 }
        );
      }

      const hasAnySubject = isAnyPlaceholder(triplet.subject.name);
      const hasAnyObject = isAnyPlaceholder(triplet.object.name);
      const needsScope = hasAnySubject || hasAnyObject;
      let scopeTarget: { id: string; label: string; name: string } | null = null;

      if (needsScope) {
        const scopeSpec = typeof body?.scope === "string" ? body.scope.trim() : "";
        if (!scopeSpec) {
          return NextResponse.json(
            {
              error:
                "Scope is required when subject or object name is 'any'. Send { triplet, scope: \"Paul Weller\" }.",
            },
            { status: 400 }
          );
        }
        const parsed = parseScopeSpec(scopeSpec);
        if (!parsed) {
          return NextResponse.json(
            { error: "Scope could not be parsed. Use 'Paul Weller' or 'artist:Paul Weller'." },
            { status: 400 }
          );
        }
        scopeTarget = { ...parsed, id: "" };
      }

      const store = await getGraphStore();

      let targets: Array<{ id: string; label: string; name: string }>;
      if (needsScope && scopeTarget) {
        const scopeStubId = `triplet-scope-${slug(scopeTarget.label + "-" + scopeTarget.name)}-${Math.random().toString(36).slice(2, 10)}`;
        const existingScope = await resolveEntityNode(store, scopeTarget.label, scopeTarget.name);
        const scopeId = existingScope?.id ?? scopeStubId;
        if (!existingScope) {
          await createStubEntity(store, { id: scopeStubId, label: scopeTarget.label, name: scopeTarget.name });
        }
        targets = [{ id: scopeId, label: scopeTarget.label, name: scopeTarget.name }];
      } else {
        const suffix = Math.random().toString(36).slice(2, 10);
        const subjectStubId = `triplet-subject-${slug(triplet.subject.label + "-" + triplet.subject.name)}-${suffix}`;
        const objectStubId = `triplet-object-${slug(triplet.object.label + "-" + triplet.object.name)}-${suffix}`;
        const existingSubject = await resolveEntityNode(store, triplet.subject.label, triplet.subject.name);
        const existingObject = await resolveEntityNode(store, triplet.object.label, triplet.object.name);
        const subjectId = existingSubject?.id ?? subjectStubId;
        const objectId = existingObject?.id ?? objectStubId;
        if (!existingSubject) {
          await createStubEntity(store, { id: subjectStubId, label: triplet.subject.label, name: triplet.subject.name });
        }
        if (!existingObject) {
          await createStubEntity(store, { id: objectStubId, label: triplet.object.label, name: triplet.object.name });
        }
        targets = [
          { id: subjectId, label: triplet.subject.label, name: triplet.subject.name },
          { id: objectId, label: triplet.object.label, name: triplet.object.name },
        ];
      }

      const session = await createReviewSession(store, targets.map((t) => t.id));
      console.log(`${LOG_PREFIX} llm_only session created: id=${session.id} targets=${session.targets.length}`);

      const result = await runLlmOnlyPipeline(session.id, session.targets);
      console.log(
        `${LOG_PREFIX} llm_only pipeline done: nodes=${result.bundle.nodeCandidates?.length ?? 0} edges=${result.bundle.edgeCandidates?.length ?? 0}`
      );

      const updatedSession = await importResearchBundle(
        store,
        session.id,
        result.bundle,
        "llm-only",
        undefined,
        "llm_only"
      );

      return NextResponse.json({
        status: "ok",
        session: updatedSession,
        researchPacket: buildResearchPacket(updatedSession),
      });
    }

    return NextResponse.json(
      {
        error: `workflowType '${workflowType}' is not implemented yet. Use workflowType: 'triplet' or 'llm_only'.`,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} error:`, error);
    if (error instanceof Error && error.stack) {
      console.error(`${LOG_PREFIX} stack:`, error.stack);
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to run generic enrichment extract route.",
      },
      { status: 500 }
    );
  }
}
