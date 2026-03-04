import { GraphEdge } from "../GraphEdge.js";

const TYPE = "WRITTEN_BY";

export interface WrittenByProps {
  role?: string;
}

export class WrittenBy extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: WrittenByProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get role(): string | undefined {
    return this.properties.role as string | undefined;
  }
}
