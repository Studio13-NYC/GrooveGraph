import { GraphEdge } from "../GraphEdge.js";

const TYPE = "PERFORMED_AT";

export interface PerformedAtProps {
  date?: string;
}

export class PerformedAt extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: PerformedAtProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get date(): string | undefined {
    return this.properties.date as string | undefined;
  }
}
