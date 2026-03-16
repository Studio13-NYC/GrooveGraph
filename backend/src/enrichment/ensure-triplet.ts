import type { GraphStore } from "@/store/types";
import { createStubEntity } from "@/lib/graph-mutations";
import { resolveEntityNode } from "@/lib/exploration";
import { runAlbumContainsTrackPipeline } from "./pipelines/album-contains-track";
import { tripletExtractionAdapter } from "./adapters/triplet-extraction-adapter";
import { hasExtractionMetadata } from "./extraction";
import { irToResearchBundle } from "./extraction/normalize-ir";
import { buildResearchOntologyContext } from "./llm/ontology-context";
import { applyReviewSession, createReviewSession, importResearchBundle } from "./review";
import { isAnyPlaceholder, parseScopeSpec, parseTripletSpec } from "./triplet";

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export type RunEnsureTripletResult = {
  nodeCount: number;
  edgeCount: number;
  sessionId: string;
};

/**
 * Runs LLM triplet discovery for the given triplet+scope (e.g. Album:any CONTAINS Track:any, scope Artist:The Who),
 * applies the resulting nodes and edges to the graph, and returns counts. Does not persist; caller must call persistGraphStore().
 */
export async function runEnsureTriplet(
  store: GraphStore,
  tripletSpec: string,
  scopeSpec: string
): Promise<RunEnsureTripletResult> {
  const triplet = parseTripletSpec(tripletSpec);
  const scope = parseScopeSpec(scopeSpec);
  if (!triplet || !scope) {
    throw new Error("Invalid triplet or scope format.");
  }

  const hasAnySubject = isAnyPlaceholder(triplet.subject.name);
  const hasAnyObject = isAnyPlaceholder(triplet.object.name);
  const scopeTargetRef = { ...scope, id: "" };

  const scopeStubId = `triplet-scope-${slug(scope.label + "-" + scope.name)}-${Math.random().toString(36).slice(2, 10)}`;
  const existingScope = await resolveEntityNode(store, scope.label, scope.name);
  const scopeId = existingScope?.id ?? scopeStubId;
  if (!existingScope) {
    await createStubEntity(store, { id: scopeStubId, label: scope.label, name: scope.name });
  }
  const targets = [{ id: scopeId, label: scopeTargetRef.label, name: scopeTargetRef.name }];

  const session = await createReviewSession(store, targets.map((t) => t.id));
  const scopeTarget = { id: session.targets[0].id, label: scopeTargetRef.label, name: scopeTargetRef.name };

  const isAlbumContainsTrack =
    triplet.subject.label === "Album" &&
    triplet.relationship === "CONTAINS" &&
    triplet.object.label === "Track" &&
    hasAnySubject &&
    hasAnyObject;

  let bundle: import("./types").ResearchBundle;
  if (isAlbumContainsTrack) {
    const result = await runAlbumContainsTrackPipeline(session.id, triplet, session.targets, {
      scopeTarget: { id: scopeTarget.id, label: scopeTarget.label, name: scopeTarget.name },
    });
    bundle = result.bundle;
  } else {
    const ontology = buildResearchOntologyContext();
    const extractionInput = {
      type: "triplet" as const,
      sessionId: session.id,
      triplet,
      targets: session.targets,
      options: {
        scopeTarget: { id: scopeTarget.id, label: scopeTarget.label, name: scopeTarget.name },
        hasAnySubject,
        hasAnyObject,
      },
    };
    const extractionResult = await tripletExtractionAdapter.extract(extractionInput, ontology);
    const ir = hasExtractionMetadata(extractionResult) ? extractionResult.ir : extractionResult;
    bundle = irToResearchBundle(ir, session.id, session.targets, ontology, {
      metadata: hasExtractionMetadata(extractionResult) ? extractionResult.metadata : undefined,
      generatedAt: hasExtractionMetadata(extractionResult) ? extractionResult.generatedAt : undefined,
      summary: hasExtractionMetadata(extractionResult) ? extractionResult.summary : undefined,
    });
  }

  const tripletContext =
    !hasAnySubject && session.targets.length >= 2
      ? {
          relationship: triplet.relationship,
          subjectTargetId: session.targets[0].id,
          objectTargetId: session.targets[1].id,
          objectLabel: triplet.object.label,
        }
      : undefined;

  await importResearchBundle(
    store,
    session.id,
    bundle,
    "triplet-exploration",
    tripletContext,
    undefined
  );
  const applied = await applyReviewSession(store, session.id);

  const nodeCount = applied.nodeCandidates?.length ?? 0;
  const edgeCount = applied.edgeCandidates?.length ?? 0;
  return { sessionId: session.id, nodeCount, edgeCount };
}
