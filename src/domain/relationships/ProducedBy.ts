import { GraphEdge } from "../GraphEdge";

const TYPE = "PRODUCED_BY";

export interface ProducedByProps {
  role?: string;
}

export class ProducedBy extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: ProducedByProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get role(): string | undefined {
    return this.properties.role as string | undefined;
  }
}
