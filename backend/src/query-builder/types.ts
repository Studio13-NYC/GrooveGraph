export type QueryDirection = "outbound" | "inbound";

export interface QueryNodeSelector {
  label: string;
  propertyKey: string;
  value: string;
}

export interface QueryStep {
  relationshipType: string;
  direction: QueryDirection;
  target: QueryNodeSelector;
}

export interface QueryState {
  start: QueryNodeSelector;
  steps: QueryStep[];
  limit?: number;
}

export interface NextOption {
  relationshipType: string;
  direction: QueryDirection;
  targetLabels: string[];
}

export interface CompiledCypher {
  cypher: string;
  params: Record<string, unknown>;
}
