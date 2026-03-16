import { GraphEdge } from "../GraphEdge";

const TYPE = "RELEASED_BY";

export interface ReleasedByProps {
  catalog_number?: string;
}

export class ReleasedBy extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: ReleasedByProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get catalog_number(): string | undefined {
    return this.properties.catalog_number as string | undefined;
  }
}
