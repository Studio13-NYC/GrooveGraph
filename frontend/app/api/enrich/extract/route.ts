import { NextRequest, NextResponse } from "next/server";
import { POST as exploreTripletPost } from "../explore-triplet/route";
import {
  buildResearchOntologyContext,
  buildResearchPacket,
  createReviewSession,
  hasExtractionMetadata,
  importResearchBundle,
  irToResearchBundle,
  isAnyPlaceholder,
  parseScopeSpec,
  parseTripletSpec,
  runExtraction,
  runLlmOnlyPipeline,
} from "@/enrichment";
import {
  createJobId,
  getJob,
  getJobIdForIdempotencyKey,
  setJob,
  setJobIdForIdempotencyKey,
} from "@/enrichment/extraction/job-store";
import { requireAdminResponseFromRequest } from "@/lib/auth";
import { createStubEntity } from "@/lib/graph-mutations";
import { getGraphStore } from "@/load/persist-graph";
import { resolveEntityNode } from "@/lib/exploration";
import type { EnrichmentWorkflowType } from "@/enrichment/types";

export const dynamic = process.env.NEXT_STATIC_EXPORT === "1" ? undefined : "force-dynamic";
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

async function runSpanMentionExtractAsync(
  jobId: string,
  text: string,
  sourceId?: string
): Promise<void> {
  const store = await getGraphStore();
  const targetId = `span-doc-${slug(String(Date.now()))}-${Math.random().toString(36).slice(2, 10)}`;
  await createStubEntity(store, { id: targetId, label: "Artist", name: "Document" });
  const session = await createReviewSession(store, [targetId]);
  const ontology = buildResearchOntologyContext();
  const { result, runMetadata } = await runExtraction(
    { type: "span_mention", text, sourceId },
    ontology
  );
  const ir = hasExtractionMetadata(result) ? result.ir : result;
  const bundle = irToResearchBundle(ir, session.id, session.targets, ontology);
  const updatedSession = await importResearchBundle(
    store,
    session.id,
    bundle,
    "span-mention",
    undefined,
    "span_mention"
  );
  console.log(
    `${LOG_PREFIX} async span_mention job ${jobId} done: mentions=${runMetadata.mentionCount} relations=${runMetadata.relationCount} latencyMs=${runMetadata.latencyMs}`
  );
  setJob(jobId, {
    status: "completed",
    session: updatedSession,
    researchPacket: buildResearchPacket(updatedSession),
    runMetadata,
  });
}

async function runLlmOnlyExtractAsync(
  jobId: string,
  body: { triplet?: string; scope?: string }
): Promise<void> {
  const tripletSpec = typeof body?.triplet === "string" ? body.triplet.trim() : "";
  const triplet = tripletSpec ? parseTripletSpec(tripletSpec) : null;
  if (!triplet) {
    setJob(jobId, { status: "failed", error: "Invalid triplet spec." });
    return;
  }
  const hasAnySubject = isAnyPlaceholder(triplet.subject.name);
  const hasAnyObject = isAnyPlaceholder(triplet.object.name);
  const needsScope = hasAnySubject || hasAnyObject;
  let scopeTarget: { id: string; label: string; name: string } | null = null;
  if (needsScope) {
    const scopeSpec = typeof body?.scope === "string" ? body.scope.trim() : "";
    if (!scopeSpec) {
      setJob(jobId, { status: "failed", error: "Scope required when using any." });
      return;
    }
    const parsed = parseScopeSpec(scopeSpec);
    if (!parsed) {
      setJob(jobId, { status: "failed", error: "Scope could not be parsed." });
      return;
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
  const result = await runLlmOnlyPipeline(session.id, session.targets, { triplet });
  const updatedSession = await importResearchBundle(
    store,
    session.id,
    result.bundle,
    "llm-only",
    undefined,
    "llm_only"
  );
  console.log(`${LOG_PREFIX} async llm_only job ${jobId} done`);
  setJob(jobId, {
    status: "completed",
    session: updatedSession,
    researchPacket: buildResearchPacket(updatedSession),
  });
}

async function runTripletExtractAsync(
  jobId: string,
  body: { triplet?: string; scope?: string }
): Promise<void> {
  const url =
    typeof process !== "undefined" && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/enrich/explore-triplet`
      : "http://localhost:3000/api/enrich/explore-triplet";
  const req = new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ triplet: body?.triplet, scope: body?.scope }),
  });
  try {
    const res = await exploreTripletPost(req);
    const data = (await res.json()) as { session?: unknown; researchPacket?: unknown; error?: string };
    if (res.ok && data.session) {
      setJob(jobId, {
        status: "completed",
        session: data.session,
        researchPacket: data.researchPacket ?? null,
      });
      console.log(`${LOG_PREFIX} async triplet job ${jobId} done`);
    } else {
      setJob(jobId, {
        status: "failed",
        error: data.error ?? (res.statusText || "Triplet exploration failed"),
      });
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} async triplet job ${jobId} failed:`, err);
    setJob(jobId, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function normalizeWorkflowType(value: unknown): EnrichmentWorkflowType | null {
  if (value === "triplet" || value === "span_mention" || value === "llm_only" || value === "hybrid") {
    return value;
  }
  return null;
}

/** Read idempotency key from body or Idempotency-Key header (Phase 8). */
function getIdempotencyKey(request: NextRequest, body: Record<string, unknown>): string | undefined {
  const fromBody = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  const fromHeader = request.headers.get("Idempotency-Key")?.trim() ?? request.headers.get("idempotency-key")?.trim() ?? "";
  return fromBody || fromHeader || undefined;
}

/** If idempotency key matches an existing job, return the appropriate response; else return null. */
function responseForExistingIdempotentJob(existingJobId: string): NextResponse | null {
  const job = getJob(existingJobId);
  if (!job) return null;
  if (job.status === "pending") {
    return NextResponse.json(
      { jobId: existingJobId, status: "accepted", statusUrl: `/api/enrich/jobs/${existingJobId}` },
      { status: 202 }
    );
  }
  if (job.status === "completed") {
    return NextResponse.json({
      jobId: existingJobId,
      status: "completed",
      session: job.session,
      researchPacket: job.researchPacket,
      runMetadata: job.runMetadata,
    });
  }
  return NextResponse.json({
    jobId: existingJobId,
    status: "failed",
    error: job.error,
  });
}

export async function POST(request: NextRequest) {
  const unauth = requireAdminResponseFromRequest(request);
  if (unauth) return unauth;
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

    if (workflowType === "span_mention") {
      const text = typeof body?.text === "string" ? body.text.trim() : "";
      if (!text) {
        return NextResponse.json(
          {
            error:
              "Missing or invalid body. Send { workflowType: \"span_mention\", text: \"Your document or excerpt here.\" }.",
          },
          { status: 400 }
        );
      }
      const asyncMode = body?.async === true;
      let jobId: string | null = asyncMode ? createJobId() : null;
      if (asyncMode && jobId) {
        const idemKey = getIdempotencyKey(request, body as Record<string, unknown>);
        if (idemKey) {
          const existingJobId = getJobIdForIdempotencyKey(idemKey);
          if (existingJobId) {
            const existing = responseForExistingIdempotentJob(existingJobId);
            if (existing) return existing;
          }
        }
        setJob(jobId, { status: "pending" });
        if (idemKey) setJobIdForIdempotencyKey(idemKey, jobId);
        runSpanMentionExtractAsync(jobId, text, body?.sourceId).catch((err) => {
          console.error(`${LOG_PREFIX} async span_mention job ${jobId} failed:`, err);
          setJob(jobId!, { status: "failed", error: err instanceof Error ? err.message : String(err) });
        });
        return NextResponse.json(
          {
            jobId,
            status: "accepted",
            statusUrl: `/api/enrich/jobs/${jobId}`,
          },
          { status: 202 }
        );
      }
      const store = await getGraphStore();
      const targetId = `span-doc-${slug(String(Date.now()))}-${Math.random().toString(36).slice(2, 10)}`;
      await createStubEntity(store, { id: targetId, label: "Artist", name: "Document" });
      const session = await createReviewSession(store, [targetId]);
      const ontology = buildResearchOntologyContext();
      const { result, runMetadata } = await runExtraction(
        { type: "span_mention", text, sourceId: body?.sourceId },
        ontology
      );
      const ir = hasExtractionMetadata(result) ? result.ir : result;
      const bundle = irToResearchBundle(ir, session.id, session.targets, ontology);
      const updatedSession = await importResearchBundle(
        store,
        session.id,
        bundle,
        "span-mention",
        undefined,
        "span_mention"
      );
      console.log(
        `${LOG_PREFIX} span_mention done: mentions=${runMetadata.mentionCount} relations=${runMetadata.relationCount} latencyMs=${runMetadata.latencyMs}`
      );
      return NextResponse.json({
        status: "ok",
        session: updatedSession,
        researchPacket: buildResearchPacket(updatedSession),
        runMetadata,
      });
    }

    if (workflowType === "triplet") {
      const tripletSpec = typeof body?.triplet === "string" ? body.triplet.trim() : "";
      if (!tripletSpec) {
        return NextResponse.json(
          { error: "Missing or invalid body. Send { triplet: \"...\" }." },
          { status: 400 }
        );
      }
      const asyncMode = body?.async === true;
      let jobId: string | null = asyncMode ? createJobId() : null;
      if (asyncMode && jobId) {
        const idemKey = getIdempotencyKey(request, body as Record<string, unknown>);
        if (idemKey) {
          const existingJobId = getJobIdForIdempotencyKey(idemKey);
          if (existingJobId) {
            const existing = responseForExistingIdempotentJob(existingJobId);
            if (existing) return existing;
          }
        }
        setJob(jobId, { status: "pending" });
        if (idemKey) setJobIdForIdempotencyKey(idemKey, jobId);
        runTripletExtractAsync(jobId, { triplet: body?.triplet, scope: body?.scope }).catch((err) => {
          console.error(`${LOG_PREFIX} async triplet job ${jobId} failed:`, err);
          setJob(jobId!, { status: "failed", error: err instanceof Error ? err.message : String(err) });
        });
        return NextResponse.json(
          { jobId, status: "accepted", statusUrl: `/api/enrich/jobs/${jobId}` },
          { status: 202 }
        );
      }
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

      const asyncMode = body?.async === true;
      let jobId: string | null = asyncMode ? createJobId() : null;
      if (asyncMode && jobId) {
        const idemKey = getIdempotencyKey(request, body as Record<string, unknown>);
        if (idemKey) {
          const existingJobId = getJobIdForIdempotencyKey(idemKey);
          if (existingJobId) {
            const existing = responseForExistingIdempotentJob(existingJobId);
            if (existing) return existing;
          }
        }
        setJob(jobId, { status: "pending" });
        if (idemKey) setJobIdForIdempotencyKey(idemKey, jobId);
        runLlmOnlyExtractAsync(jobId, { triplet: body?.triplet, scope: body?.scope }).catch((err) => {
          console.error(`${LOG_PREFIX} async llm_only job ${jobId} failed:`, err);
          setJob(jobId!, { status: "failed", error: err instanceof Error ? err.message : String(err) });
        });
        return NextResponse.json(
          { jobId, status: "accepted", statusUrl: `/api/enrich/jobs/${jobId}` },
          { status: 202 }
        );
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

      const result = await runLlmOnlyPipeline(session.id, session.targets, { triplet });
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
        error: `workflowType '${workflowType}' is not implemented yet. Use workflowType: 'triplet', 'span_mention', or 'llm_only'.`,
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
