// DOMAIN_MODEL §1.15 (optional)
import { GraphNode } from "../GraphNode.js";

const LABEL = "SongWork";

export interface SongWorkProps {
  title?: string;
  composers?: string[];
  lyricists?: string[];
  publishing?: string;
}

export class SongWork extends GraphNode {
  constructor(
    id: string,
    props: SongWorkProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, [LABEL], props as unknown as Record<string, unknown>, meta);
  }

  get title(): string | undefined {
    return this.properties.title as string | undefined;
  }
  get composers(): string[] | undefined {
    return this.properties.composers as string[] | undefined;
  }
  get lyricists(): string[] | undefined {
    return this.properties.lyricists as string[] | undefined;
  }
  get publishing(): string | undefined {
    return this.properties.publishing as string | undefined;
  }
}
