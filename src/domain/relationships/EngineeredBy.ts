import { GraphEdge } from "../GraphEdge.js";

const TYPE = "ENGINEERED_BY";

export interface EngineeredByProps {
  role?: string;
}

export class EngineeredBy extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: EngineeredByProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get role(): string | undefined {
    return this.properties.role as string | undefined;
  }
}
