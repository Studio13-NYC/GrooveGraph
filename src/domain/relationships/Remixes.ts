import { GraphEdge } from "../GraphEdge";

const TYPE = "REMIXES";

export interface RemixesProps {
  remix_type?: string;
  release_date?: string;
}

export class Remixes extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: RemixesProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get remix_type(): string | undefined {
    return this.properties.remix_type as string | undefined;
  }
  get release_date(): string | undefined {
    return this.properties.release_date as string | undefined;
  }
}
