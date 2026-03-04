// DOMAIN_MODEL §1.17
import { GraphNode } from "../GraphNode.js";

const LABEL = "Release";

export interface ReleaseProps {
  title?: string;
  release_date?: string;
  format?: string;
  catalog_number?: string;
}

export class Release extends GraphNode {
  constructor(
    id: string,
    props: ReleaseProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, [LABEL], props as unknown as Record<string, unknown>, meta);
  }

  get title(): string | undefined {
    return this.properties.title as string | undefined;
  }
  get release_date(): string | undefined {
    return this.properties.release_date as string | undefined;
  }
  get format(): string | undefined {
    return this.properties.format as string | undefined;
  }
  get catalog_number(): string | undefined {
    return this.properties.catalog_number as string | undefined;
  }
}
