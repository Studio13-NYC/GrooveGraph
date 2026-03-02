import { GraphEdge } from "../GraphEdge.js";

const TYPE = "PERFORMED_BY";

export interface PerformedByProps {
  role?: string;
  order?: number;
}

export class PerformedBy extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: PerformedByProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get role(): string | undefined {
    return this.properties.role as string | undefined;
  }
  get order(): number | undefined {
    return this.properties.order as number | undefined;
  }
}
