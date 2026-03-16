import { GraphEdge } from "../GraphEdge";

const TYPE = "RELEASED_ON";

export interface ReleasedOnProps {
  track_number?: number;
  disc_number?: number;
}

export class ReleasedOn extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: ReleasedOnProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get track_number(): number | undefined {
    return this.properties.track_number as number | undefined;
  }
  get disc_number(): number | undefined {
    return this.properties.disc_number as number | undefined;
  }
}
