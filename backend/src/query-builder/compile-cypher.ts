import type { OntologyRuntime } from "../ontology";
import type { CompiledCypher, QueryState } from "./types";

const SAFE_TOKEN = /^[A-Za-z][A-Za-z0-9_]*$/;

function assertSafeToken(value: string, kind: "label" | "relationship" | "property"): string {
  if (!SAFE_TOKEN.test(value)) {
    throw new Error(`Invalid ${kind} token: ${value}`);
  }
  return value;
}

function buildContainsPredicate(
  variableName: string,
  propertyKey: string,
  paramName: string
): string {
  const safeProperty = assertSafeToken(propertyKey, "property");
  return `toLower(coalesce(toString(${variableName}.${safeProperty}), "")) CONTAINS toLower($${paramName})`;
}

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return 25;
  const safe = Math.floor(limit as number);
  return Math.max(1, Math.min(200, safe));
}

export function compileQueryStateToCypher(
  state: QueryState,
  ontology: OntologyRuntime
): CompiledCypher {
  const startLabel = ontology.resolveEntityLabel(state.start.label);
  if (!startLabel) {
    throw new Error(`Unknown start label: ${state.start.label}`);
  }

  const params: Record<string, unknown> = {};
  const lines: string[] = [];

  const startVar = "n0";
  lines.push(`MATCH (${startVar}:${assertSafeToken(startLabel, "label")})`);
  params.startValue = state.start.value;
  lines.push(`WHERE ${buildContainsPredicate(startVar, state.start.propertyKey, "startValue")}`);

  let currentLabel = startLabel;
  for (let idx = 0; idx < state.steps.length; idx += 1) {
    const step = state.steps[idx];
    const relationshipType = ontology.resolveRelationshipType(step.relationshipType);
    if (!relationshipType) {
      throw new Error(`Unknown relationship type: ${step.relationshipType}`);
    }

    const targetLabel = ontology.resolveEntityLabel(step.target.label);
    if (!targetLabel) {
      throw new Error(`Unknown target label: ${step.target.label}`);
    }

    const relationshipSchema = ontology.getRelationship(relationshipType);
    if (!relationshipSchema) {
      throw new Error(`Missing ontology relationship schema: ${relationshipType}`);
    }

    const validDirection =
      step.direction === "outbound"
        ? relationshipSchema.subjectLabels.includes(currentLabel) &&
          relationshipSchema.objectLabels.includes(targetLabel)
        : relationshipSchema.objectLabels.includes(currentLabel) &&
          relationshipSchema.subjectLabels.includes(targetLabel);

    if (!validDirection) {
      throw new Error(
        `Relationship ${relationshipType} cannot connect ${currentLabel} -> ${targetLabel} as ${step.direction}`
      );
    }

    const fromVar = `n${idx}`;
    const relVar = `r${idx}`;
    const toVar = `n${idx + 1}`;
    const relToken = assertSafeToken(relationshipType, "relationship");
    const labelToken = assertSafeToken(targetLabel, "label");

    if (step.direction === "outbound") {
      lines.push(`MATCH (${fromVar})-[${relVar}:${relToken}]->(${toVar}:${labelToken})`);
    } else {
      lines.push(`MATCH (${fromVar})<-[${relVar}:${relToken}]-(${toVar}:${labelToken})`);
    }

    const paramName = `step${idx}Value`;
    params[paramName] = step.target.value;
    lines.push(`WHERE ${buildContainsPredicate(toVar, step.target.propertyKey, paramName)}`);

    currentLabel = targetLabel;
  }

  const projectionNodes = Array.from({ length: state.steps.length + 1 }, (_, idx) => `n${idx}`);
  const projectionRels = Array.from({ length: state.steps.length }, (_, idx) => `r${idx}`);
  params.limit = normalizeLimit(state.limit);

  lines.push(`RETURN ${[...projectionNodes, ...projectionRels].join(", ")}`);
  lines.push("LIMIT $limit");

  return {
    cypher: lines.join("\n"),
    params,
  };
}
