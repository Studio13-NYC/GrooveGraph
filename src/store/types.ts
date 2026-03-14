/**
 * Types for the GraphStore port (see docs/STORAGE_ABSTRACTION.md).
 */
import type { GraphNode } from "../domain/GraphNode";
import type { GraphEdge } from "../domain/GraphEdge";

export type Direction = "inbound" | "outbound" | "both";

export interface NodePatch {
  labels?: string[];
  properties?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface EdgePatch {
  properties?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface NodeQuery {
  label?: string;
  /** Filter by property key (and optionally value). */
  propertyKey?: string;
  propertyValue?: unknown;
  maxResults?: number;
}

export interface EdgeQuery {
  type?: string;
  fromNodeId?: string;
  toNodeId?: string;
  maxResults?: number;
}

export interface DeleteNodeOptions {
  /** If true, delete incident edges; if false, reject when edges exist. */
  cascade?: boolean;
}

export interface GraphStore {
  createNode(node: GraphNode): Promise<void>;
  updateNode(nodeId: string, patch: NodePatch): Promise<GraphNode>;
  deleteNode(nodeId: string, options?: DeleteNodeOptions): Promise<void>;
  getNode(nodeId: string): Promise<GraphNode | null>;
  findNodes(query: NodeQuery): Promise<GraphNode[]>;

  createEdge(edge: GraphEdge): Promise<void>;
  updateEdge(edgeId: string, patch: EdgePatch): Promise<GraphEdge>;
  deleteEdge(edgeId: string): Promise<void>;
  getEdge(edgeId: string): Promise<GraphEdge | null>;
  findEdges(query: EdgeQuery): Promise<GraphEdge[]>;

  getAdjacentEdges(nodeId: string, direction: Direction): Promise<GraphEdge[]>;

  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}
