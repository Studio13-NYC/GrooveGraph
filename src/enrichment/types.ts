/**
 * Types for the enrichment pipeline: collect → verify → load.
 */

export interface SourceMetadata {
  source_id: string;
  source_name: string;
  source_type: "api" | "scrape" | "bulk" | "web_search";
  url: string;
  retrieved_at: string; // ISO
  excerpt?: string;
  citation?: string;
}

export interface EnrichmentNodeMutation {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface EnrichmentEdgeMutation {
  id: string;
  type: string;
  fromNodeId: string;
  toNodeId: string;
  properties?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface PersistedPropertyChange {
  key: string;
  value: unknown;
  action: "created" | "updated";
  targetId: string;
  targetLabel: string;
}

export interface PersistedNodeChange {
  id: string;
  label: string;
  name: string;
  action: "created" | "matched_existing" | "updated_existing";
  changedProperties: string[];
}

export interface PersistedEdgeChange {
  id: string;
  type: string;
  fromNodeId: string;
  toNodeId: string;
  fromName: string;
  toName: string;
  action: "created" | "matched_existing" | "updated_existing";
  changedProperties: string[];
}

/** Raw payload from an adapter; shape depends on source. */
export interface RawEnrichmentPayload {
  /** Source metadata for provenance. */
  source: SourceMetadata;
  /** Key-value pairs that may be mapped to domain properties (e.g. biography, country). */
  properties: Record<string, unknown>;
  /** Display name or title from the source (for entity match). */
  sourceDisplayName?: string;
  /** Optional structural graph additions aligned to the domain model. */
  relatedNodes?: EnrichmentNodeMutation[];
  relatedEdges?: EnrichmentEdgeMutation[];
}

export type ConfidenceLevel = "high" | "medium" | "low";

export interface VerifiedEnrichmentRecord {
  /** Normalized properties aligned to DOMAIN_MODEL (snake_case). */
  properties: Record<string, unknown>;
  /** Provenance. */
  source_id: string;
  source_name: string;
  source_type: SourceMetadata["source_type"];
  url: string;
  retrieved_at: string;
  excerpt?: string;
  confidence: ConfidenceLevel;
  relatedNodes?: EnrichmentNodeMutation[];
  relatedEdges?: EnrichmentEdgeMutation[];
}

export type ReviewSessionStatus = "draft" | "ready_for_import" | "ready_for_review" | "applied";

export type ReviewDecisionStatus = "pending" | "approved" | "rejected";

export type CandidateMatchStatus =
  | "updates_existing_target"
  | "matched_existing"
  | "create_new"
  | "ambiguous";

export interface CandidateProvenance extends SourceMetadata {
  confidence: ConfidenceLevel;
  notes?: string;
}

export interface ReviewTargetEntity {
  id: string;
  label: string;
  name: string;
}

export interface CandidatePropertyChange {
  candidateId: string;
  targetId: string;
  key: string;
  value: unknown;
  previousValue?: unknown;
  confidence: ConfidenceLevel;
  provenance: CandidateProvenance[];
  matchStatus: "updates_existing_target";
  reviewStatus: ReviewDecisionStatus;
  notes?: string;
}

export interface CandidateNode {
  candidateId: string;
  label: string;
  name: string;
  canonicalKey: string;
  properties: Record<string, unknown>;
  externalIds?: Record<string, string>;
  aliases?: string[];
  confidence: ConfidenceLevel;
  provenance: CandidateProvenance[];
  matchStatus: CandidateMatchStatus;
  matchedNodeId?: string;
  reviewStatus: ReviewDecisionStatus;
  notes?: string;
}

export interface CandidateNodeReference {
  kind: "target" | "candidate" | "existing";
  id: string;
  label?: string;
  name?: string;
}

export interface CandidateEdge {
  candidateId: string;
  type: string;
  fromRef: CandidateNodeReference;
  toRef: CandidateNodeReference;
  properties?: Record<string, unknown>;
  confidence: ConfidenceLevel;
  provenance: CandidateProvenance[];
  matchStatus: Exclude<CandidateMatchStatus, "updates_existing_target">;
  matchedEdgeId?: string;
  reviewStatus: ReviewDecisionStatus;
  notes?: string;
}

export interface ResearchBundle {
  sessionId: string;
  generatedAt: string;
  summary?: string;
  targets: ReviewTargetEntity[];
  propertyChanges: CandidatePropertyChange[];
  nodeCandidates: CandidateNode[];
  edgeCandidates: CandidateEdge[];
}

export type SourceExecutionMode = "automated" | "curator";
export type SourceRuntimeRoute = "api" | "firecrawl";

export type SourceRunStatus =
  | "checked_used"
  | "checked_no_result"
  | "ready_for_curator"
  | "out_of_scope";

export interface SourceRunEntry {
  id: string;
  name: string;
  type: string;
  method: SourceMetadata["source_type"];
  baseUrl?: string;
  entityTypes: string[];
  executionMode: SourceExecutionMode;
  applicableTargetIds: string[];
  status: SourceRunStatus;
  effectiveRoute?: SourceRuntimeRoute;
}

export interface SourceRunReport {
  totalSources: number;
  inScopeCount: number;
  checkedCount: number;
  usedCount: number;
  automatedReadyCount: number;
  curatorReadyCount: number;
  outOfScopeCount: number;
  entries: SourceRunEntry[];
}

export interface ResearchPacket {
  sessionId: string;
  targets: ReviewTargetEntity[];
  instructions: string[];
  sourcePlan?: SourceRunReport;
}

export interface EnrichmentReviewSession {
  id: string;
  status: ReviewSessionStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  importedAt?: string;
  appliedAt?: string;
  summary?: string;
  targets: ReviewTargetEntity[];
  propertyChanges: CandidatePropertyChange[];
  nodeCandidates: CandidateNode[];
  edgeCandidates: CandidateEdge[];
  sourceReport?: SourceRunReport;
  importMetadata?: {
    generatedAt?: string;
    importedFrom?: string;
  };
}

export interface ReviewDecision {
  candidateType: "property" | "node" | "edge";
  candidateId: string;
  reviewStatus: ReviewDecisionStatus;
}
