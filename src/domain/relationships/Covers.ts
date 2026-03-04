import { GraphEdge } from "../GraphEdge.js";

const TYPE = "COVERS";

export interface CoversProps {
  release_date?: string;
}

export class Covers extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: CoversProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get release_date(): string | undefined {
    return this.properties.release_date as string | undefined;
  }
}
