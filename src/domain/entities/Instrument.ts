import { GraphNode } from "../GraphNode";

const LABEL = "Instrument";

export interface InstrumentProps {
  name: string;
  type?: string;
  brand?: string;
  manufacturer?: string;
  model?: string;
  year_of_manufacture?: number;
  year?: number;
  family?: string;
  sub_family?: string;
  serial_number?: string;
  specifications?: Record<string, unknown>;
  condition?: string;
  notable_users?: string[];
  image_url?: string;
  notes?: string;
}

export class Instrument extends GraphNode {
  constructor(
    id: string,
    props: InstrumentProps,
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
  get brand(): string | undefined {
    return this.properties.brand as string | undefined;
  }
  get manufacturer(): string | undefined {
    return this.properties.manufacturer as string | undefined;
  }
  get model(): string | undefined {
    return this.properties.model as string | undefined;
  }
  get year_of_manufacture(): number | undefined {
    return this.properties.year_of_manufacture as number | undefined;
  }
  get year(): number | undefined {
    return this.properties.year as number | undefined;
  }
  get family(): string | undefined {
    return this.properties.family as string | undefined;
  }
  get sub_family(): string | undefined {
    return this.properties.sub_family as string | undefined;
  }
  get serial_number(): string | undefined {
    return this.properties.serial_number as string | undefined;
  }
  get specifications(): Record<string, unknown> | undefined {
    return this.properties.specifications as Record<string, unknown> | undefined;
  }
  get condition(): string | undefined {
    return this.properties.condition as string | undefined;
  }
  get notable_users(): string[] | undefined {
    return this.properties.notable_users as string[] | undefined;
  }
  get image_url(): string | undefined {
    return this.properties.image_url as string | undefined;
  }
  get notes(): string | undefined {
    return this.properties.notes as string | undefined;
  }
}
