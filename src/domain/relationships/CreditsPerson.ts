import { GraphEdge } from "../GraphEdge.js";

const TYPE = "CREDITS_PERSON";

export interface CreditsPersonProps {
  role?: string;
  order?: number;
}

export class CreditsPerson extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: CreditsPersonProps = {},
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
