// DOMAIN_MODEL §3.3
import { GraphEdge } from "../GraphEdge.js";

const TYPE = "USES_EFFECT";

export interface UsesEffectProps {
  parameters?: Record<string, unknown>;
  position?: string;
}

export class UsesEffect extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: UsesEffectProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get parameters(): Record<string, unknown> | undefined {
    return this.properties.parameters as Record<string, unknown> | undefined;
  }
  get position(): string | undefined {
    return this.properties.position as string | undefined;
  }
}
