import { GraphEdge } from "../GraphEdge.js";

const TYPE = "PART_OF_GENRE";

export interface PartOfGenreProps {
  primary?: boolean;
}

export class PartOfGenre extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: PartOfGenreProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get primary(): boolean | undefined {
    return this.properties.primary as boolean | undefined;
  }
}
