import { GraphEdge } from "../GraphEdge";

const TYPE = "HAS_VERSION";

export interface HasVersionProps {
  version_type?: string;
}

export class HasVersion extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: HasVersionProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get version_type(): string | undefined {
    return this.properties.version_type as string | undefined;
  }
}
