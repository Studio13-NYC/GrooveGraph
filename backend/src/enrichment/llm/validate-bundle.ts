import { getPrimaryEntityLabel, normalizeEntityLabels, coerceArtistPersonIdentity } from "../../lib/entity-identity";
import { isEntityLabel } from "../../lib/entity-config";
import { isRelationshipType } from "../../lib/relationship-config";
import type {
  CandidateEdge,
  CandidateEvidence,
  CandidateNode,
  CandidateNodeReference,
  CandidatePropertyChange,
  CandidateProvenance,
  ConfidenceLevel,
  ResearchBundle,
  ResearchBundleMetadata,
  ResearchOntologyContext,
  ReviewDecisionStatus,
  ReviewTargetEntity,
  SourceMetadata,
} from "../types";

type ValidateOptions = {
  sessionId: string;
  targets: ReviewTargetEntity[];
  ontology: ResearchOntologyContext;
};

function sanitizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

function sanitizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

/** Extract candidateId from LLM output; accepts candidateId, id, candidate_id; coerces non-strings. */
function extractNodeCandidateId(candidate: Record<string, unknown>): string {
  const val = candidate.candidateId ?? candidate.id ?? (candidate as Record<string, unknown>).candidate_id;
  if (typeof val === "string") return val.trim();
  if (val != null && val !== "") return String(val).trim();
  return "";
}

/** Extract display name from LLM output; tries multiple keys and properties.name. */
function extractNodeName(candidate: Record<string, unknown>): string {
  const topLevel =
    candidate.name ??
    candidate.title ??
    (candidate as Record<string, unknown>).displayName ??
    (candidate as Record<string, unknown>).display_name;
  if (typeof topLevel === "string" && topLevel.trim()) return topLevel.trim();
  if (topLevel != null && topLevel !== "" && String(topLevel).trim())
    return String(topLevel).trim();
  const props = candidate.properties;
  if (props && typeof props === "object" && !Array.isArray(props)) {
    const p = props as Record<string, unknown>;
    const pVal = p.name ?? p.label ?? p.title;
    if (typeof pVal === "string" && pVal.trim()) return pVal.trim();
    if (pVal != null && pVal !== "" && String(pVal).trim())
      return String(pVal).trim();
  }
  const labelVal = candidate.label;
  if (typeof labelVal === "string" && labelVal.trim()) return labelVal.trim();
  if (labelVal != null && labelVal !== "" && String(labelVal).trim())
    return String(labelVal).trim();
  return "";
}

function sanitizeReviewStatus(value: unknown): ReviewDecisionStatus {
  return value === "approved" || value === "rejected" || value === "pending" ? value : "pending";
}

function sanitizeConfidence(value: unknown): ConfidenceLevel {
  return value === "high" || value === "low" || value === "medium" ? value : "medium";
}

function sanitizeSourceMetadata(value: unknown): SourceMetadata | null {
  const record = sanitizeRecord(value);
  const source_id = sanitizeString(record.source_id);
  const source_name = sanitizeString(record.source_name);
  const url = sanitizeString(record.url);
  if (!source_id || !source_name || !url) return null;
  const source_type =
    record.source_type === "api" ||
    record.source_type === "scrape" ||
    record.source_type === "bulk" ||
    record.source_type === "web_search"
      ? record.source_type
      : "web_search";
  const retrieved_at = sanitizeString(record.retrieved_at) || new Date().toISOString();
  return {
    source_id,
    source_name,
    source_type,
    url,
    retrieved_at,
    ...(sanitizeString(record.excerpt) ? { excerpt: sanitizeString(record.excerpt) } : {}),
    ...(sanitizeString(record.citation) ? { citation: sanitizeString(record.citation) } : {}),
  };
}

function sanitizeProvenanceList(value: unknown, confidence: ConfidenceLevel): CandidateProvenance[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const source = sanitizeSourceMetadata(item);
      if (!source) return null;
      const record = sanitizeRecord(item);
      return {
        ...source,
        confidence: sanitizeConfidence(record.confidence ?? confidence),
        ...(sanitizeString(record.notes) ? { notes: sanitizeString(record.notes) } : {}),
      };
    })
    .filter((item): item is CandidateProvenance => item !== null);
}

function sanitizeEvidenceList(value: unknown, confidence: ConfidenceLevel): CandidateEvidence[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const source = sanitizeSourceMetadata(item);
      if (!source) return null;
      const record = sanitizeRecord(item);
      return {
        ...source,
        confidence: sanitizeConfidence(record.confidence ?? confidence),
        ...(sanitizeString(record.evidenceId) ? { evidenceId: sanitizeString(record.evidenceId) } : {}),
        ...(sanitizeString(record.notes) ? { notes: sanitizeString(record.notes) } : {}),
        ...(record.structuredFacts && typeof record.structuredFacts === "object" && !Array.isArray(record.structuredFacts)
          ? { structuredFacts: sanitizeRecord(record.structuredFacts) }
          : {}),
      };
    })
    .filter((item): item is CandidateEvidence => item !== null);
}

function deriveProvenanceFromEvidence(evidence: CandidateEvidence[]): CandidateProvenance[] {
  return evidence.map((item) => ({
    source_id: item.source_id,
    source_name: item.source_name,
    source_type: item.source_type,
    url: item.url,
    retrieved_at: item.retrieved_at,
    ...(item.excerpt ? { excerpt: item.excerpt } : {}),
    ...(item.citation ? { citation: item.citation } : {}),
    confidence: item.confidence,
    ...(item.notes ? { notes: item.notes } : {}),
  }));
}

/** Map common LLM label synonyms to ontology entity labels (e.g. Song/song → Track). */
const LABEL_SYNONYMS: Record<string, string> = {
  song: "Track",
};

function toCanonicalEntityLabel(raw: string, allowed: Set<string>): string | null {
  if (allowed.has(raw)) return raw;
  const lower = raw.toLowerCase();
  const synonym = LABEL_SYNONYMS[lower];
  if (synonym && allowed.has(synonym)) return synonym;
  for (const a of allowed) {
    if (a.toLowerCase() === lower) return a;
  }
  return null;
}

function normalizeCandidateLabels(
  label: string,
  labels: unknown,
  ontology: ResearchOntologyContext
): { label: string; labels: string[] } {
  const candidateLabels = Array.isArray(labels)
    ? labels.map((item) => sanitizeString(item)).filter(Boolean)
    : label
      ? [sanitizeString(label)].filter(Boolean)
      : [];
  const withSynonyms = candidateLabels.map((l) => LABEL_SYNONYMS[l.trim().toLowerCase()] ?? l.trim());
  const rawNormalized = coerceArtistPersonIdentity(normalizeEntityLabels(withSynonyms));
  const allowed = new Set(ontology.allowedEntityLabels);
  const forbidden = new Set(ontology.syntheticLabels);
  const normalized = rawNormalized
    .map((item) => toCanonicalEntityLabel(item, allowed))
    .filter((item): item is string => item !== null);
  if (normalized.length === 0 || normalized.some((item) => forbidden.has(item) || !isEntityLabel(item))) {
    throw new Error(`Invalid candidate node labels: ${rawNormalized.join(", ") || "(empty)"}`);
  }
  return {
    label: getPrimaryEntityLabel(normalized),
    labels: normalized,
  };
}

/** Normalize an id for fuzzy matching (lowercase, collapse non-alphanumeric to single hyphen). */
function normalizeIdForMatch(id: string): string {
  return id
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Resolve edge reference id to a known candidate/target id when exact match fails.
 * Uses normalized form so LLM output like "Moving Canvas" or "album-Wild Wood" can match "track-moving-canvas" / "album-wild-wood".
 */
function resolveEdgeReferenceId(
  id: string,
  knownIds: Set<string>,
  normalizedToCanonical: Map<string, string>
): string | undefined {
  if (knownIds.has(id)) return id;
  const normalized = normalizeIdForMatch(id);
  if (!normalized) return undefined;
  const canonical = normalizedToCanonical.get(normalized);
  if (canonical) return canonical;
  return undefined;
}

function sanitizeReference(
  value: unknown,
  knownCandidateIds: Set<string>,
  options?: { normalizedToCanonical?: Map<string, string> }
): CandidateNodeReference {
  const record = sanitizeRecord(value);
  const rawId = sanitizeString(record.id);
  if (!rawId) {
    throw new Error("Candidate reference id is required.");
  }
  const resolvedId =
    options?.normalizedToCanonical != null
      ? resolveEdgeReferenceId(rawId, knownCandidateIds, options.normalizedToCanonical)
      : knownCandidateIds.has(rawId)
        ? rawId
        : undefined;
  const id = resolvedId ?? rawId;
  const kind =
    record.kind === "target" || record.kind === "candidate" || record.kind === "existing"
      ? record.kind
      : knownCandidateIds.has(id) || resolvedId != null
        ? "candidate"
        : "existing";
  if (kind === "candidate" && !knownCandidateIds.has(id) && resolvedId == null) {
    throw new Error(`Candidate reference ${rawId} does not match a node candidate.`);
  }
  return {
    kind,
    id: resolvedId ?? id,
    ...(sanitizeString(record.label) ? { label: sanitizeString(record.label) } : {}),
    ...(sanitizeString(record.name) ? { name: sanitizeString(record.name) } : {}),
  };
}

function sanitizeMetadata(value: unknown): ResearchBundleMetadata | undefined {
  const record = sanitizeRecord(value);
  const generator = record.generator;
  if (generator !== "llm" && generator !== "deterministic" && generator !== "manual") {
    return undefined;
  }
  return {
    generator,
    ...(sanitizeString(record.provider) ? { provider: sanitizeString(record.provider) } : {}),
    ...(sanitizeString(record.model) ? { model: sanitizeString(record.model) } : {}),
    ...(sanitizeString(record.promptVersion) ? { promptVersion: sanitizeString(record.promptVersion) } : {}),
    ...(typeof record.evidenceRecordCount === "number" ? { evidenceRecordCount: record.evidenceRecordCount } : {}),
    ...(typeof record.sourceCount === "number" ? { sourceCount: record.sourceCount } : {}),
    ...(sanitizeString(record.notes) ? { notes: sanitizeString(record.notes) } : {}),
  };
}

export function validateResearchBundle(value: unknown, options: ValidateOptions): ResearchBundle {
  const record = sanitizeRecord(value);
  const sessionId = sanitizeString(record.sessionId);
  if (!sessionId || sessionId !== options.sessionId) {
    throw new Error("Research bundle sessionId does not match the target session.");
  }

  const targetIds = new Set(options.targets.map((target) => target.id));
  const targets = (Array.isArray(record.targets) ? record.targets : options.targets)
    .map((item) => sanitizeRecord(item))
    .map((item) => ({
      id: sanitizeString(item.id),
      label: sanitizeString(item.label),
      name: sanitizeString(item.name),
    }))
    .filter((item) => item.id && item.label && item.name);

  const nodeCandidatesRaw = Array.isArray(record.nodeCandidates) ? record.nodeCandidates : [];
  // #region agent log
  if (nodeCandidatesRaw.length > 0) {
    const first = nodeCandidatesRaw[0];
    const firstRecord = first && typeof first === "object" && !Array.isArray(first) ? (first as Record<string, unknown>) : {};
    fetch("http://127.0.0.1:7290/ingest/d02d8ae0-2fcc-4270-9ab1-7e7cc64f475b", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e8d527" },
      body: JSON.stringify({
        sessionId: "e8d527",
        runId: "validate-bundle",
        hypothesisId: "H5",
        location: "validate-bundle.ts:nodeCandidates:first",
        message: "First node candidate raw shape",
        data: {
          nodeCandidatesLength: nodeCandidatesRaw.length,
          firstKeys: Object.keys(firstRecord),
          firstCandidateIdRaw: firstRecord.candidateId,
          firstCandidateIdType: typeof firstRecord.candidateId,
          firstNameRaw: firstRecord.name,
          firstNameType: typeof firstRecord.name,
          firstIdRaw: firstRecord.id,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion
  const nodeCandidates = nodeCandidatesRaw.map((item, index) => {
    const candidate = sanitizeRecord(item);
    const candidateId = extractNodeCandidateId(candidate);
    const name = extractNodeName(candidate);
    if (!candidateId || !name) {
      // #region agent log
      fetch("http://127.0.0.1:7290/ingest/d02d8ae0-2fcc-4270-9ab1-7e7cc64f475b", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e8d527" },
        body: JSON.stringify({
          sessionId: "e8d527",
          runId: "validate-bundle",
          hypothesisId: "H1-H4",
          location: "validate-bundle.ts:nodeCandidates:fail",
          message: "Candidate node requires candidateId and name",
          data: {
            index,
            candidateKeys: Object.keys(candidate),
            candidateIdRaw: candidate.candidateId,
            candidateIdType: typeof candidate.candidateId,
            nameRaw: candidate.name,
            nameType: typeof candidate.name,
            candidateIdAfterSanitize: candidateId,
            nameAfterSanitize: name,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw new Error("Candidate node requires candidateId and name.");
    }
    const confidence = sanitizeConfidence(candidate.confidence);
    const evidence = sanitizeEvidenceList(candidate.evidence, confidence);
    const provenance = sanitizeProvenanceList(candidate.provenance, confidence);
    const normalizedProvenance = provenance.length > 0 ? provenance : deriveProvenanceFromEvidence(evidence);
    if (normalizedProvenance.length === 0) {
      throw new Error(`Candidate node ${candidateId} is missing provenance.`);
    }
    const normalizedLabels = normalizeCandidateLabels(sanitizeString(candidate.label), candidate.labels, options.ontology);
    return {
      candidateId,
      label: normalizedLabels.label,
      labels: normalizedLabels.labels,
      name,
      canonicalKey: sanitizeString(candidate.canonicalKey) || `${normalizedLabels.label.toLowerCase()}:${name.toLowerCase()}`,
      properties: sanitizeRecord(candidate.properties),
      ...(candidate.externalIds && typeof candidate.externalIds === "object" && !Array.isArray(candidate.externalIds)
        ? { externalIds: Object.fromEntries(Object.entries(sanitizeRecord(candidate.externalIds)).map(([key, raw]) => [key, sanitizeString(raw)]).filter(([, raw]) => raw)) }
        : {}),
      ...(Array.isArray(candidate.aliases)
        ? { aliases: candidate.aliases.map((alias) => sanitizeString(alias)).filter(Boolean) }
        : {}),
      confidence,
      provenance: normalizedProvenance,
      ...(evidence.length > 0 ? { evidence } : {}),
      matchStatus:
        candidate.matchStatus === "matched_existing" ||
        candidate.matchStatus === "create_new" ||
        candidate.matchStatus === "ambiguous"
          ? candidate.matchStatus
          : "create_new",
      ...(sanitizeString(candidate.matchedNodeId) ? { matchedNodeId: sanitizeString(candidate.matchedNodeId) } : {}),
      reviewStatus: sanitizeReviewStatus(candidate.reviewStatus),
      ...(sanitizeString(candidate.notes) ? { notes: sanitizeString(candidate.notes) } : {}),
      ...(sanitizeString(candidate.justification) ? { justification: sanitizeString(candidate.justification) } : {}),
    } satisfies CandidateNode;
  });

  const nodeCandidateIds = new Set(nodeCandidates.map((item) => item.candidateId));
  const edgeKnownIds = new Set<string>([...nodeCandidateIds, ...targetIds]);
  const normalizedToCanonical = new Map<string, string>();
  for (const cid of nodeCandidateIds) {
    const n = normalizeIdForMatch(cid);
    if (n && !normalizedToCanonical.has(n)) normalizedToCanonical.set(n, cid);
    const suffix = cid.includes("-") ? cid.slice(cid.indexOf("-") + 1) : cid;
    const nSuffix = normalizeIdForMatch(suffix);
    if (nSuffix && !normalizedToCanonical.has(nSuffix)) normalizedToCanonical.set(nSuffix, cid);
  }
  const edgeRefOptions = { normalizedToCanonical };

  const propertyChanges = (Array.isArray(record.propertyChanges) ? record.propertyChanges : [])
    .map((item) => {
      const change = sanitizeRecord(item);
      const candidateId =
        sanitizeString(change.candidateId) ||
        sanitizeString(change.id) ||
        (change.id != null && change.id !== "" ? String(change.id).trim() : "");
      const targetId = sanitizeString(change.targetId);
      const key = sanitizeString(change.key);
      if (!candidateId || !targetId || !key || !targetIds.has(targetId)) {
        return null;
      }
    const confidence = sanitizeConfidence(change.confidence);
    const evidence = sanitizeEvidenceList(change.evidence, confidence);
    const provenance = sanitizeProvenanceList(change.provenance, confidence);
    const normalizedProvenance = provenance.length > 0 ? provenance : deriveProvenanceFromEvidence(evidence);
    if (normalizedProvenance.length === 0) {
      throw new Error(`Candidate property change ${candidateId} is missing provenance.`);
    }
    return {
      candidateId,
      targetId,
      key,
      value: change.value,
      ...(change.previousValue !== undefined ? { previousValue: change.previousValue } : {}),
      confidence,
      provenance: normalizedProvenance,
      ...(evidence.length > 0 ? { evidence } : {}),
      matchStatus: "updates_existing_target",
      reviewStatus: sanitizeReviewStatus(change.reviewStatus),
      ...(sanitizeString(change.notes) ? { notes: sanitizeString(change.notes) } : {}),
      ...(sanitizeString(change.justification) ? { justification: sanitizeString(change.justification) } : {}),
    } satisfies CandidatePropertyChange;
  })
    .filter((item): item is CandidatePropertyChange => item !== null);

  const edgeCandidates = (Array.isArray(record.edgeCandidates) ? record.edgeCandidates : [])
    .map((item): CandidateEdge | null => {
      try {
        const candidate = sanitizeRecord(item);
        const candidateId = sanitizeString(candidate.candidateId);
        const type = sanitizeString(candidate.type);
        if (!candidateId || !type || !isRelationshipType(type) || options.ontology.syntheticRelationshipTypes.includes(type)) {
          throw new Error(`Invalid candidate edge type: ${type || "(empty)"}`);
        }
        const confidence = sanitizeConfidence(candidate.confidence);
        const evidence = sanitizeEvidenceList(candidate.evidence, confidence);
        const provenance = sanitizeProvenanceList(candidate.provenance, confidence);
        const normalizedProvenance = provenance.length > 0 ? provenance : deriveProvenanceFromEvidence(evidence);
        if (normalizedProvenance.length === 0) {
          throw new Error(`Candidate edge ${candidateId} is missing provenance.`);
        }
        return {
          candidateId,
          type,
          fromRef: sanitizeReference(candidate.fromRef, edgeKnownIds, edgeRefOptions),
          toRef: sanitizeReference(candidate.toRef, edgeKnownIds, edgeRefOptions),
          ...(candidate.properties && typeof candidate.properties === "object" && !Array.isArray(candidate.properties)
            ? { properties: sanitizeRecord(candidate.properties) }
            : {}),
          confidence,
          provenance: normalizedProvenance,
          ...(evidence.length > 0 ? { evidence } : {}),
          matchStatus:
            candidate.matchStatus === "matched_existing" ||
            candidate.matchStatus === "create_new" ||
            candidate.matchStatus === "ambiguous"
              ? candidate.matchStatus
              : "create_new",
          ...(sanitizeString(candidate.matchedEdgeId) ? { matchedEdgeId: sanitizeString(candidate.matchedEdgeId) } : {}),
          reviewStatus: sanitizeReviewStatus(candidate.reviewStatus),
          ...(sanitizeString(candidate.notes) ? { notes: sanitizeString(candidate.notes) } : {}),
          ...(sanitizeString(candidate.justification) ? { justification: sanitizeString(candidate.justification) } : {}),
        } satisfies CandidateEdge;
      } catch {
        return null;
      }
    })
    .filter((item): item is CandidateEdge => item !== null);

  return {
    sessionId,
    generatedAt: sanitizeString(record.generatedAt) || new Date().toISOString(),
    ...(sanitizeString(record.summary) ? { summary: sanitizeString(record.summary) } : {}),
    targets: targets.length > 0 ? targets : options.targets,
    propertyChanges,
    nodeCandidates,
    edgeCandidates,
    ...(sanitizeMetadata(record.metadata) ? { metadata: sanitizeMetadata(record.metadata) } : {}),
  };
}
