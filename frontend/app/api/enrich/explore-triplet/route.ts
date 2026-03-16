import { NextRequest, NextResponse } from "next/server";
import {
  buildResearchOntologyContext,
  buildResearchPacket,
  createReviewSession,
  importResearchBundle,
  irToResearchBundle,
  isAnyPlaceholder,
  parseScopeSpec,
  parseTripletSpec,
  tripletExtractionAdapter,
} from "@/enrichment";
import { hasExtractionMetadata } from "@/enrichment";
import { requireAdminResponseFromRequest } from "@/lib/auth";
import { createStubEntity } from "@/lib/graph-mutations";
import { getGraphStore } from "@/load/persist-graph";
import { resolveEntityNode } from "@/lib/exploration";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 600;

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

const LOG_PREFIX = "[explore-triplet]";

export async function POST(request: NextRequest) {
  const unauth = requireAdminResponseFromRequest(request);
  if (unauth) return unauth;
  try {
    const body = await request.json();
    const tripletSpec = typeof body?.triplet === "string" ? body.triplet.trim() : "";
    console.log(`${LOG_PREFIX} request body.triplet:`, tripletSpec || "(empty/missing)");
    if (!tripletSpec) {
      return NextResponse.json(
        { error: "Missing or invalid body. Send { triplet: \"artist:Paul Weller PLAYED_INSTRUMENT instrument:guitar\" }." },
        { status: 400 }
      );
    }

    const triplet = parseTripletSpec(tripletSpec);
    if (!triplet) {
      console.warn(`${LOG_PREFIX} parse failed for spec:`, tripletSpec);
      return NextResponse.json(
        {
          error:
            "Triplet could not be parsed. Use format: subjectType:subjectName RELATIONSHIP objectType:objectName (e.g. artist:Paul Weller PLAYED_INSTRUMENT instrument:guitar).",
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
              "Scope is required when subject or object name is 'any'. Send { triplet, scope: \"Paul Weller\" } or scope: \"artist:Paul Weller\".",
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

    console.log(
      `${LOG_PREFIX} parsed triplet:`,
      JSON.stringify({ subject: triplet.subject, relationship: triplet.relationship, object: triplet.object })
    );

    const store = await getGraphStore();

    let targets: Array<{ id: string; label: string; name: string }>;
    if (needsScope && scopeTarget) {
      const scopeStubId = `triplet-scope-${slug(scopeTarget.label + "-" + scopeTarget.name)}-${Math.random().toString(36).slice(2, 10)}`;
      const existingScope = await resolveEntityNode(store, scopeTarget.label, scopeTarget.name);
      const scopeId = existingScope?.id ?? scopeStubId;
      if (!existingScope) {
        await createStubEntity(store, { id: scopeStubId, label: scopeTarget.label, name: scopeTarget.name });
        console.log(`${LOG_PREFIX} scope stub created: ${scopeStubId}`);
      } else {
        console.log(`${LOG_PREFIX} scope resolved to existing node: ${scopeId}`);
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
        console.log(`${LOG_PREFIX} subject stub created: ${subjectStubId}`);
      } else {
        console.log(`${LOG_PREFIX} subject resolved to existing node: ${subjectId}`);
      }
      if (!existingObject) {
        await createStubEntity(store, { id: objectStubId, label: triplet.object.label, name: triplet.object.name });
        console.log(`${LOG_PREFIX} object stub created: ${objectStubId}`);
      } else {
        console.log(`${LOG_PREFIX} object resolved to existing node: ${objectId}`);
      }
      targets = [
        { id: subjectId, label: triplet.subject.label, name: triplet.subject.name },
        { id: objectId, label: triplet.object.label, name: triplet.object.name },
      ];
    }

    const session = await createReviewSession(store, targets.map((t) => t.id));
    console.log(`${LOG_PREFIX} session created: id=${session.id} targets=${session.targets.length}`);

    const ontology = buildResearchOntologyContext();
    const extractionInput = {
      type: "triplet" as const,
      sessionId: session.id,
      triplet,
      targets: session.targets,
      options: {
        scopeTarget:
          needsScope && scopeTarget
            ? { id: session.targets[0].id, label: scopeTarget.label, name: scopeTarget.name }
            : undefined,
        hasAnySubject,
        hasAnyObject,
      },
    };
    const extractionResult = await tripletExtractionAdapter.extract(extractionInput, ontology);
    const ir = hasExtractionMetadata(extractionResult) ? extractionResult.ir : extractionResult;
    const bundle = irToResearchBundle(ir, session.id, session.targets, ontology, {
      metadata: hasExtractionMetadata(extractionResult) ? extractionResult.metadata : undefined,
      generatedAt: hasExtractionMetadata(extractionResult) ? extractionResult.generatedAt : undefined,
      summary: hasExtractionMetadata(extractionResult) ? extractionResult.summary : undefined,
    });
    console.log(
      `${LOG_PREFIX} pipeline done (via IR): nodes=${bundle.nodeCandidates?.length ?? 0} edges=${bundle.edgeCandidates?.length ?? 0} propertyChanges=${bundle.propertyChanges?.length ?? 0}`
    );

    const tripletContext =
      !hasAnySubject && session.targets.length >= 2
        ? {
            relationship: triplet.relationship,
            subjectTargetId: session.targets[0].id,
            objectTargetId: session.targets[1].id,
            objectLabel: triplet.object.label,
          }
        : undefined;

    const tripletSpecForImport =
      needsScope && scopeTarget
        ? {
            relationship: triplet.relationship,
            subjectLabel: triplet.subject.label,
            objectLabel: triplet.object.label,
          }
        : undefined;

    const updatedSession = await importResearchBundle(
      store,
      session.id,
      bundle,
      "triplet-exploration",
      tripletContext,
      undefined
    );
    console.log(`${LOG_PREFIX} bundle imported; session status=${updatedSession.status}`);

    return NextResponse.json({
      status: "ok",
      session: updatedSession,
      triplet: {
        subject: triplet.subject,
        relationship: triplet.relationship,
        object: triplet.object,
      },
      researchPacket: buildResearchPacket(updatedSession),
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} error:`, error);
    if (error instanceof Error && error.stack) {
      console.error(`${LOG_PREFIX} stack:`, error.stack);
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Triplet exploration failed.",
      },
      { status: 500 }
    );
  }
}
