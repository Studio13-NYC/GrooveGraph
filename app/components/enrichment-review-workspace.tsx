"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X, Zap } from "lucide-react";
import { EntitySearchControls } from "./entity-search-controls";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import type { QueryResultPayload } from "@/lib/exploration-types";
import {
  ENTITY_LABELS,
  getEntityDisplayName,
  type EntityLabel,
} from "@/lib/entity-config";
import { RELATIONSHIP_TYPES, type RelationshipType } from "@/lib/relationship-config";
import { isAnyPlaceholder, normalizeAnyPlaceholder } from "@/enrichment/triplet";
import type {
  CandidateEdge,
  CandidateEvidence,
  CandidateNode,
  CandidatePropertyChange,
  EnrichmentReviewSession,
  ReviewDecision,
  ReviewDecisionStatus,
  ReviewTargetEntity,
  SourceRunReport,
} from "@/enrichment/types";

type SearchResponse = {
  result: QueryResultPayload;
};

type SessionResponse = {
  session: EnrichmentReviewSession;
};

type DraftSubsetTarget = ReviewTargetEntity & {
  isDraft?: boolean;
};

function SourceStatusBadge({
  value,
}: {
  value: SourceRunReport["entries"][number]["status"];
}) {
  const tone =
    value === "checked_used"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
      : value === "checked_no_result"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
        : "bg-slate-100 text-slate-700 dark:bg-slate-900/50 dark:text-slate-200";
  return (
    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

function SourceRouteBadge({
  value,
}: {
  value?: SourceRunReport["entries"][number]["effectiveRoute"];
}) {
  if (!value) {
    return (
      <span className="rounded-full border border-[hsl(var(--border))] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        route pending
      </span>
    );
  }

  const tone =
    value === "api"
      ? "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-200"
      : "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200";

  return (
    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
      {value === "api" ? "official api" : "firecrawl fallback"}
    </span>
  );
}

function CandidateStatusBadge({
  value,
}: {
  value: string;
}) {
  return (
    <span className="rounded-full border border-[hsl(var(--border))] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
      {value.replace(/_/g, " ")}
    </span>
  );
}

function ConfidenceBadge({
  value,
}: {
  value: string;
}) {
  const tone =
    value === "high"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
      : value === "medium"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
        : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-200";
  return (
    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
      {value}
    </span>
  );
}

function ProvenanceList({
  items,
}: {
  items: Array<{
    source_id: string;
    source_name: string;
    url: string;
    excerpt?: string;
    retrieved_at: string;
  }>;
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={`${item.source_id}:${item.url}`} className="rounded-md border border-[hsl(var(--border))] p-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-[hsl(var(--foreground))]">{item.source_name}</span>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="text-[hsl(var(--primary))] underline underline-offset-2"
            >
              source
            </a>
            <span className="text-[hsl(var(--muted-foreground))]">{new Date(item.retrieved_at).toLocaleString()}</span>
          </div>
          {item.excerpt && (
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{item.excerpt}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function EvidenceList({
  items,
}: {
  items: CandidateEvidence[];
}) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={`${item.evidenceId ?? index}:${item.source_id}:${item.url}`}
          className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.35] p-2"
        >
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-[hsl(var(--foreground))]">{item.source_name}</span>
            <ConfidenceBadge value={item.confidence} />
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="text-[hsl(var(--primary))] underline underline-offset-2"
            >
              evidence
            </a>
          </div>
          {item.excerpt && (
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{item.excerpt}</p>
          )}
          {item.notes && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{item.notes}</p>}
        </div>
      ))}
    </div>
  );
}

export function EnrichmentReviewWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialEntityType = (searchParams.get("entityType") as EntityLabel) || "Artist";
  const initialSessionId = searchParams.get("session") ?? "";
  const preselectedTargetId = searchParams.get("targetId") ?? "";
  const preselectedTargetLabel = searchParams.get("targetLabel") ?? "";
  const preselectedTargetName = searchParams.get("targetName") ?? "";

  const [entityType, setEntityType] = useState<EntityLabel>(initialEntityType);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<QueryResultPayload | null>(null);
  const [subset, setSubset] = useState<DraftSubsetTarget[]>([]);
  const [missingTarget, setMissingTarget] = useState<DraftSubsetTarget | null>(null);
  const [session, setSession] = useState<EnrichmentReviewSession | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [tripletSubjectLabel, setTripletSubjectLabel] = useState<EntityLabel>("Artist");
  const [tripletSubjectName, setTripletSubjectName] = useState("");
  const [tripletRelationship, setTripletRelationship] = useState<RelationshipType>("PLAYED_INSTRUMENT");
  const [tripletObjectLabel, setTripletObjectLabel] = useState<EntityLabel>("Instrument");
  const [tripletObjectName, setTripletObjectName] = useState("");
  const [tripletScopeLabel, setTripletScopeLabel] = useState<EntityLabel>("Artist");
  const [tripletScopeName, setTripletScopeName] = useState("");
  const [tripletWorking, setTripletWorking] = useState(false);

  const syncUrl = useCallback(
    (nextSessionId?: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextSessionId) {
        params.set("session", nextSessionId);
      } else {
        params.delete("session");
      }
      router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams]
  );

  const loadSession = useCallback(async (sessionId: string) => {
    setWorking(true);
    try {
      const response = await fetch(`/api/enrich/review-session/${sessionId}`);
      const data = (await response.json()) as SessionResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to load review session");
      }
      setSession(data.session);
      setSubset(data.session.targets);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load review session");
    } finally {
      setWorking(false);
    }
  }, []);

  useEffect(() => {
    if (initialSessionId) {
      void loadSession(initialSessionId);
    }
  }, [initialSessionId, loadSession]);

  useEffect(() => {
    if (!preselectedTargetId || !preselectedTargetLabel || !preselectedTargetName) return;
    setSubset((current) =>
      current.some((item) => item.id === preselectedTargetId)
        ? current
        : [
            ...current,
            {
              id: preselectedTargetId,
              label: preselectedTargetLabel,
              name: preselectedTargetName,
            },
          ]
    );
    setMessage("Target added to the subset. Approve the subset to start the enrichment run.");
  }, [preselectedTargetId, preselectedTargetLabel, preselectedTargetName]);

  async function handleSearch() {
    setSearching(true);
    setSearchError(null);
    setMissingTarget(null);
    setMessage(null);
    try {
      const response = await fetch("/api/query-artist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, query }),
      });
      const data = (await response.json()) as SearchResponse & { error?: string };
      if (!response.ok) {
        if (response.status === 404) {
          setMissingTarget({
            id: `draft:${entityType}:${query.trim().toLowerCase()}`,
            label: entityType,
            name: query.trim(),
            isDraft: true,
          });
        }
        throw new Error(data.error || "Search failed");
      }
      setSearchResult(data.result);
    } catch (error) {
      setSearchResult(null);
      setSearchError(error instanceof Error ? error.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  function addToSubset() {
    if (!searchResult) return;
    setSubset((current) =>
      current.some((item) => item.id === searchResult.id)
        ? current
        : [
            ...current,
            {
              id: searchResult.id,
              label: searchResult.entityType,
              name: searchResult.name,
            },
          ]
    );
  }

  function addMissingTargetToSubset() {
    if (!missingTarget) return;
    setSubset((current) =>
      current.some(
        (item) =>
          item.name.toLowerCase() === missingTarget.name.toLowerCase() &&
          item.label === missingTarget.label
      )
        ? current
        : [...current, missingTarget]
    );
    setMissingTarget(null);
    setMessage("New entity added to the subset. Approve the subset to create it and start enrichment.");
  }

  function removeFromSubset(targetId: string) {
    setSubset((current) => current.filter((item) => item.id !== targetId));
  }

  async function createSession() {
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch("/api/enrich/review-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetIds: subset.filter((item) => !item.isDraft).map((item) => item.id),
          targets: subset.map((item) => ({
            id: item.isDraft ? item.id : item.id,
            label: item.label,
            name: item.name,
          })),
        }),
      });
      const data = (await response.json()) as SessionResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to create review session");
      }
      setSession(data.session);
      setMessage(
        data.session.status === "ready_for_review"
          ? "Subset approved. Automated staged enrichment has started and the review session is ready."
          : "Subset approved. Automated staged enrichment has started."
      );
      syncUrl(data.session.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create review session");
    } finally {
      setWorking(false);
    }
  }

  function buildTripletSpec(): string {
    const sub = normalizeAnyPlaceholder(tripletSubjectName);
    const obj = normalizeAnyPlaceholder(tripletObjectName);
    if (!sub || !obj) return "";
    return `${tripletSubjectLabel}:${sub} ${tripletRelationship} ${tripletObjectLabel}:${obj}`;
  }

  async function createTripletSession() {
    const sub = normalizeAnyPlaceholder(tripletSubjectName);
    const obj = normalizeAnyPlaceholder(tripletObjectName);
    if (!sub || !obj) {
      setMessage("Enter subject and object names for the triplet (or use \"any\" for expansion).");
      return;
    }
    const needsScope = isAnyPlaceholder(tripletSubjectName) || isAnyPlaceholder(tripletObjectName);
    if (needsScope && !tripletScopeName.trim()) {
      setMessage("When using \"any\" for subject or object, scope is required (e.g. Paul Weller).");
      return;
    }
    const spec = buildTripletSpec();
    const scope = needsScope ? `${tripletScopeLabel}:${tripletScopeName.trim()}` : undefined;
    setTripletWorking(true);
    setMessage(null);
    try {
      const response = await fetch("/api/enrich/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowType: "triplet", triplet: spec, ...(scope ? { scope } : {}) }),
      });
      const data = (await response.json()) as SessionResponse & { error?: string; triplet?: unknown };
      if (!response.ok) {
        throw new Error(data.error || "Triplet exploration failed");
      }
      setSession(data.session);
      setSubset(data.session.targets);
      setMessage("Triplet exploration complete. Review the candidates and apply to the graph.");
      syncUrl(data.session.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Triplet exploration failed");
    } finally {
      setTripletWorking(false);
    }
  }

  async function updateDecision(decision: ReviewDecision) {
    if (!session) return;
    setWorking(true);
    try {
      const response = await fetch(`/api/enrich/review-session/${session.id}/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions: [decision] }),
      });
      const data = (await response.json()) as { session: EnrichmentReviewSession; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to update review decision");
      }
      setSession(data.session);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update review decision");
    } finally {
      setWorking(false);
    }
  }

  async function applySession() {
    if (!session) return;
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/enrich/review-session/${session.id}/apply`, {
        method: "POST",
      });
      const data = (await response.json()) as { session: EnrichmentReviewSession; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to apply review session");
      }
      setSession(data.session);
      setMessage("Approved candidates were applied to Neo4j.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to apply review session");
    } finally {
      setWorking(false);
    }
  }

  const reviewStats = useMemo(() => {
    const propertyCount = session?.propertyChanges.length ?? 0;
    const nodeCount = session?.nodeCandidates.length ?? 0;
    const edgeCount = session?.edgeCandidates.length ?? 0;
    const rejectedCount =
      (session?.propertyChanges.filter((item) => item.reviewStatus === "rejected").length ?? 0) +
      (session?.nodeCandidates.filter((item) => item.reviewStatus === "rejected").length ?? 0) +
      (session?.edgeCandidates.filter((item) => item.reviewStatus === "rejected").length ?? 0);
    return { propertyCount, nodeCount, edgeCount, rejectedCount };
  }, [session]);

  const synthesisSummary = useMemo(() => {
    if (!session) return null;
    const evidenceRecordCount =
      session.importMetadata?.evidenceRecordCount ??
      session.researchPacket?.evidence.reduce((sum, target) => sum + target.records.length, 0) ??
      0;
    return {
      workflowType: session.importMetadata?.workflowType ?? "hybrid",
      generator: session.importMetadata?.generator ?? "manual",
      provider: session.importMetadata?.provider ?? null,
      model: session.importMetadata?.model ?? null,
      promptVersion: session.importMetadata?.promptVersion ?? null,
      evidenceRecordCount,
      sourceCount: session.importMetadata?.sourceCount ?? null,
      notes: session.importMetadata?.notes ?? null,
    };
  }, [session]);

  function renderDecisionButtons(
    candidateType: ReviewDecision["candidateType"],
    candidateId: string,
    reviewStatus: ReviewDecisionStatus,
    matchStatus?: string
  ) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {matchStatus === "ambiguous" && reviewStatus !== "approved" && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => updateDecision({ candidateType, candidateId, reviewStatus: "approved" })}
          >
            Approve
          </Button>
        )}
        {reviewStatus === "rejected" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateDecision({ candidateType, candidateId, reviewStatus: "pending" })}
          >
            Restore
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateDecision({ candidateType, candidateId, reviewStatus: "rejected" })}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Reject
          </Button>
        )}
      </div>
    );
  }

  function renderPropertyChange(change: CandidatePropertyChange) {
    return (
      <div key={change.candidateId} className="rounded-lg border border-[hsl(var(--border))] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-[hsl(var(--foreground))]">{change.key}</span>
              <CandidateStatusBadge value={change.reviewStatus} />
              <ConfidenceBadge value={change.confidence} />
            </div>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Target: {session?.targets.find((item) => item.id === change.targetId)?.name ?? change.targetId}
            </p>
            {change.previousValue !== undefined && (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Existing value: {String(change.previousValue)}
              </p>
            )}
            <p className="text-sm">{String(change.value)}</p>
            {change.notes && <p className="text-xs text-[hsl(var(--muted-foreground))]">{change.notes}</p>}
            {change.justification && (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Why: {change.justification}</p>
            )}
          </div>
          {renderDecisionButtons("property", change.candidateId, change.reviewStatus)}
        </div>
        <div className="mt-3">
          <ProvenanceList items={change.provenance} />
        </div>
        {change.evidence && change.evidence.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Supporting evidence
            </p>
            <EvidenceList items={change.evidence} />
          </div>
        )}
      </div>
    );
  }

  function renderNodeCandidate(candidate: CandidateNode) {
    return (
      <div key={candidate.candidateId} className="rounded-lg border border-[hsl(var(--border))] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-[hsl(var(--foreground))]">
                {getEntityDisplayName(candidate.label)}: {candidate.name}
              </span>
              <CandidateStatusBadge value={candidate.reviewStatus} />
              <CandidateStatusBadge value={candidate.matchStatus} />
              <ConfidenceBadge value={candidate.confidence} />
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Canonical key: {candidate.canonicalKey}</p>
            {candidate.matchedNodeId && (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Matched graph node: {candidate.matchedNodeId}</p>
            )}
            <pre className="overflow-x-auto rounded-md bg-[hsl(var(--muted))] p-3 text-xs">
              {JSON.stringify(candidate.properties, null, 2)}
            </pre>
            {candidate.notes && <p className="text-xs text-[hsl(var(--muted-foreground))]">{candidate.notes}</p>}
            {candidate.justification && (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Why: {candidate.justification}</p>
            )}
          </div>
          {renderDecisionButtons("node", candidate.candidateId, candidate.reviewStatus, candidate.matchStatus)}
        </div>
        <div className="mt-3">
          <ProvenanceList items={candidate.provenance} />
        </div>
        {candidate.evidence && candidate.evidence.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Supporting evidence
            </p>
            <EvidenceList items={candidate.evidence} />
          </div>
        )}
      </div>
    );
  }

  function renderEdgeCandidate(candidate: CandidateEdge) {
    return (
      <div key={candidate.candidateId} className="rounded-lg border border-[hsl(var(--border))] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-[hsl(var(--foreground))]">{candidate.type}</span>
              <CandidateStatusBadge value={candidate.reviewStatus} />
              <CandidateStatusBadge value={candidate.matchStatus} />
              <ConfidenceBadge value={candidate.confidence} />
            </div>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {candidate.fromRef.kind}:{candidate.fromRef.id} → {candidate.toRef.kind}:{candidate.toRef.id}
            </p>
            {candidate.matchedEdgeId && (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Matched graph relationship: {candidate.matchedEdgeId}
              </p>
            )}
            {candidate.properties && Object.keys(candidate.properties).length > 0 && (
              <pre className="overflow-x-auto rounded-md bg-[hsl(var(--muted))] p-3 text-xs">
                {JSON.stringify(candidate.properties, null, 2)}
              </pre>
            )}
            {candidate.notes && <p className="text-xs text-[hsl(var(--muted-foreground))]">{candidate.notes}</p>}
            {candidate.justification && (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Why: {candidate.justification}</p>
            )}
          </div>
          {renderDecisionButtons("edge", candidate.candidateId, candidate.reviewStatus, candidate.matchStatus)}
        </div>
        <div className="mt-3">
          <ProvenanceList items={candidate.provenance} />
        </div>
        {candidate.evidence && candidate.evidence.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Supporting evidence
            </p>
            <EvidenceList items={candidate.evidence} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              Enrichment review
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Curate staged enrichment before anything touches the graph.
            </h1>
            <p className="max-w-4xl text-sm text-[hsl(var(--muted-foreground))]">
              Search for entities, build and approve the subset, automatically run all in-scope sources, review the
              staged candidates, and then apply only the remaining deduped candidates to Neo4j.
            </p>
          </div>

          <EntitySearchControls
            entityType={entityType}
            query={query}
            onEntityTypeChange={setEntityType}
            onQueryChange={setQuery}
            onSubmit={() => void handleSearch()}
            loading={searching}
            buttonLabel="Find entity"
          />

          {searchError && <p className="text-sm text-red-600 dark:text-red-300">{searchError}</p>}

          {searchResult && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                      <Search className="h-3.5 w-3.5" />
                      <span>{getEntityDisplayName(searchResult.entityType)}</span>
                    </div>
                    <p className="text-lg font-semibold">{searchResult.name}</p>
                    <p className="max-w-3xl text-sm text-[hsl(var(--muted-foreground))]">{searchResult.summary}</p>
                  </div>
                  <Button onClick={addToSubset}>Add to subset</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {missingTarget && !searchResult && (
            <Card className="border-dashed">
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                      <Search className="h-3.5 w-3.5" />
                      <span>{getEntityDisplayName(missingTarget.label)}</span>
                      <span className="rounded-full border border-[hsl(var(--border))] px-2 py-1 text-[10px] font-medium">
                        new entity
                      </span>
                    </div>
                    <p className="text-lg font-semibold">{missingTarget.name}</p>
                    <p className="max-w-3xl text-sm text-[hsl(var(--muted-foreground))]">
                      No existing graph node matched this search. Add it to the subset to create a stub node and run
                      the normal enrichment workflow against it.
                    </p>
                  </div>
                  <Button onClick={addMissingTargetToSubset}>Add new entity to subset</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="mt-6 border-t border-[hsl(var(--border))] pt-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
              Explore by triplet
            </p>
            <p className="mb-3 max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">
              Choose subject and object entity types, relationship, and names. The LLM will return all information that
              fits (e.g. guitars Paul Weller plays).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={tripletSubjectLabel}
                onChange={(e) => setTripletSubjectLabel(e.target.value as EntityLabel)}
                className="flex h-10 min-w-[8rem] rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                aria-label="Subject entity type"
              >
                {ENTITY_LABELS.map((label) => (
                  <option key={label} value={label}>
                    {getEntityDisplayName(label)}
                  </option>
                ))}
              </select>
              <Input
                placeholder="e.g. Paul Weller, any"
                value={tripletSubjectName}
                onChange={(e) => setTripletSubjectName(e.target.value)}
                className="min-w-[10rem] max-w-[14rem]"
                onKeyDown={(e) => e.key === "Enter" && void createTripletSession()}
              />
              <select
                value={tripletRelationship}
                onChange={(e) => setTripletRelationship(e.target.value as RelationshipType)}
                className="flex h-10 min-w-[11rem] rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                aria-label="Relationship type"
              >
                {RELATIONSHIP_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                value={tripletObjectLabel}
                onChange={(e) => setTripletObjectLabel(e.target.value as EntityLabel)}
                className="flex h-10 min-w-[8rem] rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                aria-label="Object entity type"
              >
                {ENTITY_LABELS.map((label) => (
                  <option key={label} value={label}>
                    {getEntityDisplayName(label)}
                  </option>
                ))}
              </select>
              <Input
                placeholder="e.g. guitar, any"
                value={tripletObjectName}
                onChange={(e) => setTripletObjectName(e.target.value)}
                className="min-w-[10rem] max-w-[14rem]"
                onKeyDown={(e) => e.key === "Enter" && void createTripletSession()}
              />
              <select
                value={tripletScopeLabel}
                onChange={(e) => setTripletScopeLabel(e.target.value as EntityLabel)}
                className="flex h-10 min-w-[8rem] rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                aria-label="Scope entity type"
              >
                {ENTITY_LABELS.map((label) => (
                  <option key={label} value={label}>
                    {getEntityDisplayName(label)}
                  </option>
                ))}
              </select>
              <Input
                placeholder="e.g. Paul Weller"
                value={tripletScopeName}
                onChange={(e) => setTripletScopeName(e.target.value)}
                className="min-w-[10rem] max-w-[14rem]"
                onKeyDown={(e) => e.key === "Enter" && void createTripletSession()}
              />
              <Button
                onClick={() => void createTripletSession()}
                disabled={
                  tripletWorking ||
                  !tripletSubjectName.trim() ||
                  !tripletObjectName.trim() ||
                  ((isAnyPlaceholder(tripletSubjectName) || isAnyPlaceholder(tripletObjectName)) && !tripletScopeName.trim())
                }
              >
                {tripletWorking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                Explore triplet
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Approved subset</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subset.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Add one or more entities to the subset before starting a review session.
              </p>
            ) : (
              <ul className="space-y-2">
                {subset.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--border))] px-3 py-2"
                  >
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {getEntityDisplayName(item.label)}
                        {item.isDraft ? " · will be created during enrichment" : ""}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => removeFromSubset(item.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {(session?.importMetadata?.workflowType ?? null) === "triplet" ||
            session?.importMetadata?.importedFrom === "triplet-exploration" ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Triplet session is ready. Review staged candidates below and apply when satisfied.
              </p>
            ) : (
              <Button onClick={createSession} disabled={subset.length === 0 || working}>
                {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Approve subset and create session
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Review session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!session ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                No review session yet. Once the subset is approved, the app starts the full automatic enrichment run
                across all in-scope sources and stages the results for review.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                    <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Status</p>
                    <p className="mt-2 font-semibold">{session.status.replace(/_/g, " ")}</p>
                  </div>
                  <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                    <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Properties</p>
                    <p className="mt-2 font-semibold">{reviewStats.propertyCount}</p>
                  </div>
                  <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                    <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Nodes</p>
                    <p className="mt-2 font-semibold">{reviewStats.nodeCount}</p>
                  </div>
                  <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                    <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Rejected</p>
                    <p className="mt-2 font-semibold">{reviewStats.rejectedCount}</p>
                  </div>
                </div>

                {synthesisSummary && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                      <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Workflow</p>
                      <p className="mt-2 font-semibold">{synthesisSummary.workflowType.replace(/_/g, " ")}</p>
                    </div>
                    <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                      <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Synthesis</p>
                      <p className="mt-2 font-semibold">{synthesisSummary.generator.replace(/_/g, " ")}</p>
                    </div>
                    <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                      <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Evidence</p>
                      <p className="mt-2 font-semibold">{synthesisSummary.evidenceRecordCount}</p>
                    </div>
                    <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                      <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Provider</p>
                      <p className="mt-2 font-semibold">{synthesisSummary.provider ?? "not configured"}</p>
                    </div>
                    <div className="rounded-lg border border-[hsl(var(--border))] p-3 sm:col-span-2 lg:col-span-1">
                      <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Model</p>
                      <p className="mt-2 font-semibold">{synthesisSummary.model ?? "fallback"}</p>
                    </div>
                  </div>
                )}

                {synthesisSummary?.notes && (
                  <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.35] p-3">
                    <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                      Synthesis notes
                    </p>
                    <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{synthesisSummary.notes}</p>
                    {synthesisSummary.promptVersion && (
                      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                        Prompt version: {synthesisSummary.promptVersion}
                      </p>
                    )}
                    {typeof synthesisSummary.sourceCount === "number" && (
                      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                        In-scope sources considered: {synthesisSummary.sourceCount}
                      </p>
                    )}
                  </div>
                )}

                {session.sourceReport && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Source coverage for this run</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          The registry contains {session.sourceReport.totalSources} sources. {session.sourceReport.inScopeCount} are
                          in scope for this subset, {session.sourceReport.checkedCount} were checked automatically,{" "}
                          {session.sourceReport.usedCount} produced staged evidence, and{" "}
                          {session.sourceReport.checkedCount - session.sourceReport.usedCount} returned no usable evidence.
                        </p>
                      </div>
                      {session.sourceReport.checkedCount < session.sourceReport.inScopeCount && (
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                          Some in-scope sources were not attempted. This run is not yet exhaustive.
                        </p>
                      )}
                    </div>
                    <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-[hsl(var(--border))] p-3">
                      {session.sourceReport.entries
                        .filter((entry) => entry.applicableTargetIds.length > 0)
                        .map((entry) => (
                        <div
                          key={entry.id}
                          className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-[hsl(var(--border))] p-3"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{entry.name}</span>
                              <SourceStatusBadge value={entry.status} />
                              <SourceRouteBadge value={entry.effectiveRoute} />
                            </div>
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">
                              {entry.type} via {entry.method}
                            </p>
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">
                              Selected route:{" "}
                              {entry.effectiveRoute === "api"
                                ? "official API"
                                : entry.effectiveRoute === "firecrawl"
                                  ? "Firecrawl-backed fallback"
                                  : "not attempted"}
                            </p>
                            <p className="text-xs text-[hsl(var(--muted-foreground))]">
                              Covers: {entry.entityTypes.join(", ")}
                            </p>
                          </div>
                          {entry.baseUrl && (
                            <a
                              href={entry.baseUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-[hsl(var(--primary))] underline underline-offset-2"
                            >
                              source site
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Button variant="outline" onClick={() => session && syncUrl(session.id)}>
                  Keep this session URL
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {message && (
        <Card className="border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20">
          <CardContent className="pt-6">
            <p className="text-sm text-amber-900 dark:text-amber-100">{message}</p>
          </CardContent>
        </Card>
      )}

      {session && session.status !== "ready_for_import" && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Staged candidates</h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Reject anything you do not want persisted. Ambiguous items require explicit approval.
              </p>
            </div>
            <Button onClick={applySession} disabled={working || session.status === "applied"}>
              {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {session.status === "applied" ? "Applied" : "Apply remaining candidates"}
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Property changes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {session.propertyChanges.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">No property changes staged.</p>
              ) : (
                session.propertyChanges.map(renderPropertyChange)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Node candidates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {session.nodeCandidates.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">No node candidates staged.</p>
              ) : (
                session.nodeCandidates.map(renderNodeCandidate)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Relationship candidates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {session.edgeCandidates.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">No relationship candidates staged.</p>
              ) : (
                session.edgeCandidates.map(renderEdgeCandidate)
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
