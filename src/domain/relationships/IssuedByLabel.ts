import { GraphEdge } from "../GraphEdge";

const TYPE = "ISSUED_BY_LABEL";

export interface IssuedByLabelProps {
  catalog_number?: string;
}

export class IssuedByLabel extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: IssuedByLabelProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get catalog_number(): string | undefined {
    return this.properties.catalog_number as string | undefined;
  }
}
