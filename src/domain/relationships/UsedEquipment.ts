import { GraphEdge } from "../GraphEdge";

const TYPE = "USED_EQUIPMENT";

export interface UsedEquipmentProps {
  role?: string;
  context?: string;
}

export class UsedEquipment extends GraphEdge {
  constructor(
    id: string,
    fromNodeId: string,
    toNodeId: string,
    properties: UsedEquipmentProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, TYPE, fromNodeId, toNodeId, properties as Record<string, unknown>, meta);
  }

  get role(): string | undefined {
    return this.properties.role as string | undefined;
  }
  get context(): string | undefined {
    return this.properties.context as string | undefined;
  }
}
