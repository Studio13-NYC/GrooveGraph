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
  url: string;
  retrieved_at: string;
  excerpt?: string;
  confidence: ConfidenceLevel;
  relatedNodes?: EnrichmentNodeMutation[];
  relatedEdges?: EnrichmentEdgeMutation[];
}
