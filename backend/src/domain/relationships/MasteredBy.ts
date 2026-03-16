import { GraphEdge } from "../GraphEdge";

const TYPE = "MASTERED_BY";

export interface MasteredByProps {
  role?: string;
}

export class MasteredBy extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: MasteredByProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get role(): string | undefined {
    return this.properties.role as string | undefined;
  }
}
