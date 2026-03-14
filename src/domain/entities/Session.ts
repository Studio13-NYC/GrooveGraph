// DOMAIN_MODEL §1.16
import { GraphNode } from "../GraphNode";

const LABEL = "Session";

export interface SessionProps {
  name?: string;
  date?: string;
  studio_id?: string;
  studio_name?: string;
}

export class Session extends GraphNode {
  constructor(
    id: string,
    props: SessionProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, [LABEL], props as unknown as Record<string, unknown>, meta);
  }

  get name(): string | undefined {
    return this.properties.name as string | undefined;
  }
  get date(): string | undefined {
    return this.properties.date as string | undefined;
  }
  get studio_id(): string | undefined {
    return this.properties.studio_id as string | undefined;
  }
  get studio_name(): string | undefined {
    return this.properties.studio_name as string | undefined;
  }
}
