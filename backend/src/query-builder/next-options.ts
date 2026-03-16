import type { OntologyRuntime } from "../ontology";
import type { NextOption, QueryState } from "./types";

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function getOntologyAwareNextOptions(state: QueryState, ontology: OntologyRuntime): NextOption[] {
  const currentLabelInput =
    state.steps.length > 0 ? state.steps[state.steps.length - 1].target.label : state.start.label;

  const currentLabel = ontology.resolveEntityLabel(currentLabelInput);
  if (!currentLabel) {
    return [];
  }

  const options: NextOption[] = [];
  for (const relationship of ontology.schema.relationships) {
    if (relationship.subjectLabels.includes(currentLabel)) {
      options.push({
        relationshipType: relationship.type,
        direction: "outbound",
        targetLabels: unique(relationship.objectLabels),
      });
    }
    if (relationship.objectLabels.includes(currentLabel)) {
      options.push({
        relationshipType: relationship.type,
        direction: "inbound",
        targetLabels: unique(relationship.subjectLabels),
      });
    }
  }

  return options;
}
