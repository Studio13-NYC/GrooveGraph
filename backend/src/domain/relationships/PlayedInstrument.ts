import { GraphEdge } from "../GraphEdge";

const TYPE = "PLAYED_INSTRUMENT";

export interface PlayedInstrumentProps {
  role?: string;
  order?: number;
}

export class PlayedInstrument extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: PlayedInstrumentProps = {},
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
