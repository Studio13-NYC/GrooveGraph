/**
 * Abstract base for all edge-like domain objects (relationships) in the graph.
 * Aligns with ARCHITECTURE §4 (Edge): id, type, fromNodeId, toNodeId, properties, meta.
 */
export abstract class GraphEdge {
  readonly id: string;
  readonly type: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly properties: Record<string, unknown>;
  readonly meta?: Record<string, unknown>;

  constructor(
    id: string,
    type: string,
    fromNodeId: string,
    toNodeId: string,
    properties: Record<string, unknown> = {},
    meta?: Record<string, unknown>
  ) {
    this.id = id;
    this.type = type;
    this.fromNodeId = fromNodeId;
    this.toNodeId = toNodeId;
    this.properties = { ...properties };
    this.meta = meta ? { ...meta } : undefined;
  }
}
