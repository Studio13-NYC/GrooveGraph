import { GraphEdge } from "../GraphEdge";

const TYPE = "MEMBER_OF";

export interface MemberOfProps {
  role?: string;
  start_date?: string;
  end_date?: string;
}

export class MemberOf extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: MemberOfProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get role(): string | undefined {
    return this.properties.role as string | undefined;
  }
  get start_date(): string | undefined {
    return this.properties.start_date as string | undefined;
  }
  get end_date(): string | undefined {
    return this.properties.end_date as string | undefined;
  }
}
