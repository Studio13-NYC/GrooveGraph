// DOMAIN_MODEL §1.7
import { GraphNode } from "../GraphNode";

const LABEL = "Person";

export interface PersonProps {
  name: string;
  roles?: string[];
  biography?: string;
  specialties?: string[];
  notable_works?: string[];
}

export class Person extends GraphNode {
  constructor(
    id: string,
    props: PersonProps,
    meta?: Record<string, unknown>
  ) {
    super(id, [LABEL], props as unknown as Record<string, unknown>, meta);
  }

  get name(): string {
    return this.properties.name as string;
  }
  get roles(): string[] | undefined {
    return this.properties.roles as string[] | undefined;
  }
  get biography(): string | undefined {
    return this.properties.biography as string | undefined;
  }
  get specialties(): string[] | undefined {
    return this.properties.specialties as string[] | undefined;
  }
  get notable_works(): string[] | undefined {
    return this.properties.notable_works as string[] | undefined;
  }
}
