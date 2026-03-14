import { GraphEdge } from "../GraphEdge";

const TYPE = "CONTAINS";

export interface ContainsProps {
  track_number?: number;
}

export class Contains extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: ContainsProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get track_number(): number | undefined {
    return this.properties.track_number as number | undefined;
  }
}
