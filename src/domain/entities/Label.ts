// DOMAIN_MODEL §1.9
import { GraphNode } from "../GraphNode.js";

const LABEL = "Label";

export interface LabelProps {
  name: string;
  founding_date?: string;
  parent_company?: string;
  roster?: string[];
  genre_focus?: string[];
}

export class Label extends GraphNode {
  constructor(
    id: string,
    props: LabelProps,
    meta?: Record<string, unknown>
  ) {
    super(id, [LABEL], props as unknown as Record<string, unknown>, meta);
  }

  get name(): string {
    return this.properties.name as string;
  }
  get founding_date(): string | undefined {
    return this.properties.founding_date as string | undefined;
  }
  get parent_company(): string | undefined {
    return this.properties.parent_company as string | undefined;
  }
  get roster(): string[] | undefined {
    return this.properties.roster as string[] | undefined;
  }
  get genre_focus(): string[] | undefined {
    return this.properties.genre_focus as string[] | undefined;
  }
}
