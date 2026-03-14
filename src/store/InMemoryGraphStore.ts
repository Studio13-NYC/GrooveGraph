/**
 * In-memory implementation of GraphStore. See docs/STORAGE_ABSTRACTION.md §4.
 * O(1) ID lookups; label index and adjacency for traversal.
 */
import { GraphNode } from "../domain/GraphNode";
import { GraphEdge } from "../domain/GraphEdge";
import { normalizeEntityLabels } from "../lib/entity-identity";
import { isTypeHubNodeLabels, reconcileTypeHubLinksForNode } from "../lib/type-hubs";
import type {
  GraphStore,
  NodePatch,
  EdgePatch,
  NodeQuery,
  EdgeQuery,
  Direction,
  DeleteNodeOptions,
} from "./types";

type NodeRecord = {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

type EdgeRecord = {
  id: string;
  type: string;
  fromNodeId: string;
  toNodeId: string;
  properties: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

class StoredNode extends GraphNode {
  constructor(
    id: string,
    labels: string[],
    properties: Record<string, unknown>,
    meta?: Record<string, unknown>
  ) {
    super(id, labels, properties, meta);
  }
}

class StoredEdge extends GraphEdge {
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

export class InMemoryGraphStore implements GraphStore {
  private nodes = new Map<string, NodeRecord>();
  private edges = new Map<string, EdgeRecord>();
  private labelIndex = new Map<string, Set<string>>();
  private outbound = new Map<string, string[]>();
  private inbound = new Map<string, string[]>();

  private indexNode(record: NodeRecord): void {
    for (const label of record.labels) {
      let set = this.labelIndex.get(label);
      if (!set) {
        set = new Set<string>();
        this.labelIndex.set(label, set);
      }
      set.add(record.id);
    }
  }

  private unindexNode(record: NodeRecord): void {
    for (const label of record.labels) {
      const set = this.labelIndex.get(label);
      if (set) {
        set.delete(record.id);
        if (set.size === 0) this.labelIndex.delete(label);
      }
    }
  }

  private indexEdge(record: EdgeRecord): void {
    let out = this.outbound.get(record.fromNodeId);
    if (!out) {
      out = [];
      this.outbound.set(record.fromNodeId, out);
    }
    out.push(record.id);
    let inb = this.inbound.get(record.toNodeId);
    if (!inb) {
      inb = [];
      this.inbound.set(record.toNodeId, inb);
    }
    inb.push(record.id);
  }

  private unindexEdge(record: EdgeRecord): void {
    const out = this.outbound.get(record.fromNodeId);
    if (out) {
      const i = out.indexOf(record.id);
      if (i >= 0) out.splice(i, 1);
      if (out.length === 0) this.outbound.delete(record.fromNodeId);
    }
    const inb = this.inbound.get(record.toNodeId);
    if (inb) {
      const i = inb.indexOf(record.id);
      if (i >= 0) inb.splice(i, 1);
      if (inb.length === 0) this.inbound.delete(record.toNodeId);
    }
  }

  async createNode(node: GraphNode): Promise<void> {
    if (this.nodes.has(node.id)) {
      throw new Error(`Node already exists: ${node.id}`);
    }
    const record: NodeRecord = {
      id: node.id,
      labels: normalizeEntityLabels(node.labels),
      properties: { ...node.properties },
      meta: node.meta ? { ...node.meta } : undefined,
    };
    this.nodes.set(node.id, record);
    this.indexNode(record);
    if (!isTypeHubNodeLabels(record.labels)) {
      await reconcileTypeHubLinksForNode(this, node.id);
    }
  }

  async updateNode(nodeId: string, patch: NodePatch): Promise<GraphNode> {
    const record = this.nodes.get(nodeId);
    if (!record) throw new Error(`Node not found: ${nodeId}`);
    this.unindexNode(record);
    if (patch.labels !== undefined) record.labels = normalizeEntityLabels(patch.labels);
    if (patch.properties !== undefined) record.properties = { ...record.properties, ...patch.properties };
    if (patch.meta !== undefined) record.meta = { ...patch.meta };
    this.indexNode(record);
    if (!isTypeHubNodeLabels(record.labels)) {
      await reconcileTypeHubLinksForNode(this, nodeId);
    }
    return new StoredNode(record.id, record.labels, record.properties, record.meta);
  }

  async deleteNode(nodeId: string, options?: DeleteNodeOptions): Promise<void> {
    const record = this.nodes.get(nodeId);
    if (!record) throw new Error(`Node not found: ${nodeId}`);
    const outIds = [...(this.outbound.get(nodeId) ?? [])];
    const inIds = [...(this.inbound.get(nodeId) ?? [])];
    if (outIds.length > 0 || inIds.length > 0) {
      if (options?.cascade) {
        for (const eid of outIds) {
          const er = this.edges.get(eid);
          if (er) {
            this.unindexEdge(er);
            this.edges.delete(eid);
          }
        }
        for (const eid of inIds) {
          const er = this.edges.get(eid);
          if (er) {
            this.unindexEdge(er);
            this.edges.delete(eid);
          }
        }
      } else {
        throw new Error(`Cannot delete node ${nodeId}: has ${outIds.length + inIds.length} incident edges (use cascade)`);
      }
    }
    this.unindexNode(record);
    this.nodes.delete(nodeId);
    this.outbound.delete(nodeId);
    this.inbound.delete(nodeId);
  }

  async getNode(nodeId: string): Promise<GraphNode | null> {
    const record = this.nodes.get(nodeId);
    if (!record) return null;
    return new StoredNode(record.id, record.labels, record.properties, record.meta);
  }

  async findNodes(query: NodeQuery): Promise<GraphNode[]> {
    let ids: Iterable<string>;
    if (query.label) {
      ids = this.labelIndex.get(query.label) ?? [];
    } else {
      ids = this.nodes.keys();
    }
    const results: GraphNode[] = [];
    const max = query.maxResults ?? 1000;
    for (const id of ids) {
      if (results.length >= max) break;
      const record = this.nodes.get(id)!;
      if (query.propertyKey !== undefined) {
        const v = record.properties[query.propertyKey];
        if (query.propertyValue !== undefined && v !== query.propertyValue) continue;
        if (query.propertyValue === undefined && (v === undefined || v === null)) continue;
      }
      results.push(new StoredNode(record.id, record.labels, record.properties, record.meta));
    }
    return results;
  }

  async createEdge(edge: GraphEdge): Promise<void> {
    if (this.edges.has(edge.id)) throw new Error(`Edge already exists: ${edge.id}`);
    if (!this.nodes.has(edge.fromNodeId)) throw new Error(`Missing fromNode: ${edge.fromNodeId}`);
    if (!this.nodes.has(edge.toNodeId)) throw new Error(`Missing toNode: ${edge.toNodeId}`);
    const record: EdgeRecord = {
      id: edge.id,
      type: edge.type,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      properties: { ...edge.properties },
      meta: edge.meta ? { ...edge.meta } : undefined,
    };
    this.edges.set(edge.id, record);
    this.indexEdge(record);
  }

  async updateEdge(edgeId: string, patch: EdgePatch): Promise<GraphEdge> {
    const record = this.edges.get(edgeId);
    if (!record) throw new Error(`Edge not found: ${edgeId}`);
    if (patch.properties !== undefined) record.properties = { ...record.properties, ...patch.properties };
    if (patch.meta !== undefined) record.meta = { ...patch.meta };
    return new StoredEdge(
      record.id,
      record.type,
      record.fromNodeId,
      record.toNodeId,
      record.properties,
      record.meta
    );
  }

  async deleteEdge(edgeId: string): Promise<void> {
    const record = this.edges.get(edgeId);
    if (!record) throw new Error(`Edge not found: ${edgeId}`);
    this.unindexEdge(record);
    this.edges.delete(edgeId);
  }

  async getEdge(edgeId: string): Promise<GraphEdge | null> {
    const record = this.edges.get(edgeId);
    if (!record) return null;
    return new StoredEdge(
      record.id,
      record.type,
      record.fromNodeId,
      record.toNodeId,
      record.properties,
      record.meta
    );
  }

  async findEdges(query: EdgeQuery): Promise<GraphEdge[]> {
    const results: GraphEdge[] = [];
    const max = query.maxResults ?? 1000;
    for (const record of this.edges.values()) {
      if (results.length >= max) break;
      if (query.type !== undefined && record.type !== query.type) continue;
      if (query.fromNodeId !== undefined && record.fromNodeId !== query.fromNodeId) continue;
      if (query.toNodeId !== undefined && record.toNodeId !== query.toNodeId) continue;
      results.push(
        new StoredEdge(
          record.id,
          record.type,
          record.fromNodeId,
          record.toNodeId,
          record.properties,
          record.meta
        )
      );
    }
    return results;
  }

  async getAdjacentEdges(nodeId: string, direction: Direction): Promise<GraphEdge[]> {
    const edgeIds: string[] = [];
    if (direction === "outbound" || direction === "both") {
      edgeIds.push(...(this.outbound.get(nodeId) ?? []));
    }
    if (direction === "inbound" || direction === "both") {
      edgeIds.push(...(this.inbound.get(nodeId) ?? []));
    }
    if (direction === "both") {
      const unique = [...new Set(edgeIds)];
      unique.sort();
      edgeIds.length = 0;
      edgeIds.push(...unique);
    } else {
      edgeIds.sort();
    }
    const out: GraphEdge[] = [];
    for (const eid of edgeIds) {
      const record = this.edges.get(eid);
      if (record) out.push(new StoredEdge(record.id, record.type, record.fromNodeId, record.toNodeId, record.properties, record.meta));
    }
    return out;
  }

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }

  /**
   * Serialize full store state (nodes + edges including meta) for persistence.
   */
  toJSON(): GraphStoreSnapshot {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }

  /**
   * Rebuild store from a persisted snapshot (e.g. from file).
   * Rebuilds label and adjacency indices.
   */
  static fromJSON(snapshot: GraphStoreSnapshot): InMemoryGraphStore {
    const store = new InMemoryGraphStore();
    store.loadSnapshot(snapshot.nodes, snapshot.edges);
    return store;
  }

  private loadSnapshot(nodes: NodeRecord[], edges: EdgeRecord[]): void {
    this.nodes.clear();
    this.edges.clear();
    this.labelIndex.clear();
    this.outbound.clear();
    this.inbound.clear();
    for (const n of nodes) {
      this.nodes.set(n.id, n);
      this.indexNode(n);
    }
    for (const e of edges) {
      this.edges.set(e.id, e);
      this.indexEdge(e);
    }
  }
}

export type GraphStoreSnapshot = {
  nodes: Array<{
    id: string;
    labels: string[];
    properties: Record<string, unknown>;
    meta?: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    type: string;
    fromNodeId: string;
    toNodeId: string;
    properties: Record<string, unknown>;
    meta?: Record<string, unknown>;
  }>;
};
