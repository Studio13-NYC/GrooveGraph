/**
 * Convert between ExtractionIR and ResearchBundle (Phase 2). Allows adapters to
 * produce IR and the existing review pipeline to consume a bundle. Applies
 * ontology normalization (Phase 3) before building the bundle.
 */

import type {
  CandidateEdge,
  CandidateNode,
  CandidateNodeReference,
  CandidateProvenance,
  ConfidenceLevel,
  ExtractionIR,
  ExtractionMention,
  ExtractionRelation,
  ResearchBundle,
  ResearchBundleMetadata,
  ResearchOntologyContext,
  ReviewTargetEntity,
} from "../types";
import { normalizeExtractionIR } from "./ontology-normalize-ir.js";

const DEFAULT_IR_PROVENANCE: CandidateProvenance = {
  source_id: "extraction-ir",
  source_name: "Extraction IR",
  source_type: "api",
  url: "about:extraction-ir",
  retrieved_at: new Date().toISOString(),
  confidence: "medium",
};

function mentionToNodeCandidate(
  mention: ExtractionMention,
  provenance: CandidateProvenance = DEFAULT_IR_PROVENANCE
): CandidateNode {
  const confidence: ConfidenceLevel = mention.confidence ?? "medium";
  const canonicalKey =
    mention.canonicalKey ??
    (mention.text.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 120) ||
      mention.id);
  const notes =
    mention.needsDisambiguation
      ? "Label inferred or low confidence; may need disambiguation."
      : undefined;
  return {
    candidateId: mention.id,
    label: mention.label,
    name: mention.text,
    canonicalKey,
    properties: {},
    confidence,
    provenance: [provenance],
    matchStatus: "create_new",
    reviewStatus: "pending",
    ...(notes ? { notes } : {}),
  };
}

function relationToEdgeCandidate(
  relation: ExtractionRelation,
  mentionIds: Set<string>,
  targetIds: Set<string>,
  provenance: CandidateProvenance = DEFAULT_IR_PROVENANCE
): CandidateEdge {
  const fromKind: CandidateNodeReference["kind"] = targetIds.has(relation.fromMentionId)
    ? "target"
    : mentionIds.has(relation.fromMentionId)
      ? "candidate"
      : "existing";
  const toKind: CandidateNodeReference["kind"] = targetIds.has(relation.toMentionId)
    ? "target"
    : mentionIds.has(relation.toMentionId)
      ? "candidate"
      : "existing";
  const confidence: ConfidenceLevel = relation.confidence ?? "medium";
  return {
    candidateId: relation.id,
    type: relation.type,
    fromRef: { kind: fromKind, id: relation.fromMentionId },
    toRef: { kind: toKind, id: relation.toMentionId },
    confidence,
    provenance: [provenance],
    matchStatus: "create_new",
    reviewStatus: "pending",
  };
}

/**
 * Build a ResearchBundle from ExtractionIR. Applies ontology normalization first,
 * then maps mentions (excluding targets) to node candidates and relations to edge candidates.
 */
export function irToResearchBundle(
  ir: ExtractionIR,
  sessionId: string,
  targets: ReviewTargetEntity[],
  ontology: ResearchOntologyContext,
  options?: {
    generatedAt?: string;
    metadata?: ResearchBundleMetadata;
    summary?: string;
  }
): ResearchBundle {
  const normalized = normalizeExtractionIR(ir, ontology);
  const targetIds = new Set(targets.map((t) => t.id));
  const mentionIds = new Set(normalized.mentions.map((m) => m.id));
  const candidateMentions = normalized.mentions.filter((m) => !targetIds.has(m.id));

  const nodeCandidates: CandidateNode[] = candidateMentions.map((m) =>
    mentionToNodeCandidate(m)
  );
  const edgeCandidates: CandidateEdge[] = normalized.relations.map((r) =>
    relationToEdgeCandidate(r, mentionIds, targetIds)
  );

  return {
    sessionId,
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    summary: options?.summary,
    targets,
    propertyChanges: [],
    nodeCandidates,
    edgeCandidates,
    metadata: options?.metadata,
  };
}

/**
 * Convert a ResearchBundle into ExtractionIR. Used so bundle-producing flows
 * (e.g. triplet pipeline) can be exposed as IR producers.
 */
export function bundleToIR(bundle: ResearchBundle): ExtractionIR {
  const mentions: ExtractionMention[] = [
    ...bundle.targets.map((t) => ({
      id: t.id,
      text: t.name,
      label: t.label,
      confidence: "high" as ConfidenceLevel,
    })),
    ...bundle.nodeCandidates.map((n) => ({
      id: n.candidateId,
      text: n.name,
      label: n.label,
      confidence: (n.confidence ?? "medium") as ConfidenceLevel,
      sourceId: n.provenance?.[0]?.source_id,
    })),
  ];
  const relations: ExtractionRelation[] = bundle.edgeCandidates.map((e) => ({
    id: e.candidateId,
    type: e.type,
    fromMentionId: e.fromRef.id,
    toMentionId: e.toRef.id,
    confidence: (e.confidence ?? "medium") as ConfidenceLevel,
    sourceId: e.provenance?.[0]?.source_id,
  }));
  return { mentions, relations };
}
