// DOMAIN_MODEL §1.11
import { GraphNode } from "../GraphNode";

const LABEL = "Effect";

export interface EffectProps {
  name: string;
  type?: string;
  parameters?: Record<string, unknown>;
  position?: string;
  context?: string;
}

export class Effect extends GraphNode {
  constructor(
    id: string,
    props: EffectProps,
    meta?: Record<string, unknown>
  ) {
    super(id, [LABEL], props as unknown as Record<string, unknown>, meta);
  }

  get name(): string {
    return this.properties.name as string;
  }
  get type(): string | undefined {
    return this.properties.type as string | undefined;
  }
  get parameters(): Record<string, unknown> | undefined {
    return this.properties.parameters as Record<string, unknown> | undefined;
  }
  get position(): string | undefined {
    return this.properties.position as string | undefined;
  }
  get context(): string | undefined {
    return this.properties.context as string | undefined;
  }
}
