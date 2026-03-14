// DOMAIN_MODEL §1.14
import { GraphNode } from "../GraphNode";

const LABEL = "Venue";

export interface VenueProps {
  name: string;
  location?: string;
  capacity?: number;
  opening_date?: string;
  website?: string;
}

export class Venue extends GraphNode {
  constructor(
    id: string,
    props: VenueProps,
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
  get capacity(): number | undefined {
    return this.properties.capacity as number | undefined;
  }
  get opening_date(): string | undefined {
    return this.properties.opening_date as string | undefined;
  }
  get website(): string | undefined {
    return this.properties.website as string | undefined;
  }
}
