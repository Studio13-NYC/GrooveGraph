export type StageName =
  | "question"
  | "graph_context"
  | "query_planning"
  | "evidence"
  | "extract"
  | "review"
  | "persistence_plan"
  | "typedb_write"
  | "graph_delta";

export type RunStatus = "completed" | "completed_with_warnings" | "failed";

export type GraphNodeStatus = "existing" | "draft_added" | "candidate_rejected" | "candidate_unpersisted";

export interface RunArtifact {
  run_id: string;
  stage: StageName;
  status: "ok" | "warning" | "error" | "blocked";
  started_at: string;
  ended_at: string;
  input_sample: unknown;
  output_sample: unknown;
  counts: Record<string, number>;
  warnings: string[];
  errors: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  status: GraphNodeStatus;
  source_flags: string[];
  degree_hint: number;
  metadata_preview: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  status: GraphNodeStatus;
  provenance_hint: string;
}

export interface GraphView {
  nodes: GraphNode[];
  edges: GraphEdge[];
  view: {
    focal_ids: string[];
    filters: string[];
    legend: Array<{ key: GraphNodeStatus; label: string }>;
    counts: Record<string, number>;
  };
}

export interface RunRecord {
  runId: string;
  question: string;
  status: RunStatus;
  summary: string;
  artifacts: RunArtifact[];
  graph: GraphView;
}
