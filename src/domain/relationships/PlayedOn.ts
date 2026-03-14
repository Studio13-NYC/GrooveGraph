import { GraphEdge } from "../GraphEdge";

const TYPE = "PLAYED_ON";

export interface PlayedOnProps {
  role?: string;
  track_id?: string;
}

export class PlayedOn extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: PlayedOnProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get role(): string | undefined {
    return this.properties.role as string | undefined;
  }
  get track_id(): string | undefined {
    return this.properties.track_id as string | undefined;
  }
}
