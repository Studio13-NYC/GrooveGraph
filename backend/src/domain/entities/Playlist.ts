// DOMAIN_MODEL §1.13
import { GraphNode } from "../GraphNode";

const LABEL = "Playlist";

export interface PlaylistProps {
  name: string;
  description?: string;
}

export class Playlist extends GraphNode {
  constructor(
    id: string,
    props: PlaylistProps,
    meta?: Record<string, unknown>
  ) {
    super(id, [LABEL], props as unknown as Record<string, unknown>, meta);
  }

  get name(): string {
    return this.properties.name as string;
  }
  get description(): string | undefined {
    return this.properties.description as string | undefined;
  }
}
