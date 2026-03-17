import type { QueryState } from "./types";

export function buildHumanSummary(queryState: QueryState): string {
  const startConstraint = queryState.start.value.trim()
    ? `contains "${queryState.start.value}"`
    : "has no property filter";
  const segments = queryState.steps.map(
    (step) =>
      `${step.direction === "outbound" ? "->" : "<-"} ${step.relationshipType} ${step.target.label} ${
        step.target.value.trim() ? `contains "${step.target.value}"` : "has no property filter"
      }`
  );
  return `${queryState.start.label} ${startConstraint}${segments.length > 0 ? `, then ${segments.join(", then ")}` : ""}.`;
}
