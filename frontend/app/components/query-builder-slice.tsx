"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ENTITY_LABELS, type EntityLabel } from "@/lib/entity-config";
import { RELATIONSHIP_TYPES, type RelationshipType } from "@/lib/relationship-config";
import { getApiBase, getAuthHeaders } from "@/lib/api-base";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

type QueryBuilderFormState = {
  entityType: EntityLabel;
  propertyFilter: string;
};

type QueryBuilderStepState = {
  relationship: RelationshipType;
  direction: "outbound" | "inbound";
  targetEntity: EntityLabel;
  propertyFilter: string;
};

type QueryBuilderCompileResponse = {
  traceId: string;
  summary: string;
  nextOptions?: Array<{
    relationshipType: string;
    direction: "outbound" | "inbound";
    targetLabels: string[];
  }>;
  compiled: {
    cypher: string;
    params: Record<string, unknown>;
  };
  queryState?: {
    start: {
      label: string;
      value: string;
    };
    steps: Array<{
      relationshipType: string;
      direction: "outbound" | "inbound";
      target: {
        label: string;
        value: string;
      };
    }>;
  };
};

const DEFAULT_FORM_STATE: QueryBuilderFormState = {
  entityType: "Artist",
  propertyFilter: "",
};

const DEFAULT_STEP: QueryBuilderStepState = {
  relationship: "PLAYED_INSTRUMENT",
  direction: "outbound",
  targetEntity: "Instrument",
  propertyFilter: "",
};

function getPropertyKeyForLabel(label: EntityLabel): string {
  return label === "Venue" ? "venue" : "name";
}

function toEntityLabel(value: string): EntityLabel | null {
  return ENTITY_LABELS.includes(value as EntityLabel) ? (value as EntityLabel) : null;
}

function toRelationshipType(value: string): RelationshipType | null {
  return RELATIONSHIP_TYPES.includes(value as RelationshipType) ? (value as RelationshipType) : null;
}

export function QueryBuilderSlice() {
  const [formState, setFormState] = useState<QueryBuilderFormState>(DEFAULT_FORM_STATE);
  const [steps, setSteps] = useState<QueryBuilderStepState[]>([{ ...DEFAULT_STEP }]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryBuilderCompileResponse | null>(null);

  const userSummary = useMemo(() => {
    const startFilter = formState.propertyFilter.trim();
    const startText = startFilter
      ? `${formState.entityType} contains "${startFilter}"`
      : `${formState.entityType} with no property filter`;
    const segments = steps.map((step, index) => {
      const filter = step.propertyFilter.trim();
      const filterText = filter
        ? ` contains "${filter}"`
        : " with no property filter";
      const arrow = step.direction === "outbound" ? "->" : "<-";
      return `step ${index + 1}: ${arrow} ${step.relationship} ${step.targetEntity}${filterText}`;
    });

    return `${startText}${segments.length > 0 ? `, then ${segments.join(", then ")}` : ""}`;
  }, [formState.entityType, formState.propertyFilter, steps]);

  const canRemoveStep = steps.length > 1;

  function updateStep(index: number, patch: Partial<QueryBuilderStepState>) {
    setSteps((current) =>
      current.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch } : step))
    );
  }

  function addStep() {
    setSteps((current) => [...current, { ...DEFAULT_STEP }]);
  }

  function addSuggestedStep() {
    const suggestion = result?.nextOptions?.[0];
    if (!suggestion) {
      addStep();
      return;
    }

    const relationship = toRelationshipType(suggestion.relationshipType) ?? DEFAULT_STEP.relationship;
    const targetEntity =
      suggestion.targetLabels.map(toEntityLabel).find((label): label is EntityLabel => Boolean(label)) ??
      DEFAULT_STEP.targetEntity;

    setSteps((current) => [
      ...current,
      {
        relationship,
        direction: suggestion.direction,
        targetEntity,
        propertyFilter: "",
      },
    ]);
  }

  function removeStep(index: number) {
    setSteps((current) => {
      if (current.length <= 1) return current;
      return current.filter((_, stepIndex) => stepIndex !== index);
    });
  }

  async function handleCompile() {
    setLoading(true);
    setError(null);

    const queryState = {
      start: {
        label: formState.entityType,
        propertyKey: getPropertyKeyForLabel(formState.entityType),
        value: formState.propertyFilter.trim(),
      },
      steps: steps.map((step) => ({
        relationshipType: step.relationship,
        direction: step.direction,
        target: {
          label: step.targetEntity,
          propertyKey: getPropertyKeyForLabel(step.targetEntity),
          value: step.propertyFilter.trim(),
        },
      })),
      limit: 25,
    };

    try {
      const response = await fetch(`${getApiBase()}/api/query-builder/compile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ queryState }),
      });

      const payload = (await response.json()) as QueryBuilderCompileResponse | { error?: string };
      if (!response.ok) {
        const message = "error" in payload && payload.error ? payload.error : "Failed to compile query preview";
        throw new Error(message);
      }

      setResult(payload as QueryBuilderCompileResponse);
    } catch (compileError) {
      setResult(null);
      setError(compileError instanceof Error ? compileError.message : "Failed to compile query preview");
    } finally {
      setLoading(false);
    }
  }

  async function handleInterpret() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${getApiBase()}/api/query-builder/interpret`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ prompt }),
      });

      const payload = (await response.json()) as QueryBuilderCompileResponse | { error?: string };
      if (!response.ok) {
        const message = "error" in payload && payload.error ? payload.error : "Failed to interpret prompt";
        throw new Error(message);
      }

      const interpreted = payload as QueryBuilderCompileResponse;
      if (interpreted.queryState) {
        const startLabel = toEntityLabel(interpreted.queryState.start.label) ?? DEFAULT_FORM_STATE.entityType;
        setFormState({
          entityType: startLabel,
          propertyFilter: interpreted.queryState.start.value ?? "",
        });
        const interpretedSteps = interpreted.queryState.steps
          .map((step) => {
            const relationship = toRelationshipType(step.relationshipType);
            const targetEntity = toEntityLabel(step.target.label);
            if (!relationship || !targetEntity) return null;
            return {
              relationship,
              direction: step.direction === "inbound" ? "inbound" : "outbound",
              targetEntity,
              propertyFilter: step.target.value ?? "",
            } satisfies QueryBuilderStepState;
          })
          .filter((step): step is QueryBuilderStepState => Boolean(step));
        setSteps(interpretedSteps.length > 0 ? interpretedSteps : [{ ...DEFAULT_STEP }]);
      }
      setResult(interpreted);
    } catch (interpretError) {
      setResult(null);
      setError(interpretError instanceof Error ? interpretError.message : "Failed to interpret prompt");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormState(DEFAULT_FORM_STATE);
    setSteps([{ ...DEFAULT_STEP }]);
    setResult(null);
    setError(null);
  }

  return (
    <div className="grid gap-4 md:grid-cols-5">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Query Builder (Multi-row Slice)</CardTitle>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Compose chained ontology-aware rows and compile a live Cypher preview.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium">Start entity type</span>
            <select
              value={formState.entityType}
              onChange={(event) =>
                setFormState((current) => ({ ...current, entityType: event.target.value as EntityLabel }))
              }
              className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            >
              {ENTITY_LABELS.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Start property filter (optional)</span>
            <Input
              value={formState.propertyFilter}
              onChange={(event) => setFormState((current) => ({ ...current, propertyFilter: event.target.value }))}
              placeholder="e.g. adrian"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Fuzzy prompt (optional)</span>
            <Input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder='e.g. artists influenced by adrian with guitar context'
            />
          </label>

          <div className="space-y-3">
            {steps.map((step, index) => (
              <div key={`row-${index}`} className="space-y-3 rounded-md border border-[hsl(var(--border))] p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Row {index + 1}
                </p>

                <label className="block space-y-2">
                  <span className="text-sm font-medium">Relationship</span>
                  <select
                    value={step.relationship}
                    onChange={(event) =>
                      updateStep(index, { relationship: event.target.value as RelationshipType })
                    }
                    className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  >
                    {RELATIONSHIP_TYPES.map((relationship) => (
                      <option key={relationship} value={relationship}>
                        {relationship}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium">Direction</span>
                  <select
                    value={step.direction}
                    onChange={(event) =>
                      updateStep(index, { direction: event.target.value as "outbound" | "inbound" })
                    }
                    className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  >
                    <option value="outbound">outbound (current -&gt; target)</option>
                    <option value="inbound">inbound (target -&gt; current)</option>
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium">Target entity</span>
                  <select
                    value={step.targetEntity}
                    onChange={(event) =>
                      updateStep(index, { targetEntity: event.target.value as EntityLabel })
                    }
                    className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  >
                    {ENTITY_LABELS.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium">Target property filter (optional)</span>
                  <Input
                    value={step.propertyFilter}
                    onChange={(event) => updateStep(index, { propertyFilter: event.target.value })}
                    placeholder="e.g. guitar"
                  />
                </label>

                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => removeStep(index)}
                    disabled={loading || !canRemoveStep}
                  >
                    Remove row
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={addStep} disabled={loading}>
              Add Row
            </Button>
            <Button type="button" variant="outline" onClick={addSuggestedStep} disabled={loading}>
              Add Suggested Row
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleInterpret()} disabled={loading || !prompt.trim()}>
              Interpret Prompt
            </Button>
            <Button type="button" onClick={() => void handleCompile()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Compile Cypher Preview
            </Button>
            <Button type="button" variant="outline" onClick={resetForm} disabled={loading}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-3">
        <CardHeader>
          <CardTitle>Preview Output</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Human-readable summary
            </p>
            <p className="mt-2 text-sm">{result?.summary ?? userSummary}</p>
          </div>

          {result?.nextOptions && result.nextOptions.length > 0 ? (
            <div className="rounded-md border border-[hsl(var(--border))] p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Suggested next connections
              </p>
              <div className="mt-2 space-y-1">
                {result.nextOptions.slice(0, 5).map((option, index) => (
                  <p key={`${option.relationshipType}-${index}`} className="text-xs">
                    {option.direction === "outbound" ? "->" : "<-"} {option.relationshipType} to{" "}
                    {option.targetLabels.join(", ")}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              Could not compile preview: {error}
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-[hsl(var(--border))] p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Cypher</p>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs">{result?.compiled.cypher ?? "--"}</pre>
            </div>
            <div className="rounded-md border border-[hsl(var(--border))] p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Params</p>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs">
                {result ? JSON.stringify(result.compiled.params, null, 2) : "--"}
              </pre>
            </div>
          </div>

          {result?.traceId ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Trace ID: {result.traceId}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
