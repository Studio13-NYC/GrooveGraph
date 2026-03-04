import { GraphEdge } from "../GraphEdge.js";

const TYPE = "RECORDED_IN_SESSION";

export interface RecordedInSessionProps {
  date?: string;
}

export class RecordedInSession extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: RecordedInSessionProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get date(): string | undefined {
    return this.properties.date as string | undefined;
  }
}
