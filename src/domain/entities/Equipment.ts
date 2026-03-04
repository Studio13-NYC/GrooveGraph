// DOMAIN_MODEL §1.4
import { GraphNode } from "../GraphNode.js";

const LABEL = "Equipment";

export interface EquipmentProps {
  name: string;
  type?: string;
  manufacturer?: string;
  model?: string;
  year?: number;
  specifications?: Record<string, unknown>;
  notable_users?: string[];
}

export class Equipment extends GraphNode {
  constructor(
    id: string,
    props: EquipmentProps,
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
  get manufacturer(): string | undefined {
    return this.properties.manufacturer as string | undefined;
  }
  get model(): string | undefined {
    return this.properties.model as string | undefined;
  }
  get year(): number | undefined {
    return this.properties.year as number | undefined;
  }
  get specifications(): Record<string, unknown> | undefined {
    return this.properties.specifications as Record<string, unknown> | undefined;
  }
  get notable_users(): string[] | undefined {
    return this.properties.notable_users as string[] | undefined;
  }
}
