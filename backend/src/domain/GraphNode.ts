/**
 * Abstract base for all node-like domain objects in the graph.
 * Aligns with ARCHITECTURE §4 (Node): id, labels, properties, meta.
 */
export abstract class GraphNode {
  readonly id: string;
  readonly labels: string[];
  readonly properties: Record<string, unknown>;
  readonly meta?: Record<string, unknown>;

  constructor(
    id: string,
    labels: string[],
    properties: Record<string, unknown> = {},
    meta?: Record<string, unknown>
  ) {
    this.id = id;
    this.labels = [...labels];
    this.properties = { ...properties };
    this.meta = meta ? { ...meta } : undefined;
  }

  /**
   * Return a shallow copy with optional additional or overridden properties.
   */
  withProperties(extra: Record<string, unknown>): this {
    const Constructor = this.constructor as new (
      id: string,
      labels: string[],
      properties: Record<string, unknown>,
      meta?: Record<string, unknown>
    ) => this;
    return new Constructor(this.id, this.labels, { ...this.properties, ...extra }, this.meta) as this;
  }
}
