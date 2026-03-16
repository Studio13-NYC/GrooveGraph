import { GraphEdge } from "../GraphEdge";

const TYPE = "FEATURES";

export interface FeaturesProps {
  role?: string;
  order?: number;
}

export class Features extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: FeaturesProps = {},
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
