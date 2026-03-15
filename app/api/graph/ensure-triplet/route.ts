import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  applyReviewSession,
  buildResearchOntologyContext,
  createReviewSession,
  importResearchBundle,
  irToResearchBundle,
  isAnyPlaceholder,
  parseScopeSpec,
  parseTripletSpec,
  tripletExtractionAdapter,
} from "@/enrichment";
import { hasExtractionMetadata } from "@/enrichment";
import { requireAdminResponse } from "@/lib/auth";
import { createStubEntity } from "@/lib/graph-mutations";
import { getGraphStore, persistGraphStore } from "@/load/persist-graph";
import { resolveEntityNode } from "@/lib/exploration";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
export const maxDuration = 120;

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

const LOG_PREFIX = "[ensure-triplet]";

/**
 * POST /api/graph/ensure-triplet
 * Runs LLM discovery for the triplet+scope (e.g. Album:Stanley Road CONTAINS Song:any, scope Artist:Paul Weller),
 * then applies the resulting nodes and CONTAINS edges to the graph so the exploration view shows album and songs.
 * Admin-only. Call before loading the triplet-scoped graph when you want to discover and persist missing data.
 */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const unauth = requireAdminResponse(cookieStore);
  if (unauth) return unauth;
  try {
    const body = await request.json().catch(() => ({}));
    const tripletSpec = typeof body?.triplet === "string" ? body.triplet.trim() : "";
    const scopeSpec = typeof body?.scope === "string" ? body.scope.trim() : "";
    if (!tripletSpec || !scopeSpec) {
      return NextResponse.json(
        { error: "Missing triplet or scope. Send { triplet: \"Album:Stanley Road CONTAINS Track:any\", scope: \"Artist:Paul Weller\" }." },
        { status: 400 }
      );
    }

    const triplet = parseTripletSpec(tripletSpec);
    const scope = parseScopeSpec(scopeSpec);
    if (!triplet || !scope) {
      return NextResponse.json(
        { error: "Invalid triplet or scope format." },
        { status: 400 }
      );
    }

    const hasAnySubject = isAnyPlaceholder(triplet.subject.name);
    const hasAnyObject = isAnyPlaceholder(triplet.object.name);
    const scopeTarget = { ...scope, id: "" };

    const store = await getGraphStore();
    const scopeStubId = `triplet-scope-${slug(scope.label + "-" + scope.name)}-${Math.random().toString(36).slice(2, 10)}`;
    const existingScope = await resolveEntityNode(store, scope.label, scope.name);
    const scopeId = existingScope?.id ?? scopeStubId;
    if (!existingScope) {
      await createStubEntity(store, { id: scopeStubId, label: scope.label, name: scope.name });
      console.log(`${LOG_PREFIX} scope stub created: ${scopeStubId}`);
    }
    const targets = [{ id: scopeId, label: scopeTarget.label, name: scopeTarget.name }];

    const session = await createReviewSession(store, targets.map((t) => t.id));
    const ontology = buildResearchOntologyContext();
    const extractionInput = {
      type: "triplet" as const,
      sessionId: session.id,
      triplet,
      targets: session.targets,
      options: {
        scopeTarget: { id: session.targets[0].id, label: scopeTarget.label, name: scopeTarget.name },
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
    const tripletContext =
      !hasAnySubject && session.targets.length >= 2
        ? {
            relationship: triplet.relationship,
            subjectTargetId: session.targets[0].id,
            objectTargetId: session.targets[1].id,
            objectLabel: triplet.object.label,
          }
        : undefined;

    const tripletSpecForImport = {
      relationship: triplet.relationship,
      subjectLabel: triplet.subject.label,
      objectLabel: triplet.object.label,
    };
    await importResearchBundle(
      store,
      session.id,
      bundle,
      "triplet-exploration",
      tripletContext,
      undefined,
      tripletSpecForImport
    );
    const applied = await applyReviewSession(store, session.id);
    await persistGraphStore();

    const nodeCount = applied.nodeCandidates?.length ?? 0;
    const edgeCount = applied.edgeCandidates?.length ?? 0;
    console.log(`${LOG_PREFIX} applied session=${session.id} nodes=${nodeCount} edges=${edgeCount}`);

    return NextResponse.json({
      status: "ok",
      applied: true,
      sessionId: session.id,
      nodeCount,
      edgeCount,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ensure triplet failed." },
      { status: 500 }
    );
  }
}
