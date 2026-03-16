// DOMAIN_MODEL §1.6
import { GraphNode } from "../GraphNode";

const LABEL = "Studio";

export interface StudioProps {
  name: string;
  location?: string;
  founding_date?: string;
  specifications?: Record<string, unknown>;
  notable_recordings?: string[];
}

export class Studio extends GraphNode {
  constructor(
    id: string,
    props: StudioProps,
    meta?: Record<string, unknown>
  ) {
    super(id, [LABEL], props as unknown as Record<string, unknown>, meta);
  }

  get name(): string {
    return this.properties.name as string;
  }
  get location(): string | undefined {
    return this.properties.location as string | undefined;
  }
  get founding_date(): string | undefined {
    return this.properties.founding_date as string | undefined;
  }
  get specifications(): Record<string, unknown> | undefined {
    return this.properties.specifications as Record<string, unknown> | undefined;
  }
  get notable_recordings(): string[] | undefined {
    return this.properties.notable_recordings as string[] | undefined;
  }
}
