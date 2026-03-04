import { GraphEdge } from "../GraphEdge.js";

const TYPE = "INFLUENCED_BY";

export interface InfluencedByProps {
  context?: string;
}

export class InfluencedBy extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: InfluencedByProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get context(): string | undefined {
    return this.properties.context as string | undefined;
  }
}
