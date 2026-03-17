import { createHash, randomUUID } from "node:crypto";
import { GraphEdge } from "../domain/GraphEdge";
import { GraphNode } from "../domain/GraphNode";
import { getEntityDisplayPropertyKeys, getNodeDisplayName } from "../lib/entity-config";
import { isRelationshipType } from "../lib/relationship-config";
import {
  coerceArtistPersonIdentity,
  getPrimaryEntityLabel,
  normalizeEntityLabels,
} from "../lib/entity-identity";
import type { GraphStore } from "../store/types";
import { previewEnrichmentPipeline } from "./pipeline";
import type { EnrichmentPreviewResult } from "./pipeline";
import { getEffectiveSourceRoute } from "./adapters/source-access";
import { buildResearchOntologyContext, ENRICHMENT_PROMPT_VERSION } from "./llm/ontology-context";
import { isEnrichmentLlmConfigured, synthesizeResearchBundle } from "./llm/index";
import { validateResearchBundle } from "./llm/validate-bundle";
import {
  isLlmOnlyPipelineConfigured,
  runLlmOnlyPipeline,
  useLlmOnlyPipeline,
} from "./pipelines/llm-only";
import { getAllSources, getSourceExecutionMode } from "./sources/registry";
import { readReviewSession, writeReviewSession } from "./review-session-store";
import type {
  CandidateEdge,
  CandidateEvidence,
  CandidateNode,
  CandidateNodeReference,
  CandidatePropertyChange,
  CandidateProvenance,
  EnrichmentWorkflowType,
  EnrichmentReviewSession,
  ResearchPacket,
  ResearchBundle,
  ReviewDecision,
  ReviewDecisionStatus,
  ReviewTargetEntity,
  SourceRunEntry,
  SourceRunReport,
  SourceMetadata,
  VerifiedEnrichmentRecord,
} from "./types";

class ReviewGraphNode extends GraphNode {
  constructor(
    id: string,
    labels: string[],
    properties: Record<string, unknown>,
    meta?: Record<string, unknown>
  ) {
    super(id, labels, properties, meta);
  }
}

class ReviewGraphEdge extends GraphEdge {
  constructor(
    id: string,
    type: string,
    fromNodeId: string,
    toNodeId: string,
    properties: Record<string, unknown>,
    meta?: Record<string, unknown>
  ) {
    super(id, type, fromNodeId, toNodeId, properties, meta);
  }
}

type CandidateKind = "property" | "node" | "edge";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeValue(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return normalizeValue(value).replace(/\s+/g, "-").replace(/-+/g, "-");
}

function hashValue(...parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
}

function sanitizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

function sanitizeString(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function sanitizeEvidenceList(value: unknown, fallbackConfidence: "high" | "medium" | "low"): CandidateEvidence[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = sanitizeRecord(item);
      const source = sanitizeSourceMetadata(record);
      if (!source.url) return null;
      return {
        ...source,
        confidence: isConfidence(record.confidence) ? record.confidence : fallbackConfidence,
        ...(sanitizeString(record.evidenceId) ? { evidenceId: sanitizeString(record.evidenceId) } : {}),
        ...(sanitizeString(record.notes) ? { notes: sanitizeString(record.notes) } : {}),
        ...(record.structuredFacts && typeof record.structuredFacts === "object" && !Array.isArray(record.structuredFacts)
          ? { structuredFacts: sanitizeRecord(record.structuredFacts) }
          : {}),
      };
    })
    .filter((item): item is CandidateEvidence => item !== null);
}

function normalizeCandidateLabels(label: string, labels?: string[]): { label: string; labels: string[] } {
  const normalized = coerceArtistPersonIdentity(normalizeEntityLabels([label, ...(labels ?? [])].filter(Boolean)));
  return {
    label: getPrimaryEntityLabel(normalized),
    labels: normalized,
  };
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:!?]+$/g, "").trim();
}

function isConfidence(value: unknown): value is "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low";
}

function isReviewDecision(value: unknown): value is ReviewDecisionStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

function dedupeProvenance(items: CandidateProvenance[]): CandidateProvenance[] {
  return Array.from(
    new Map(
      items.map((item) => [
        `${item.source_id}:${item.url}:${item.retrieved_at}:${item.excerpt ?? ""}`,
        item,
      ])
    ).values()
  );
}

function sanitizeSourceMetadata(value: unknown): SourceMetadata {
  const record = sanitizeRecord(value);
  return {
    source_id: sanitizeString(record.source_id, "web"),
    source_name: sanitizeString(record.source_name, "Web"),
    source_type:
      record.source_type === "api" ||
      record.source_type === "scrape" ||
      record.source_type === "bulk" ||
      record.source_type === "web_search"
        ? record.source_type
        : "web_search",
    url: sanitizeString(record.url),
    retrieved_at: sanitizeString(record.retrieved_at, nowIso()),
    ...(sanitizeString(record.excerpt) ? { excerpt: sanitizeString(record.excerpt) } : {}),
    ...(sanitizeString(record.citation) ? { citation: sanitizeString(record.citation) } : {}),
  };
}

function sanitizeProvenanceList(value: unknown, fallbackConfidence: "high" | "medium" | "low"): CandidateProvenance[] {
  if (!Array.isArray(value)) return [];
  return dedupeProvenance(
    value
      .map((item) => {
        const record = sanitizeRecord(item);
        const source = sanitizeSourceMetadata(record);
        return {
          ...source,
          confidence: isConfidence(record.confidence) ? record.confidence : fallbackConfidence,
          ...(sanitizeString(record.notes) ? { notes: sanitizeString(record.notes) } : {}),
        };
      })
      .filter((item) => Boolean(item.url))
  );
}

function deriveCanonicalKey(label: string, name: string, externalIds?: Record<string, string>): string {
  const externalIdentity = externalIds
    ? Object.entries(externalIds)
        .filter(([, value]) => value.trim())
        .sort(([left], [right]) => left.localeCompare(right))[0]
    : undefined;
  if (externalIdentity) {
    return `${label.toLowerCase()}:${externalIdentity[0]}:${externalIdentity[1]}`;
  }
  return `${label.toLowerCase()}:${normalizeValue(name)}`;
}

function buildNodeId(label: string, canonicalKey: string): string {
  return `${label.toLowerCase()}-${slugify(canonicalKey).slice(0, 40) || hashValue(label, canonicalKey)}`;
}

function buildEdgeId(type: string, fromNodeId: string, toNodeId: string): string {
  return `${type.toLowerCase()}-${hashValue(type, fromNodeId, toNodeId)}`;
}

function buildCandidateMeta(
  sessionId: string,
  candidateId: string,
  provenance: CandidateProvenance[],
  existingMeta?: Record<string, unknown>
): Record<string, unknown> {
  const primary = provenance[0];
  const prior = sanitizeRecord(existingMeta);
  const priorProvenance = Array.isArray(prior.enrichment_provenance)
    ? (prior.enrichment_provenance as CandidateProvenance[])
    : [];
  return {
    ...prior,
    ...(primary
      ? {
          enrichment_source: primary.source_id,
          enrichment_url: primary.url,
          enrichment_date: primary.retrieved_at,
          ...(primary.excerpt ? { enrichment_excerpt: primary.excerpt } : {}),
          enrichment_confidence: primary.confidence,
        }
      : {}),
    enrichment_review_session_id: sessionId,
    enrichment_review_candidate_id: candidateId,
    enrichment_provenance: dedupeProvenance([...priorProvenance, ...provenance]),
  };
}

/** Like buildCandidateMeta but adds proposed: true, proposedAt, proposedBy for user-submitted enrichment. */
function buildCandidateMetaProposed(
  sessionId: string,
  candidateId: string,
  provenance: CandidateProvenance[],
  existingMeta?: Record<string, unknown>,
  options?: { proposedBy?: string }
): Record<string, unknown> {
  const base = buildCandidateMeta(sessionId, candidateId, provenance, existingMeta);
  return {
    ...base,
    proposed: true,
    proposedAt: nowIso(),
    proposedBy: options?.proposedBy ?? "anonymous",
  };
}

async function exactLabelMatchByDisplay(
  store: GraphStore,
  label: string,
  names: string[]
): Promise<GraphNode | null> {
  const candidates = await store.findNodes({ label, maxResults: 4000 });
  const normalizedNames = new Set(names.map((name) => normalizeValue(name)).filter(Boolean));
  return (
    candidates.find((node) => normalizedNames.has(normalizeValue(getNodeDisplayName(node)))) ?? null
  );
}

async function matchNodeCandidate(store: GraphStore, candidate: CandidateNode): Promise<{
  matchStatus: CandidateNode["matchStatus"];
  matchedNodeId?: string;
}> {
  const searchLabels = candidate.labels && candidate.labels.length > 0 ? candidate.labels : [candidate.label];
  const externalIds = candidate.externalIds ?? {};
  for (const [key, value] of Object.entries(externalIds)) {
    for (const label of searchLabels) {
      const exact = await store.findNodes({
        label,
        propertyKey: key,
        propertyValue: value,
        maxResults: 1,
      });
      if (exact.length > 0) {
        return { matchStatus: "matched_existing", matchedNodeId: exact[0].id };
      }
    }
  }

  const nameCandidates = [candidate.name, ...(candidate.aliases ?? [])].filter(Boolean);
  for (const label of searchLabels) {
    const exactDisplay = await exactLabelMatchByDisplay(store, label, nameCandidates);
    if (exactDisplay) {
      return { matchStatus: "matched_existing", matchedNodeId: exactDisplay.id };
    }
  }

  return { matchStatus: "create_new" };
}

async function matchEdgeCandidate(
  store: GraphStore,
  type: string,
  fromNodeId: string,
  toNodeId: string
): Promise<{ matchStatus: CandidateEdge["matchStatus"]; matchedEdgeId?: string }> {
  const existing = await store.findEdges({ type, fromNodeId, toNodeId, maxResults: 5 });
  if (existing.length > 0) {
    return {
      matchStatus: "matched_existing",
      matchedEdgeId: existing[0].id,
    };
  }
  return { matchStatus: "create_new" };
}

function sanitizeTargetEntity(value: unknown): ReviewTargetEntity | null {
  const record = sanitizeRecord(value);
  const id = sanitizeString(record.id);
  const label = sanitizeString(record.label);
  const name = sanitizeString(record.name);
  if (!id || !label || !name) return null;
  return { id, label, name };
}

function sanitizeCandidateNodeReference(value: unknown): CandidateNodeReference | null {
  const record = sanitizeRecord(value);
  const kind = record.kind;
  if (kind !== "target" && kind !== "candidate" && kind !== "existing") return null;
  const id = sanitizeString(record.id);
  if (!id) return null;
  return {
    kind,
    id,
    ...(sanitizeString(record.label) ? { label: sanitizeString(record.label) } : {}),
    ...(sanitizeString(record.name) ? { name: sanitizeString(record.name) } : {}),
  };
}

function sanitizePropertyChange(value: unknown): CandidatePropertyChange | null {
  const record = sanitizeRecord(value);
  const candidateId = sanitizeString(record.candidateId);
  const targetId = sanitizeString(record.targetId);
  const key = sanitizeString(record.key);
  const confidence = isConfidence(record.confidence) ? record.confidence : "medium";
  const provenance = sanitizeProvenanceList(record.provenance, confidence);
  const evidence = sanitizeEvidenceList(record.evidence, confidence);
  if (!candidateId || !targetId || !key || provenance.length === 0) return null;
  return {
    candidateId,
    targetId,
    key,
    value: record.value,
    ...(record.previousValue !== undefined ? { previousValue: record.previousValue } : {}),
    confidence,
    provenance,
    ...(evidence.length > 0 ? { evidence } : {}),
    matchStatus: "updates_existing_target",
    reviewStatus: isReviewDecision(record.reviewStatus) ? record.reviewStatus : "pending",
    ...(sanitizeString(record.notes) ? { notes: sanitizeString(record.notes) } : {}),
    ...(sanitizeString(record.justification) ? { justification: sanitizeString(record.justification) } : {}),
  };
}

async function sanitizeNodeCandidate(store: GraphStore, value: unknown): Promise<CandidateNode | null> {
  const record = sanitizeRecord(value);
  const candidateId = sanitizeString(record.candidateId);
  const label = sanitizeString(record.label);
  const name = sanitizeString(record.name);
  const confidence = isConfidence(record.confidence) ? record.confidence : "medium";
  const provenance = sanitizeProvenanceList(record.provenance, confidence);
  const evidence = sanitizeEvidenceList(record.evidence, confidence);
  if (!candidateId || !label || !name || provenance.length === 0) return null;
  const externalIds = Object.fromEntries(
    Object.entries(sanitizeRecord(record.externalIds))
      .map(([key, rawValue]) => [key, sanitizeString(rawValue)])
      .filter(([, rawValue]) => rawValue)
  );
  const normalizedLabels = normalizeCandidateLabels(
    label,
    Array.isArray(record.labels) ? record.labels.map((item) => sanitizeString(item)).filter(Boolean) : undefined
  );
  const canonicalKey =
    sanitizeString(record.canonicalKey) || deriveCanonicalKey(normalizedLabels.label, name, externalIds);
  const matched = await matchNodeCandidate(store, {
    candidateId,
    label: normalizedLabels.label,
    labels: normalizedLabels.labels,
    name,
    canonicalKey,
    properties: sanitizeRecord(record.properties),
    ...(Object.keys(externalIds).length > 0 ? { externalIds } : {}),
    ...(Array.isArray(record.aliases)
      ? {
          aliases: record.aliases.map((alias) => sanitizeString(alias)).filter(Boolean),
        }
      : {}),
    confidence,
    provenance,
    ...(evidence.length > 0 ? { evidence } : {}),
    matchStatus: "create_new",
    reviewStatus: "pending",
    ...(sanitizeString(record.notes) ? { notes: sanitizeString(record.notes) } : {}),
    ...(sanitizeString(record.justification) ? { justification: sanitizeString(record.justification) } : {}),
  });
  return {
    candidateId,
    label: normalizedLabels.label,
    labels: normalizedLabels.labels,
    name,
    canonicalKey,
    properties: sanitizeRecord(record.properties),
    ...(Object.keys(externalIds).length > 0 ? { externalIds } : {}),
    ...(Array.isArray(record.aliases)
      ? {
          aliases: record.aliases.map((alias) => sanitizeString(alias)).filter(Boolean),
        }
      : {}),
    confidence,
    provenance,
    ...(evidence.length > 0 ? { evidence } : {}),
    matchStatus: matched.matchStatus,
    ...(matched.matchedNodeId ? { matchedNodeId: matched.matchedNodeId } : {}),
    reviewStatus: isReviewDecision(record.reviewStatus) ? record.reviewStatus : "pending",
    ...(sanitizeString(record.notes) ? { notes: sanitizeString(record.notes) } : {}),
    ...(sanitizeString(record.justification) ? { justification: sanitizeString(record.justification) } : {}),
  };
}

async function sanitizeEdgeCandidate(
  store: GraphStore,
  value: unknown,
  nodeCandidates: CandidateNode[]
): Promise<CandidateEdge | null> {
  const record = sanitizeRecord(value);
  const candidateId = sanitizeString(record.candidateId);
  const type = sanitizeString(record.type);
  const fromRef = sanitizeCandidateNodeReference(record.fromRef);
  const toRef = sanitizeCandidateNodeReference(record.toRef);
  const confidence = isConfidence(record.confidence) ? record.confidence : "medium";
  const provenance = sanitizeProvenanceList(record.provenance, confidence);
  const evidence = sanitizeEvidenceList(record.evidence, confidence);
  if (!candidateId || !type || !fromRef || !toRef || provenance.length === 0) return null;

  const resolveImportedReference = (reference: CandidateNodeReference): string | null => {
    if (reference.kind === "candidate") {
      const candidate = nodeCandidates.find((item) => item.candidateId === reference.id);
      return candidate?.matchedNodeId ?? candidate?.candidateId ?? null;
    }
    return reference.id;
  };

  const fromMatch = resolveImportedReference(fromRef);
  const toMatch = resolveImportedReference(toRef);
  const matched =
    fromMatch && toMatch && !fromMatch.startsWith("node-") && !toMatch.startsWith("node-")
      ? await matchEdgeCandidate(store, type, fromMatch, toMatch)
      : { matchStatus: "create_new" as const };

  return {
    candidateId,
    type,
    fromRef,
    toRef,
    ...(Object.keys(sanitizeRecord(record.properties)).length > 0
      ? { properties: sanitizeRecord(record.properties) }
      : {}),
    confidence,
    provenance,
    ...(evidence.length > 0 ? { evidence } : {}),
    matchStatus: matched.matchStatus,
    ...(matched.matchedEdgeId ? { matchedEdgeId: matched.matchedEdgeId } : {}),
    reviewStatus: isReviewDecision(record.reviewStatus) ? record.reviewStatus : "pending",
    ...(sanitizeString(record.notes) ? { notes: sanitizeString(record.notes) } : {}),
    ...(sanitizeString(record.justification) ? { justification: sanitizeString(record.justification) } : {}),
  };
}

function summarizeSession(session: Pick<EnrichmentReviewSession, "propertyChanges" | "nodeCandidates" | "edgeCandidates">): string {
  return `${session.propertyChanges.length} property changes, ${session.nodeCandidates.length} node candidates, and ${session.edgeCandidates.length} relationship candidates staged for review.`;
}

function buildSourceRunReport(
  targets: ReviewTargetEntity[],
  previewResults: Array<Awaited<ReturnType<typeof previewEnrichmentPipeline>>>
): SourceRunReport {
  const allSources = getAllSources();
  const checkedSourceIds = new Set(previewResults.flatMap((preview) => preview.checkedSourceIds));
  const usedSourceIds = new Set(previewResults.flatMap((preview) => preview.sourceIdsUsed));
  const checkedRouteBySourceId = new Map(
    previewResults.flatMap((preview) => preview.checkedSourceRoutes).map((entry) => [entry.sourceId, entry.route])
  );
  const targetLabelToIds = new Map<string, string[]>();

  for (const target of targets) {
    const key = target.label.toLowerCase();
    const next = targetLabelToIds.get(key) ?? [];
    next.push(target.id);
    targetLabelToIds.set(key, next);
  }

  const entries: SourceRunEntry[] = allSources.map((source) => {
    const applicableTargetIds = source.entityTypes.flatMap(
      (entityType) => targetLabelToIds.get(entityType.toLowerCase()) ?? []
    );
    const inScope = applicableTargetIds.length > 0;

    return {
      id: source.id,
      name: source.name,
      type: source.type,
      method: source.method,
      ...(source.baseUrl ? { baseUrl: source.baseUrl } : {}),
      entityTypes: source.entityTypes,
      executionMode: getSourceExecutionMode(source),
      applicableTargetIds,
      effectiveRoute: checkedRouteBySourceId.get(source.id) ?? (inScope ? getEffectiveSourceRoute(source) : undefined),
      status: usedSourceIds.has(source.id)
        ? ("checked_used" as const)
        : checkedSourceIds.has(source.id)
          ? ("checked_no_result" as const)
          : inScope
            ? ("ready_for_curator" as const)
            : ("out_of_scope" as const),
    };
  });

  return {
    totalSources: entries.length,
    inScopeCount: entries.filter((entry) => entry.applicableTargetIds.length > 0).length,
    checkedCount: entries.filter((entry) => entry.status === "checked_used" || entry.status === "checked_no_result")
      .length,
    usedCount: entries.filter((entry) => entry.status === "checked_used").length,
    automatedReadyCount: entries.filter(
      (entry) => entry.applicableTargetIds.length > 0 && entry.executionMode === "automated"
    ).length,
    curatorReadyCount: entries.filter((entry) => entry.status === "ready_for_curator").length,
    outOfScopeCount: entries.filter((entry) => entry.status === "out_of_scope").length,
    entries,
  };
}

function buildDerivedNodeCandidate(
  candidateId: string,
  label: string,
  name: string,
  provenance: CandidateProvenance[],
  extra?: {
    properties?: Record<string, unknown>;
    notes?: string;
  }
): CandidateNode {
  const normalizedLabels = normalizeCandidateLabels(label);
  return {
    candidateId,
    label: normalizedLabels.label,
    labels: normalizedLabels.labels,
    name,
    canonicalKey: deriveCanonicalKey(normalizedLabels.label, name),
    properties: {
      ...(normalizedLabels.label === "Genre" ||
      normalizedLabels.label === "Person" ||
      normalizedLabels.label === "Equipment" ||
      normalizedLabels.label === "Instrument" ||
      normalizedLabels.label === "Venue"
        ? { name }
        : normalizedLabels.label === "Performance"
          ? { name }
          : {}),
      ...(extra?.properties ?? {}),
    },
    confidence: provenance[0]?.confidence ?? "medium",
    provenance,
    matchStatus: "create_new",
    reviewStatus: "pending",
    ...(extra?.notes ? { notes: extra.notes } : {}),
  };
}

function buildDerivedEdgeCandidate(
  candidateId: string,
  type: string,
  fromRef: CandidateNodeReference,
  toRef: CandidateNodeReference,
  provenance: CandidateProvenance[],
  properties?: Record<string, unknown>
): CandidateEdge {
  return {
    candidateId,
    type,
    fromRef,
    toRef,
    ...(properties && Object.keys(properties).length > 0 ? { properties } : {}),
    confidence: provenance[0]?.confidence ?? "medium",
    provenance,
    matchStatus: "create_new",
    reviewStatus: "pending",
  };
}

function collectNarrativeSegments(change: CandidatePropertyChange): string[] {
  if (typeof change.value !== "string") return [];
  if (!["biography", "summary", "notes"].includes(change.key)) return [];
  return change.value
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function extractCapitalizedNames(value: string): string[] {
  return Array.from(
    value.matchAll(/\b([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+)+)\b/g),
    (match) => trimTrailingPunctuation(match[1] ?? "")
  ).filter(Boolean);
}

export async function deriveNarrativeCandidates(
  store: GraphStore,
  targets: ReviewTargetEntity[],
  propertyChanges: CandidatePropertyChange[],
  existingNodeCandidates: CandidateNode[],
  existingEdgeCandidates: CandidateEdge[]
): Promise<{ nodeCandidates: CandidateNode[]; edgeCandidates: CandidateEdge[] }> {
  const targetsById = new Map(targets.map((target) => [target.id, target]));
  const derivedNodeCandidates: CandidateNode[] = [];
  const derivedEdgeCandidates: CandidateEdge[] = [];
  const seenNodeKeys = new Set(existingNodeCandidates.map((item) => `${item.label}:${item.canonicalKey}`));
  const seenEdgeKeys = new Set(
    existingEdgeCandidates.map((item) => `${item.type}:${item.fromRef.kind}:${item.fromRef.id}:${item.toRef.kind}:${item.toRef.id}`)
  );

  const pushNode = async (candidate: CandidateNode) => {
    const identityKey = `${candidate.label}:${candidate.canonicalKey}`;
    if (seenNodeKeys.has(identityKey)) return;
    const sanitized = await sanitizeNodeCandidate(store, candidate);
    if (!sanitized) return;
    seenNodeKeys.add(identityKey);
    derivedNodeCandidates.push(sanitized);
  };

  const pushEdge = async (candidate: CandidateEdge) => {
    const edgeKey = `${candidate.type}:${candidate.fromRef.kind}:${candidate.fromRef.id}:${candidate.toRef.kind}:${candidate.toRef.id}`;
    if (seenEdgeKeys.has(edgeKey)) return;
    const sanitized = await sanitizeEdgeCandidate(
      store,
      candidate,
      [...existingNodeCandidates, ...derivedNodeCandidates]
    );
    if (!sanitized) return;
    seenEdgeKeys.add(edgeKey);
    derivedEdgeCandidates.push(sanitized);
  };

  const genreTerms = [
    "art rock",
    "classic rock",
    "freakbeat",
    "hard rock",
    "mod",
    "power pop",
    "punk",
    "rock opera",
  ];

  const equipmentTerms = [
    {
      phrase: "marshall stack",
      label: "Equipment",
      name: "Marshall stack",
      properties: { name: "Marshall stack", type: "amplifier stack", manufacturer: "Marshall" },
    },
    {
      phrase: "public address systems",
      label: "Equipment",
      name: "Public address system",
      properties: { name: "Public address system", type: "live sound reinforcement" },
    },
    {
      phrase: "synthesisers",
      label: "Instrument",
      name: "Synthesiser",
      properties: { name: "Synthesiser", type: "synthesizer", family: "Keyboards" },
    },
  ] as const;

  for (const change of propertyChanges) {
    const target = targetsById.get(change.targetId);
    if (!target) continue;
    const segments = collectNarrativeSegments(change);
    if (segments.length === 0) continue;

    for (const segment of segments) {
      const lowerSegment = segment.toLowerCase();

      if (target.label === "Artist") {
        const addPersonMembership = async (memberName: string, role?: string, notes?: string) => {
          const candidateId = `derived-person-${slugify(memberName)}`;
          await pushNode(
            buildDerivedNodeCandidate(candidateId, "Person", memberName, change.provenance, {
              properties: {
                name: memberName,
                ...(role ? { roles: [role] } : {}),
              },
              notes: notes ?? `Derived from ${change.key} narrative text.`,
            })
          );
          await pushEdge(
            buildDerivedEdgeCandidate(
              `derived-member-of-${slugify(memberName)}-${slugify(target.name)}`,
              "MEMBER_OF",
              {
                kind: "candidate",
                id: candidateId,
                label: "Person",
                name: memberName,
              },
              {
                kind: "target",
                id: target.id,
                label: target.label,
                name: target.name,
              },
              change.provenance,
              role ? { role } : undefined
            )
          );
        };

        const addRelatedArtist = async (artistName: string, context: string) => {
          const candidateId = `derived-artist-${slugify(artistName)}`;
          await pushNode(
            buildDerivedNodeCandidate(candidateId, "Artist", artistName, change.provenance, {
              properties: { name: artistName },
              notes: `Derived from ${change.key} narrative text.`,
            })
          );
          await pushEdge(
            buildDerivedEdgeCandidate(
              `derived-collaboration-${slugify(target.name)}-${slugify(artistName)}-${slugify(context)}`,
              "COLLABORATED_WITH",
              {
                kind: "target",
                id: target.id,
                label: target.label,
                name: target.name,
              },
              {
                kind: "candidate",
                id: candidateId,
                label: "Artist",
                name: artistName,
              },
              change.provenance,
              { context }
            )
          );
        };

        const memberPattern =
          /\b(lead vocalist|vocalist|guitarist|bassist|drummer|keyboardist|percussionist|singer)\s+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+)+)/g;
        for (const match of segment.matchAll(memberPattern)) {
          const role = match[1];
          const memberName = trimTrailingPunctuation(match[2]?.trim() ?? "");
          if (!memberName) continue;
          await addPersonMembership(memberName, role);
        }

        const founderMatch = segment.match(
          /\b(?:founded|formed|created|started)(?:\s+in\s+\d{4})?\s+by\s+(.+?)(?:\s+as\s+a\s+side\s+project\b|\.|;|,?\s+best known\b|,?\s+whose\b|,?\s+which\b|$)/i
        );
        if (founderMatch) {
          for (const memberName of extractCapitalizedNames(founderMatch[1] ?? "")) {
            await addPersonMembership(memberName, "founder", `Derived from ${change.key} founder narrative text.`);
          }
        }

        const memberListMatch = segment.match(
          /\b(?:members?\s+(?:include|included)|consist(?:s|ed)\s+of|comprised\s+of)\s+(.+?)(?:\.|;|,?\s+and\s+their\b|$)/i
        );
        if (memberListMatch) {
          for (const memberName of extractCapitalizedNames(memberListMatch[1] ?? "")) {
            await addPersonMembership(memberName, undefined, `Derived from ${change.key} membership narrative text.`);
          }
        }

        const sideProjectMatch = segment.match(
          /\bside project\s+(?:from|of)\s+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+)+)\b/i
        );
        if (sideProjectMatch) {
          const relatedArtist = trimTrailingPunctuation(sideProjectMatch[1] ?? "");
          if (relatedArtist) {
            await addRelatedArtist(relatedArtist, "side project");
          }
        }

        const collaborationMatch = segment.match(
          /\b(?:worked|played|recorded|performed|collaborated)\s+with\s+(.+?)(?:\.|;|,?\s+including\b|,?\s+such as\b|$)/i
        );
        if (collaborationMatch) {
          for (const artistName of extractCapitalizedNames(collaborationMatch[1] ?? "")) {
            await addRelatedArtist(
              artistName,
              "worked with"
            );
          }
        }

        const memberOfMatch = segment.match(
          /\bmember\s+of\s+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+)+)\b/i
        );
        if (memberOfMatch) {
          const relatedArtist = trimTrailingPunctuation(memberOfMatch[1] ?? "");
          if (relatedArtist) {
            const candidateId = `derived-artist-${slugify(relatedArtist)}`;
            await pushNode(
              buildDerivedNodeCandidate(candidateId, "Artist", relatedArtist, change.provenance, {
                properties: { name: relatedArtist },
                notes: `Derived from ${change.key} membership narrative text.`,
              })
            );
            await pushEdge(
              buildDerivedEdgeCandidate(
                `derived-member-of-artist-${slugify(target.name)}-${slugify(relatedArtist)}`,
                "MEMBER_OF",
                {
                  kind: "target",
                  id: target.id,
                  label: target.label,
                  name: target.name,
                },
                {
                  kind: "candidate",
                  id: candidateId,
                  label: "Artist",
                  name: relatedArtist,
                },
                change.provenance,
                { context: "member of narrative" }
              )
            );
          }
        }
      }

      const canLinkGenres = target.label === "Artist" || target.label === "Track" || target.label === "SongWork";
      if (canLinkGenres) {
        for (const genre of genreTerms) {
          if (!lowerSegment.includes(genre)) continue;
          const candidateId = `derived-genre-${slugify(genre)}`;
          await pushNode(
            buildDerivedNodeCandidate(candidateId, "Genre", genre, change.provenance, {
              properties: { name: genre },
              notes: `Derived from ${change.key} narrative text.`,
            })
          );
          await pushEdge(
            buildDerivedEdgeCandidate(
              `derived-part-of-genre-${slugify(target.name)}-${slugify(genre)}`,
              "PART_OF_GENRE",
              {
                kind: "target",
                id: target.id,
                label: target.label,
                name: target.name,
              },
              {
                kind: "candidate",
                id: candidateId,
                label: "Genre",
                name: genre,
              },
              change.provenance
            )
          );
        }
      }

      const canLinkEquipment =
        target.label === "Artist" ||
        target.label === "Track" ||
        target.label === "Album" ||
        target.label === "Session" ||
        target.label === "Performance";
      if (canLinkEquipment) {
        for (const equipment of equipmentTerms) {
          if (!lowerSegment.includes(equipment.phrase)) continue;
          const candidateId = `derived-${equipment.label.toLowerCase()}-${slugify(equipment.name)}`;
          await pushNode(
            buildDerivedNodeCandidate(candidateId, equipment.label, equipment.name, change.provenance, {
              properties: equipment.properties,
              notes: `Derived from ${change.key} narrative text.`,
            })
          );
          await pushEdge(
            buildDerivedEdgeCandidate(
              `derived-used-equipment-${slugify(target.name)}-${slugify(equipment.name)}`,
              "USED_EQUIPMENT",
              {
                kind: "target",
                id: target.id,
                label: target.label,
                name: target.name,
              },
              {
                kind: "candidate",
                id: candidateId,
                label: equipment.label,
                name: equipment.name,
              },
              change.provenance
            )
          );
        }
      }

      const hallMatch = segment.match(/inducted into the (.+?hall of fame) in (\d{4})/i);
      const canLinkPerformance = target.label === "Artist" || target.label === "Person";
      if (hallMatch && canLinkPerformance) {
        const hallName = hallMatch[1].trim();
        const year = hallMatch[2];
        const performanceCandidateId = `derived-performance-${slugify(hallName)}-${year}`;
        await pushNode(
          buildDerivedNodeCandidate(performanceCandidateId, "Performance", `${hallName} induction`, change.provenance, {
            properties: {
              name: `${hallName} induction`,
              venue: hallName,
              date: year,
              lineup: [target.name],
            },
            notes: `Derived from ${change.key} narrative text.`,
          })
        );
        await pushEdge(
          buildDerivedEdgeCandidate(
            `derived-participated-in-${slugify(target.name)}-${slugify(hallName)}-${year}`,
            "PARTICIPATED_IN",
            {
              kind: "target",
              id: target.id,
              label: target.label,
              name: target.name,
            },
            {
              kind: "candidate",
              id: performanceCandidateId,
              label: "Performance",
              name: `${hallName} induction`,
            },
            change.provenance,
            { role: "inductee", year }
          )
        );
      }
    }
  }

  return { nodeCandidates: derivedNodeCandidates, edgeCandidates: derivedEdgeCandidates };
}

export async function createReviewSession(
  store: GraphStore,
  targetIds: string[]
): Promise<EnrichmentReviewSession> {
  const targets: ReviewTargetEntity[] = [];
  for (const targetId of [...new Set(targetIds.map((item) => item.trim()).filter(Boolean))]) {
    const node = await store.getNode(targetId);
    if (!node) continue;
    targets.push({
      id: node.id,
      label: getPrimaryEntityLabel(node.labels),
      name: getNodeDisplayName(node),
    });
  }
  if (targets.length === 0) {
    throw new Error("No valid target entities were selected.");
  }
  const createdAt = nowIso();
  const session: EnrichmentReviewSession = {
    id: randomUUID(),
    status: "ready_for_import",
    createdAt,
    updatedAt: createdAt,
    approvedAt: createdAt,
    summary: "Subset approved. Import curator results to begin review.",
    targets,
    propertyChanges: [],
    nodeCandidates: [],
    edgeCandidates: [],
  };
  await writeReviewSession(session);
  return session;
}

export async function getReviewSession(sessionId: string): Promise<EnrichmentReviewSession> {
  const session = await readReviewSession(sessionId);
  if (!session) {
    throw new Error(`Review session not found: ${sessionId}`);
  }
  return session;
}

export type TripletImportContext = {
  relationship: string;
  subjectTargetId: string;
  objectTargetId: string;
  objectLabel: string;
};

function inferWorkflowType(
  importedFrom: string | undefined,
  explicitWorkflowType?: EnrichmentWorkflowType
): EnrichmentWorkflowType {
  if (explicitWorkflowType) return explicitWorkflowType;
  if (importedFrom === "triplet-exploration") return "triplet";
  if (importedFrom === "llm-only") return "llm_only";
  if (importedFrom === "span-mention") return "span_mention";
  return "hybrid";
}

export async function importResearchBundle(
  store: GraphStore,
  sessionId: string,
  bundle: ResearchBundle,
  importedFrom = "subagent",
  tripletContext?: TripletImportContext,
  workflowType?: EnrichmentWorkflowType
): Promise<EnrichmentReviewSession> {
  const existing = await getReviewSession(sessionId);
  const validatedBundle = validateResearchBundle(bundle, {
    sessionId,
    targets: existing.targets,
    ontology: existing.researchPacket?.ontology ?? buildResearchOntologyContext(),
  });

  const targets = Array.isArray(validatedBundle.targets)
    ? validatedBundle.targets
        .map((item) => sanitizeTargetEntity(item))
        .filter((item): item is ReviewTargetEntity => item !== null)
    : existing.targets;
  const propertyChanges = Array.isArray(validatedBundle.propertyChanges)
    ? validatedBundle.propertyChanges
        .map((item) => sanitizePropertyChange(item))
        .filter((item): item is CandidatePropertyChange => item !== null)
    : [];
  const nodeCandidates = Array.isArray(validatedBundle.nodeCandidates)
    ? (
        await Promise.all(validatedBundle.nodeCandidates.map((item) => sanitizeNodeCandidate(store, item)))
      ).filter((item): item is CandidateNode => item !== null)
    : [];
  let edgeCandidates = Array.isArray(validatedBundle.edgeCandidates)
    ? (
        await Promise.all(validatedBundle.edgeCandidates.map((item) => sanitizeEdgeCandidate(store, item, nodeCandidates)))
      ).filter((item): item is CandidateEdge => item !== null)
    : [];

  if (tripletContext && isRelationshipType(tripletContext.relationship)) {
    const objectLabelLower = tripletContext.objectLabel.toLowerCase();
    const matchingNodes = nodeCandidates.filter(
      (n) => n.label?.toLowerCase() === objectLabelLower
    );
    const seenKeys = new Set(
      edgeCandidates.map((e) => `${e.type}:${e.fromRef.kind}:${e.fromRef.id}:${e.toRef.kind}:${e.toRef.id}`)
    );
    const provenance: CandidateProvenance[] =
      nodeCandidates[0]?.provenance ?? [
        {
          source_id: "gpt-5.4",
          source_name: "GPT-5.4",
          source_type: "api",
          url: "https://openai.com/gpt-5.4",
          retrieved_at: new Date().toISOString(),
          confidence: "medium",
        },
      ];
    for (const node of matchingNodes) {
      const edgeKey = `${tripletContext.relationship}:target:${tripletContext.subjectTargetId}:candidate:${node.candidateId}`;
      if (seenKeys.has(edgeKey)) continue;
      seenKeys.add(edgeKey);
      edgeCandidates = [
        ...edgeCandidates,
        buildDerivedEdgeCandidate(
          `triplet-edge-${tripletContext.relationship}-${slugify(node.candidateId)}`,
          tripletContext.relationship,
          { kind: "target", id: tripletContext.subjectTargetId },
          { kind: "candidate", id: node.candidateId },
          provenance
        ),
      ];
    }
  }

  const propertyChangesWithPrevious = await Promise.all(
    propertyChanges.map(async (change) => {
      const target = await store.getNode(change.targetId);
      return {
        ...change,
        previousValue: target?.properties[change.key],
      };
    })
  );

  const derivedCandidates = await deriveNarrativeCandidates(
    store,
    targets.length > 0 ? targets : existing.targets,
    propertyChangesWithPrevious,
    nodeCandidates,
    edgeCandidates
  );

  const nextSession: EnrichmentReviewSession = {
    ...existing,
    status: "ready_for_review",
    updatedAt: nowIso(),
    importedAt: nowIso(),
    summary: sanitizeString(validatedBundle.summary) || summarizeSession({
      propertyChanges: propertyChangesWithPrevious,
      nodeCandidates: [...nodeCandidates, ...derivedCandidates.nodeCandidates],
      edgeCandidates: [...edgeCandidates, ...derivedCandidates.edgeCandidates],
    }),
    targets: targets.length > 0 ? targets : existing.targets,
    propertyChanges: propertyChangesWithPrevious,
    nodeCandidates: [...nodeCandidates, ...derivedCandidates.nodeCandidates],
    edgeCandidates: [...edgeCandidates, ...derivedCandidates.edgeCandidates],
    researchPacket: existing.researchPacket,
    importMetadata: {
      generatedAt: sanitizeString(validatedBundle.generatedAt) || undefined,
      importedFrom,
      workflowType: inferWorkflowType(importedFrom, workflowType),
      generator: validatedBundle.metadata?.generator,
      provider: validatedBundle.metadata?.provider,
      model: validatedBundle.metadata?.model,
      promptVersion: validatedBundle.metadata?.promptVersion,
      evidenceRecordCount: validatedBundle.metadata?.evidenceRecordCount,
      sourceCount: validatedBundle.metadata?.sourceCount,
      notes: validatedBundle.metadata?.notes,
    },
  };

  await writeReviewSession(nextSession);
  return nextSession;
}

function buildEvidenceId(targetId: string, record: VerifiedEnrichmentRecord, recordIndex: number): string {
  return `${slugify(targetId)}-${record.source_id}-${recordIndex}`;
}

function createResearchPacket(
  session: EnrichmentReviewSession,
  previewResults: EnrichmentPreviewResult[],
  sourceReport?: SourceRunReport
): ResearchPacket {
  const applicableEntries = (sourceReport ?? session.sourceReport)?.entries.filter(
    (entry) => entry.applicableTargetIds.length > 0
  ) ?? [];
  const curatorEntries = applicableEntries.filter((entry) => entry.status === "ready_for_curator");

  return {
    sessionId: session.id,
    targets: session.targets,
    instructions: [
      "Act as a music knowledge-graph researcher and editor.",
      "Read all verified evidence across all provided sources before proposing any candidate properties, nodes, or edges.",
      "Only emit ontology-valid candidates with source-backed provenance and concise justification.",
      "Treat every applicable source in sourcePlan as required coverage for this run before broadening beyond the catalog.",
      "Use broad ontology reasoning across people, artists, groups, recordings, venues, labels, and equipment when the evidence supports it.",
      curatorEntries.length > 0
        ? `Explicitly check every curator-required source in sourcePlan: ${curatorEntries.map((entry) => entry.id).join(", ")}.`
        : "All applicable catalog sources for this run were already available to the automated pipeline.",
    ],
    ...(sourceReport ?? session.sourceReport ? { sourcePlan: sourceReport ?? session.sourceReport } : {}),
    ontology: buildResearchOntologyContext(),
    evidence: previewResults.map((preview) => ({
      target:
        session.targets.find((target) => target.id === preview.nodeId) ?? {
          id: preview.nodeId,
          label: preview.entityType,
          name: preview.displayName,
        },
      records: preview.verifiedRecords.map((record, recordIndex) => ({
        ...record,
        evidenceId: buildEvidenceId(preview.nodeId, record, recordIndex),
        targetId: preview.nodeId,
        sourceDisplayName: preview.displayName,
      })),
    })),
  };
}

export interface StartAutomatedReviewSessionOptions {
  /** When provided, use this instead of calling the pipeline (e.g. for tests using real captured evidence). */
  previewResults?: EnrichmentPreviewResult[];
}

export async function startAutomatedReviewSession(
  store: GraphStore,
  targetIds: string[],
  options?: StartAutomatedReviewSessionOptions
): Promise<EnrichmentReviewSession> {
  // #region agent log
  fetch("http://127.0.0.1:7290/ingest/d02d8ae0-2fcc-4270-9ab1-7e7cc64f475b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e8d527" },
    body: JSON.stringify({
      sessionId: "e8d527",
      runId: "run1",
      hypothesisId: "H2",
      location: "review.ts:startAutomatedReviewSession:entry",
      message: "session created, checking LLM config",
      data: { targetCount: targetIds.length },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  const session = await createReviewSession(store, targetIds);

  if (useLlmOnlyPipeline() && isLlmOnlyPipelineConfigured()) {
    const LLM_ONLY_LOG = "[llm-only]";
    console.log(
      `${LLM_ONLY_LOG} taking LLM-only path sessionId=${session.id} targets=${session.targets.length} targetNames=${session.targets.map((t) => t.name).join(", ")}`
    );
    const llmOnlyResult = await runLlmOnlyPipeline(session.id, session.targets);
    console.log(
      `${LLM_ONLY_LOG} pipeline done nodes=${llmOnlyResult.bundle.nodeCandidates?.length ?? 0} edges=${llmOnlyResult.bundle.edgeCandidates?.length ?? 0} propertyChanges=${llmOnlyResult.bundle.propertyChanges?.length ?? 0}`
    );
    const importedSession = await importResearchBundle(
      store,
      session.id,
      llmOnlyResult.bundle,
      "llm-only"
    );
    console.log(`${LLM_ONLY_LOG} bundle imported status=${importedSession.status}`);
    const nextSession: EnrichmentReviewSession = {
      ...importedSession,
      sourceReport: undefined,
      researchPacket: undefined,
    };
    await writeReviewSession(nextSession);
    console.log(`${LLM_ONLY_LOG} session written, returning`);
    return nextSession;
  }

  const previewResults =
    options?.previewResults ??
    (await Promise.all(session.targets.map((target) => previewEnrichmentPipeline(store, target.id))));
  const sourceReport = buildSourceRunReport(session.targets, previewResults);
  const researchPacket = createResearchPacket(session, previewResults, sourceReport);
  await writeReviewSession({
    ...session,
    sourceReport,
    researchPacket,
  });

  let automatedBundle: ResearchBundle;
  let importedFrom = "llm-auto-preview";
  const llmConfigured = isEnrichmentLlmConfigured();
  // #region agent log
  fetch("http://127.0.0.1:7290/ingest/d02d8ae0-2fcc-4270-9ab1-7e7cc64f475b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e8d527" },
    body: JSON.stringify({
      sessionId: "e8d527",
      runId: "run1",
      hypothesisId: "H2",
      location: "review.ts:startAutomatedReviewSession:branch",
      message: "LLM configured? which path taken",
      data: { sessionId: session.id, llmConfigured, path: llmConfigured ? "llm" : "blocked_no_llm" },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (!llmConfigured) {
    throw new Error("Enrichment LLM is required. Deterministic fallback is disabled.");
  }

  try {
    const llmResult = await synthesizeResearchBundle(researchPacket);
    automatedBundle = llmResult.bundle;
    // #region agent log
    fetch("http://127.0.0.1:7290/ingest/d02d8ae0-2fcc-4270-9ab1-7e7cc64f475b", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e8d527" },
      body: JSON.stringify({
        sessionId: "e8d527",
        runId: "run1",
        hypothesisId: "H3",
        location: "review.ts:startAutomatedReviewSession:llm-success",
        message: "LLM synthesis succeeded",
        data: { model: llmResult.metadata?.model, importedFrom },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  } catch (error) {
    // #region agent log
    fetch("http://127.0.0.1:7290/ingest/d02d8ae0-2fcc-4270-9ab1-7e7cc64f475b", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e8d527" },
      body: JSON.stringify({
        sessionId: "e8d527",
        runId: "run1",
        hypothesisId: "H3",
        location: "review.ts:startAutomatedReviewSession:llm-catch",
        message: "LLM synthesis failed; deterministic fallback disabled",
        data: {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : undefined,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw error instanceof Error ? error : new Error(String(error));
  }

  const importedSession = await importResearchBundle(store, session.id, automatedBundle, importedFrom);
  const nextSession: EnrichmentReviewSession = {
    ...importedSession,
    sourceReport,
    researchPacket,
  };
  await writeReviewSession(nextSession);
  return nextSession;
}

export async function updateReviewDecisions(
  sessionId: string,
  decisions: ReviewDecision[]
): Promise<EnrichmentReviewSession> {
  const session = await getReviewSession(sessionId);
  const decisionMap = new Map(
    decisions.map((decision) => [`${decision.candidateType}:${decision.candidateId}`, decision.reviewStatus])
  );
  const updatedAt = nowIso();
  const nextSession: EnrichmentReviewSession = {
    ...session,
    updatedAt,
    propertyChanges: session.propertyChanges.map((item) => ({
      ...item,
      reviewStatus:
        decisionMap.get(`property:${item.candidateId}`) ?? item.reviewStatus,
    })),
    nodeCandidates: session.nodeCandidates.map((item) => ({
      ...item,
      reviewStatus: decisionMap.get(`node:${item.candidateId}`) ?? item.reviewStatus,
    })),
    edgeCandidates: session.edgeCandidates.map((item) => ({
      ...item,
      reviewStatus: decisionMap.get(`edge:${item.candidateId}`) ?? item.reviewStatus,
    })),
  };
  await writeReviewSession(nextSession);
  return nextSession;
}

function shouldApply(reviewStatus: ReviewDecisionStatus, matchStatus: string): boolean {
  if (reviewStatus === "rejected") return false;
  if (matchStatus === "ambiguous") return reviewStatus === "approved";
  return true;
}

function collectPropertyPatch(
  existing: GraphNode,
  changes: CandidatePropertyChange[],
  sessionId: string
): { properties: Record<string, unknown>; meta: Record<string, unknown> } {
  const properties = Object.fromEntries(changes.map((change) => [change.key, change.value]));
  const meta = buildCandidateMeta(
    sessionId,
    changes.map((change) => change.candidateId).join(","),
    dedupeProvenance(changes.flatMap((change) => change.provenance)),
    existing.meta
  );
  return { properties, meta };
}

function resolveReferenceId(
  reference: CandidateNodeReference,
  resolvedNodeIds: Map<string, string>
): string | null {
  if (reference.kind === "candidate") {
    return resolvedNodeIds.get(reference.id) ?? null;
  }
  return reference.id;
}

function getCandidateNodeLabels(candidate: CandidateNode, currentLabels?: string[]): string[] {
  return coerceArtistPersonIdentity(
    normalizeEntityLabels([...(currentLabels ?? []), ...(candidate.labels ?? []), candidate.label].filter(Boolean))
  );
}

export async function applyReviewSession(
  store: GraphStore,
  sessionId: string
): Promise<EnrichmentReviewSession> {
  const session = await getReviewSession(sessionId);
  const activePropertyChanges = session.propertyChanges.filter((item) =>
    shouldApply(item.reviewStatus, item.matchStatus)
  );
  const activeNodeCandidates = session.nodeCandidates.filter((item) =>
    shouldApply(item.reviewStatus, item.matchStatus)
  );
  const activeEdgeCandidates = session.edgeCandidates.filter((item) =>
    shouldApply(item.reviewStatus, item.matchStatus)
  );

  const resolvedNodeIds = new Map<string, string>();

  await store.runInTransaction(async () => {
    const propertyGroups = new Map<string, CandidatePropertyChange[]>();
    for (const change of activePropertyChanges) {
      const list = propertyGroups.get(change.targetId) ?? [];
      list.push(change);
      propertyGroups.set(change.targetId, list);
    }
    for (const [targetId, changes] of propertyGroups) {
      const existing = await store.getNode(targetId);
      if (!existing) continue;
      const patch = collectPropertyPatch(existing, changes, session.id);
      await store.updateNode(targetId, patch);
    }

    const seenNodeIdentities = new Map<string, string>();
    for (const candidate of activeNodeCandidates) {
      const identityKey =
        Object.entries(candidate.externalIds ?? {})
          .map(([key, value]) => `${key}:${value}`)
          .sort()[0] ?? `${candidate.label}:${candidate.canonicalKey}`;
      const reused = seenNodeIdentities.get(identityKey);
      if (reused) {
        resolvedNodeIds.set(candidate.candidateId, reused);
        continue;
      }

      let resolvedNodeId = candidate.matchedNodeId;
      if (resolvedNodeId) {
        const current = await store.getNode(resolvedNodeId);
        if (current) {
          await store.updateNode(resolvedNodeId, {
            labels: getCandidateNodeLabels(candidate, current.labels),
            properties: candidate.properties,
            meta: buildCandidateMeta(session.id, candidate.candidateId, candidate.provenance, current.meta),
          });
        }
      } else {
        resolvedNodeId = buildNodeId(candidate.label, candidate.canonicalKey);
        const existingByGeneratedId = await store.getNode(resolvedNodeId);
        if (existingByGeneratedId) {
          await store.updateNode(resolvedNodeId, {
            labels: getCandidateNodeLabels(candidate, existingByGeneratedId.labels),
            properties: candidate.properties,
            meta: buildCandidateMeta(
              session.id,
              candidate.candidateId,
              candidate.provenance,
              existingByGeneratedId.meta
            ),
          });
        } else {
          await store.createNode(
            new ReviewGraphNode(
              resolvedNodeId,
              getCandidateNodeLabels(candidate),
              candidate.properties,
              buildCandidateMeta(session.id, candidate.candidateId, candidate.provenance)
            )
          );
        }
      }
      resolvedNodeIds.set(candidate.candidateId, resolvedNodeId);
      seenNodeIdentities.set(identityKey, resolvedNodeId);
    }

    for (const candidate of activeEdgeCandidates) {
      const fromNodeId = resolveReferenceId(candidate.fromRef, resolvedNodeIds);
      const toNodeId = resolveReferenceId(candidate.toRef, resolvedNodeIds);
      if (!fromNodeId || !toNodeId) continue;

      const match = candidate.matchedEdgeId
        ? { matchStatus: "matched_existing" as const, matchedEdgeId: candidate.matchedEdgeId }
        : await matchEdgeCandidate(store, candidate.type, fromNodeId, toNodeId);

      if (match.matchedEdgeId) {
        const current = await store.getEdge(match.matchedEdgeId);
        await store.updateEdge(match.matchedEdgeId, {
          properties: candidate.properties,
          meta: buildCandidateMeta(session.id, candidate.candidateId, candidate.provenance, current?.meta),
        });
        continue;
      }

      const edgeId = buildEdgeId(candidate.type, fromNodeId, toNodeId);
      const existingByGeneratedId = await store.getEdge(edgeId);
      if (existingByGeneratedId) {
        await store.updateEdge(edgeId, {
          properties: candidate.properties,
          meta: buildCandidateMeta(
            session.id,
            candidate.candidateId,
            candidate.provenance,
            existingByGeneratedId.meta
          ),
        });
        continue;
      }
      await store.createEdge(
        new ReviewGraphEdge(
          edgeId,
          candidate.type,
          fromNodeId,
          toNodeId,
          candidate.properties ?? {},
          buildCandidateMeta(session.id, candidate.candidateId, candidate.provenance)
        )
      );
    }
  });

  const nextSession: EnrichmentReviewSession = {
    ...session,
    status: "applied",
    updatedAt: nowIso(),
    appliedAt: nowIso(),
    summary: "Approved enrichment candidates were applied to the graph.",
  };
  await writeReviewSession(nextSession);
  return nextSession;
}

export interface ApplyAsProposedOptions {
  proposedBy?: string;
}

/** Apply session to the graph with meta.proposed = true (for non-admin "enrich by query" path). */
export async function applyReviewSessionAsProposed(
  store: GraphStore,
  sessionId: string,
  options?: ApplyAsProposedOptions
): Promise<EnrichmentReviewSession> {
  const session = await getReviewSession(sessionId);
  const activePropertyChanges = session.propertyChanges.filter((item) =>
    shouldApply(item.reviewStatus, item.matchStatus)
  );
  const activeNodeCandidates = session.nodeCandidates.filter((item) =>
    shouldApply(item.reviewStatus, item.matchStatus)
  );
  const activeEdgeCandidates = session.edgeCandidates.filter((item) =>
    shouldApply(item.reviewStatus, item.matchStatus)
  );

  const resolvedNodeIds = new Map<string, string>();
  const proposedMeta = (existingMeta?: Record<string, unknown>, candidateId?: string, prov?: CandidateProvenance[]) =>
    buildCandidateMetaProposed(
      session.id,
      candidateId ?? "",
      prov ?? [],
      existingMeta,
      { proposedBy: options?.proposedBy }
    );

  await store.runInTransaction(async () => {
    const propertyGroups = new Map<string, CandidatePropertyChange[]>();
    for (const change of activePropertyChanges) {
      const list = propertyGroups.get(change.targetId) ?? [];
      list.push(change);
      propertyGroups.set(change.targetId, list);
    }
    for (const [targetId, changes] of propertyGroups) {
      const existing = await store.getNode(targetId);
      if (!existing) continue;
      const patch = collectPropertyPatch(existing, changes, session.id);
      if (patch.meta) patch.meta = { ...patch.meta, proposed: true, proposedAt: nowIso(), proposedBy: options?.proposedBy ?? "anonymous" };
      await store.updateNode(targetId, patch);
    }

    const seenNodeIdentities = new Map<string, string>();
    for (const candidate of activeNodeCandidates) {
      const identityKey =
        Object.entries(candidate.externalIds ?? {})
          .map(([key, value]) => `${key}:${value}`)
          .sort()[0] ?? `${candidate.label}:${candidate.canonicalKey}`;
      const reused = seenNodeIdentities.get(identityKey);
      if (reused) {
        resolvedNodeIds.set(candidate.candidateId, reused);
        continue;
      }

      let resolvedNodeId = candidate.matchedNodeId;
      if (resolvedNodeId) {
        const current = await store.getNode(resolvedNodeId);
        if (current) {
          await store.updateNode(resolvedNodeId, {
            labels: getCandidateNodeLabels(candidate, current.labels),
            properties: candidate.properties,
            meta: proposedMeta(current.meta, candidate.candidateId, candidate.provenance),
          });
        }
      } else {
        resolvedNodeId = buildNodeId(candidate.label, candidate.canonicalKey);
        const existingByGeneratedId = await store.getNode(resolvedNodeId);
        if (existingByGeneratedId) {
          await store.updateNode(resolvedNodeId, {
            labels: getCandidateNodeLabels(candidate, existingByGeneratedId.labels),
            properties: candidate.properties,
            meta: proposedMeta(existingByGeneratedId.meta, candidate.candidateId, candidate.provenance),
          });
        } else {
          await store.createNode(
            new ReviewGraphNode(
              resolvedNodeId,
              getCandidateNodeLabels(candidate),
              candidate.properties,
              proposedMeta(undefined, candidate.candidateId, candidate.provenance) as Record<string, unknown>
            )
          );
        }
      }
      resolvedNodeIds.set(candidate.candidateId, resolvedNodeId);
      seenNodeIdentities.set(identityKey, resolvedNodeId);
    }

    for (const candidate of activeEdgeCandidates) {
      const fromNodeId = resolveReferenceId(candidate.fromRef, resolvedNodeIds);
      const toNodeId = resolveReferenceId(candidate.toRef, resolvedNodeIds);
      if (!fromNodeId || !toNodeId) continue;

      const match = candidate.matchedEdgeId
        ? { matchStatus: "matched_existing" as const, matchedEdgeId: candidate.matchedEdgeId }
        : await matchEdgeCandidate(store, candidate.type, fromNodeId, toNodeId);

      if (match.matchedEdgeId) {
        const current = await store.getEdge(match.matchedEdgeId);
        await store.updateEdge(match.matchedEdgeId, {
          properties: candidate.properties,
          meta: proposedMeta(current?.meta, candidate.candidateId, candidate.provenance),
        });
        continue;
      }

      const edgeId = buildEdgeId(candidate.type, fromNodeId, toNodeId);
      const existingByGeneratedId = await store.getEdge(edgeId);
      if (existingByGeneratedId) {
        await store.updateEdge(edgeId, {
          properties: candidate.properties,
          meta: proposedMeta(existingByGeneratedId.meta, candidate.candidateId, candidate.provenance),
        });
        continue;
      }
      await store.createEdge(
        new ReviewGraphEdge(
          edgeId,
          candidate.type,
          fromNodeId,
          toNodeId,
          candidate.properties ?? {},
          proposedMeta(undefined, candidate.candidateId, candidate.provenance) as Record<string, unknown>
        )
      );
    }
  });

  const nextSession: EnrichmentReviewSession = {
    ...session,
    status: "applied",
    updatedAt: nowIso(),
    appliedAt: nowIso(),
    summary: "Enrichment candidates applied as proposed (pending admin review).",
  };
  await writeReviewSession(nextSession);
  return nextSession;
}

export function buildResearchPacket(session: EnrichmentReviewSession): ResearchPacket {
  if (session.researchPacket) {
    return session.researchPacket;
  }
  const applicableEntries =
    session.sourceReport?.entries.filter((entry) => entry.applicableTargetIds.length > 0) ?? [];
  const curatorEntries = applicableEntries.filter((entry) => entry.status === "ready_for_curator");

  return {
    sessionId: session.id,
    targets: session.targets,
    instructions: [
      "Use the enrichment-curator subagent.",
      "Prioritize the source catalog in docs/ENRICHMENT_SOURCES.md.",
      "Treat every applicable source in sourcePlan as required coverage for this run before broadening beyond the catalog.",
      "Use web search and Firecrawl only where they improve coverage or verification after the listed catalog sources have been checked.",
      "Treat every search as a full-ontology discovery pass and look for facts that can fill any supported entity type, not just the seed entity.",
      "Always gather broadly first, then map each fact to the best-fitting entity type and relationship in the graph.",
      curatorEntries.length > 0
        ? `Explicitly check every curator-required source in sourcePlan: ${curatorEntries.map((entry) => entry.id).join(", ")}.`
        : "All applicable catalog sources for this run were already available to the automated pipeline.",
      "Return one JSON bundle for this session with propertyChanges, nodeCandidates, and edgeCandidates.",
    ],
    ...(session.sourceReport ? { sourcePlan: session.sourceReport } : {}),
    ontology: buildResearchOntologyContext(),
    evidence: [],
  };
}
