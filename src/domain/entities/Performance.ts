// DOMAIN_MODEL §1.10
import { GraphNode } from "../GraphNode.js";

const LABEL = "Performance";

export interface PerformanceProps {
  venue: string;
  date?: string;
  setlist?: string[];
  lineup?: string[];
  recordings?: string[];
}

export class Performance extends GraphNode {
  constructor(
    id: string,
    props: PerformanceProps,
    meta?: Record<string, unknown>
  ) {
    super(id, [LABEL], props as unknown as Record<string, unknown>, meta);
  }

  get venue(): string {
    return this.properties.venue as string;
  }
  get date(): string | undefined {
    return this.properties.date as string | undefined;
  }
  get setlist(): string[] | undefined {
    return this.properties.setlist as string[] | undefined;
  }
  get lineup(): string[] | undefined {
    return this.properties.lineup as string[] | undefined;
  }
  get recordings(): string[] | undefined {
    return this.properties.recordings as string[] | undefined;
  }
}
