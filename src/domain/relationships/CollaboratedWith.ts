import { GraphEdge } from "../GraphEdge.js";

const TYPE = "COLLABORATED_WITH";

export interface CollaboratedWithProps {
  context?: string;
  date?: string;
}

export class CollaboratedWith extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: CollaboratedWithProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get context(): string | undefined {
    return this.properties.context as string | undefined;
  }
  get date(): string | undefined {
    return this.properties.date as string | undefined;
  }
}
