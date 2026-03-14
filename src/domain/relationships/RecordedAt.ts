import { GraphEdge } from "../GraphEdge";

const TYPE = "RECORDED_AT";

export interface RecordedAtProps {
  date?: string;
  session_id?: string;
}

export class RecordedAt extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: RecordedAtProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get date(): string | undefined {
    return this.properties.date as string | undefined;
  }
  get session_id(): string | undefined {
    return this.properties.session_id as string | undefined;
  }
}
