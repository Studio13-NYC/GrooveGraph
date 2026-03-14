// DOMAIN_MODEL §1.12
import { GraphNode } from "../GraphNode";

const LABEL = "Genre";

export interface GenreProps {
  name: string;
}

export class Genre extends GraphNode {
  constructor(
    id: string,
    props: GenreProps,
    meta?: Record<string, unknown>
  ) {
    super(id, [LABEL], props as unknown as Record<string, unknown>, meta);
  }

  get name(): string {
    return this.properties.name as string;
  }
}
