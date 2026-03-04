// DOMAIN_MODEL §1.8
import { GraphNode } from "../GraphNode.js";

const LABEL = "Credit";

export interface CreditProps {
  role_name?: string;
  contribution_details?: string;
  primary_credit?: boolean;
  contribution_percentage?: number;
}

export class Credit extends GraphNode {
  constructor(
    id: string,
    props: CreditProps = {},
    meta?: Record<string, unknown>
  ) {
    super(id, [LABEL], props as unknown as Record<string, unknown>, meta);
  }

  get role_name(): string | undefined {
    return this.properties.role_name as string | undefined;
  }
  get contribution_details(): string | undefined {
    return this.properties.contribution_details as string | undefined;
  }
  get primary_credit(): boolean | undefined {
    return this.properties.primary_credit as boolean | undefined;
  }
  get contribution_percentage(): number | undefined {
    return this.properties.contribution_percentage as number | undefined;
  }
}
