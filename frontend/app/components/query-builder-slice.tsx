"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, Plus, Sparkles, ThumbsDown, ThumbsUp, Wand2 } from "lucide-react";
import { ENTITY_LABELS, type EntityLabel } from "@/lib/entity-config";
import { RELATIONSHIP_TYPES, type RelationshipType } from "@/lib/relationship-config";
import { getApiBase, getAuthHeaders } from "@/lib/api-base";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { GraphView2D } from "./exploration-graph-cytoscape";

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

type NextOption = {
  relationshipType: string;
  direction: "outbound" | "inbound";
  targetLabels: string[];
};

type QueryBuilderCompileResponse = {
  traceId: string;
  summary: string;
  strategy?: string;
  rationale?: string;
  answerMarkdown?: string;
  answerStrategy?: string;
  researchStatus?: "generated" | "unavailable" | "skipped";
  researchReason?: string;
  compileBlockedReason?: string;
  diagnostics?: {
    unavailableRelationships?: Array<{
      proposalId: string;
      status: "proposed" | "accepted";
      relationshipType: string;
      direction: "outbound" | "inbound";
      fromLabel: string;
      toLabel: string;
      allowedTargets: string[];
    }>;
  };
  usedInsightIds?: string[];
  proposedAdditions?: {
    nodes: Array<{ label: string; value: string; canonicalKey: string }>;
    relationships: Array<{
      type: string;
      fromCanonicalKey: string;
      toCanonicalKey: string;
      direction: "outbound" | "inbound";
      canonicalKey: string;
    }>;
  };
  nextOptions?: NextOption[];
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

type QueryBuilderExecuteResponse = {
  traceId: string;
  compiled: {
    cypher: string;
    params: Record<string, unknown>;
  };
  resultCount: number;
  sampleMatches: Array<{ chain: string[] }>;
  fallback?: {
    applied: boolean;
    reason: string;
    candidate: string;
    resultCount: number;
  };
  graph: {
    nodes: Array<{
      id: string;
      label: string;
      name: string;
      labels?: string[];
      nodeKind?: "focus" | "entity";
      entityLabel?: string;
    }>;
    links: Array<{
      source: string;
      target: string;
      type: string;
    }>;
    focusNodeId?: string;
  };
};

type UnavailableRelationship = NonNullable<
  NonNullable<QueryBuilderCompileResponse["diagnostics"]>["unavailableRelationships"]
>[number];
type ProposedNodeItem = NonNullable<QueryBuilderCompileResponse["proposedAdditions"]>["nodes"][number];
type ProposedRelationshipItem = NonNullable<QueryBuilderCompileResponse["proposedAdditions"]>["relationships"][number];

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

function DirectionToggle({
  value,
  onChange,
}: {
  value: "outbound" | "inbound";
  onChange: (next: "outbound" | "inbound") => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/60 p-1">
      <button
        type="button"
        onClick={() => onChange("outbound")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
          value === "outbound"
            ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow"
            : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        }`}
      >
        outbound
      </button>
      <button
        type="button"
        onClick={() => onChange("inbound")}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
          value === "inbound"
            ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow"
            : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        }`}
      >
        inbound
      </button>
    </div>
  );
}

export function QueryBuilderSlice() {
  const [formState, setFormState] = useState<QueryBuilderFormState>(DEFAULT_FORM_STATE);
  const [steps, setSteps] = useState<QueryBuilderStepState[]>([{ ...DEFAULT_STEP }]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryBuilderCompileResponse | null>(null);
  const [executeResult, setExecuteResult] = useState<QueryBuilderExecuteResponse | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [acceptedProposalKeys, setAcceptedProposalKeys] = useState<Set<string>>(new Set());
  const graphContainerRef = useRef<HTMLDivElement | null>(null);

  const canRemoveStep = steps.length > 0;

  const sentencePreview = useMemo(() => {
    const startValue = formState.propertyFilter.trim();
    const startPart = startValue
      ? `Find ${formState.entityType} matching "${startValue}"`
      : `Find ${formState.entityType}`;
    const clauses = steps.map((step) => {
      const directionPhrase = step.direction === "outbound" ? "that connect via" : "that are connected by";
      const filterPart = step.propertyFilter.trim() ? ` where ${step.targetEntity} contains "${step.propertyFilter.trim()}"` : "";
      return `${directionPhrase} ${step.relationship} to ${step.targetEntity}${filterPart}`;
    });
    return `${startPart}${clauses.length ? `, ${clauses.join(", and ")}` : ""}.`;
  }, [formState, steps]);

  function updateStep(index: number, patch: Partial<QueryBuilderStepState>) {
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  function addStep(initial?: Partial<QueryBuilderStepState>) {
    setSteps((current) => [...current, { ...DEFAULT_STEP, ...initial }]);
  }

  function addSuggestedStep(option?: NextOption) {
    if (!option) {
      addStep();
      return;
    }
    const relationship = toRelationshipType(option.relationshipType) ?? DEFAULT_STEP.relationship;
    const targetEntity =
      option.targetLabels.map(toEntityLabel).find((label): label is EntityLabel => Boolean(label)) ??
      DEFAULT_STEP.targetEntity;
    addStep({ relationship, direction: option.direction, targetEntity, propertyFilter: "" });
  }

  function removeStep(index: number) {
    setSteps((current) => {
      if (current.length <= 1) return [];
      return current.filter((_, i) => i !== index);
    });
  }

  function buildQueryState() {
    return {
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
  }

  async function handleCompile() {
    setLoading(true);
    setError(null);
    const queryState = buildQueryState();

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
        throw new Error("error" in payload && payload.error ? payload.error : "Failed to compile query preview");
      }
      setResult(payload as QueryBuilderCompileResponse);
    } catch (compileError) {
      setResult(null);
      setError(compileError instanceof Error ? compileError.message : "Failed to compile query preview");
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    setLoading(true);
    setError(null);
    const queryState = buildQueryState();

    try {
      const response = await fetch(`${getApiBase()}/api/query-builder/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ queryState }),
      });
      const payload = (await response.json()) as QueryBuilderExecuteResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Failed to run query");
      }
      const executed = payload as QueryBuilderExecuteResponse;
      setExecuteResult(executed);
      setSelectedNodeId(executed.graph.focusNodeId ?? executed.graph.nodes[0]?.id ?? null);
      setResult((current) =>
        current
          ? {
              ...current,
              compiled: executed.compiled,
            }
          : current
      );
    } catch (executeError) {
      setExecuteResult(null);
      setSelectedNodeId(null);
      setError(executeError instanceof Error ? executeError.message : "Failed to run query");
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
        throw new Error("error" in payload && payload.error ? payload.error : "Failed to interpret prompt");
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
        setSteps(interpretedSteps.length ? interpretedSteps : [{ ...DEFAULT_STEP }]);
      }
      setResult(interpreted);
      setExecuteResult(null);
      setSelectedNodeId(null);
      setFeedbackStatus(null);
      setAcceptedProposalKeys(new Set());
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
    setPrompt("");
    setResult(null);
    setExecuteResult(null);
    setSelectedNodeId(null);
    setError(null);
    setFeedbackStatus(null);
    setAcceptedProposalKeys(new Set());
  }

  async function sendFeedback(params: {
    targetTraceId: string;
    rating: 1 | -1;
    context: "interpret" | "execute";
    wasEmpty?: boolean;
  }) {
    try {
      const response = await fetch(`${getApiBase()}/api/query-builder/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Failed to record feedback");
      }
      setFeedbackStatus("Feedback saved");
    } catch (feedbackError) {
      setFeedbackStatus(feedbackError instanceof Error ? feedbackError.message : "Failed to record feedback");
    }
  }

  async function approveRelationship(item: UnavailableRelationship) {
    try {
      const response = await fetch(`${getApiBase()}/api/query-builder/approve-relationship`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          proposalId: item.proposalId,
          relationshipType: item.relationshipType,
          direction: item.direction,
          fromLabel: item.fromLabel,
          toLabel: item.toLabel,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to approve relationship");
      }
      setResult((current) => {
        if (!current?.diagnostics?.unavailableRelationships) return current;
        return {
          ...current,
          diagnostics: {
            ...current.diagnostics,
            unavailableRelationships: current.diagnostics.unavailableRelationships.map((entry) =>
              entry.proposalId === item.proposalId ? { ...entry, status: "accepted" } : entry
            ),
          },
        };
      });
      setFeedbackStatus("Relationship approved and ontology updated.");
    } catch (approvalError) {
      setFeedbackStatus(approvalError instanceof Error ? approvalError.message : "Failed to approve relationship");
    }
  }

  async function acceptProposedNode(node: ProposedNodeItem) {
    try {
      const response = await fetch(`${getApiBase()}/api/query-builder/accept-proposal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          kind: "node",
          node,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to persist node proposal");
      }
      setAcceptedProposalKeys((current) => {
        const next = new Set(current);
        next.add(node.canonicalKey);
        return next;
      });
      setFeedbackStatus("Accepted node persisted to Neo4j.");
    } catch (acceptError) {
      setFeedbackStatus(acceptError instanceof Error ? acceptError.message : "Failed to persist node proposal");
    }
  }

  async function acceptProposedRelationship(relationship: ProposedRelationshipItem) {
    if (!result?.proposedAdditions?.nodes) return;
    try {
      const response = await fetch(`${getApiBase()}/api/query-builder/accept-proposal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          kind: "relationship",
          relationship,
          nodes: result.proposedAdditions.nodes,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to persist relationship proposal");
      }
      setAcceptedProposalKeys((current) => {
        const next = new Set(current);
        next.add(relationship.canonicalKey);
        return next;
      });
      setFeedbackStatus("Accepted relationship persisted to Neo4j.");
    } catch (acceptError) {
      setFeedbackStatus(acceptError instanceof Error ? acceptError.message : "Failed to persist relationship proposal");
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-none bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 text-white shadow-xl">
        <CardContent className="p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-300">Fuzzy-assisted query authoring</p>
              <h2 className="mt-1 text-lg font-semibold">Compose intent first, refine clauses second</h2>
              <p className="mt-1 text-sm text-zinc-300">{sentencePreview}</p>
            </div>
            <div className="flex w-full gap-2 lg:w-auto">
              <Input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder='Try: "artists influenced by adrian"'
                className="h-10 min-w-[280px] border-zinc-500/50 bg-zinc-950/30 text-zinc-100 placeholder:text-zinc-400"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleInterpret()}
                disabled={loading || !prompt.trim()}
                className="h-10 whitespace-nowrap bg-white text-zinc-900 hover:bg-zinc-100"
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                Interpret
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Card className="shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" />
              Clause Builder
            </CardTitle>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Sparnatural-style progressive clauses: subject -> relation -> direction -> target.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 p-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Start entity</span>
                <select
                  value={formState.entityType}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, entityType: event.target.value as EntityLabel }))
                  }
                  className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                >
                  {ENTITY_LABELS.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Start filter</span>
                <Input
                  value={formState.propertyFilter}
                  onChange={(event) => setFormState((current) => ({ ...current, propertyFilter: event.target.value }))}
                  placeholder="e.g. adrian"
                />
              </label>
            </div>

            <div className="space-y-3">
              {steps.map((step, index) => (
                <div key={`row-${index}`} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                      Clause {index + 1}
                    </p>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeStep(index)} disabled={loading || !canRemoveStep}>
                      Remove
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">Relationship</span>
                      <select
                        value={step.relationship}
                        onChange={(event) => updateStep(index, { relationship: event.target.value as RelationshipType })}
                        className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                      >
                        {RELATIONSHIP_TYPES.map((relationship) => (
                          <option key={relationship} value={relationship}>
                            {relationship}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">Target entity</span>
                      <select
                        value={step.targetEntity}
                        onChange={(event) => updateStep(index, { targetEntity: event.target.value as EntityLabel })}
                        className="h-10 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                      >
                        {ENTITY_LABELS.map((label) => (
                          <option key={label} value={label}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="space-y-1">
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">Direction</span>
                      <DirectionToggle value={step.direction} onChange={(next) => updateStep(index, { direction: next })} />
                    </div>
                    <label className="space-y-1">
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">Target filter</span>
                      <Input
                        value={step.propertyFilter}
                        onChange={(event) => updateStep(index, { propertyFilter: event.target.value })}
                        placeholder="e.g. guitar"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-[hsl(var(--border))] pt-3">
              <Button type="button" variant="outline" onClick={() => addStep()} disabled={loading}>
                <Plus className="mr-2 h-4 w-4" />
                Add Clause
              </Button>
              <Button type="button" variant="outline" onClick={() => addSuggestedStep()} disabled={loading}>
                Add Suggested
              </Button>
              <Button type="button" onClick={() => void handleCompile()} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Compile
              </Button>
              <Button type="button" variant="secondary" onClick={() => void handleExecute()} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Run Query
              </Button>
              <Button type="button" variant="ghost" onClick={resetForm} disabled={loading}>
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Execution Preview</CardTitle>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Inspect interpreted rationale, Cypher, and parameters before running full flows.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                Could not compile preview: {error}
              </div>
            ) : null}

            <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 p-3">
              <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Summary</p>
              <p className="mt-2 text-sm">{result?.summary ?? sentencePreview}</p>
              {result?.answerMarkdown ? (
                <div className="mt-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2">
                  <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    Research answer
                    {result.answerStrategy ? ` (${result.answerStrategy})` : ""}
                  </p>
                  <pre className="mt-1 whitespace-pre-wrap text-xs">{result.answerMarkdown}</pre>
                </div>
              ) : null}
              {!result?.answerMarkdown && result?.researchReason ? (
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Research answer: {result.researchReason}</p>
              ) : null}
              {result?.strategy ? (
                <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                  Strategy: {result.strategy}
                  {result.usedInsightIds?.length ? ` • Insights reused: ${result.usedInsightIds.length}` : ""}
                </p>
              ) : null}
              {result?.rationale ? (
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{result.rationale}</p>
              ) : null}
              {result?.proposedAdditions ? (
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  Proposed additions: {result.proposedAdditions.nodes.length} nodes,{" "}
                  {result.proposedAdditions.relationships.length} relationships.
                </p>
              ) : null}
            </div>

            {result?.proposedAdditions ? (
              <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Proposed nodes</p>
                {result.proposedAdditions.nodes.length === 0 ? (
                  <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">No proposed nodes.</p>
                ) : (
                  <div className="mt-2 max-h-40 space-y-2 overflow-auto">
                    {result.proposedAdditions.nodes.map((node) => {
                      const accepted = acceptedProposalKeys.has(node.canonicalKey);
                      return (
                        <div key={node.canonicalKey} className="flex items-center justify-between rounded border p-2">
                          <p className="text-xs">
                            {node.label}: {node.value}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void acceptProposedNode(node)}
                            disabled={loading || accepted}
                          >
                            {accepted ? "Accepted" : "Accept"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {result?.proposedAdditions ? (
              <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Proposed relationships</p>
                {result.proposedAdditions.relationships.length === 0 ? (
                  <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">No proposed relationships.</p>
                ) : (
                  <div className="mt-2 max-h-48 space-y-2 overflow-auto">
                    {result.proposedAdditions.relationships.map((rel) => {
                      const accepted = acceptedProposalKeys.has(rel.canonicalKey);
                      return (
                        <div key={rel.canonicalKey} className="flex items-center justify-between rounded border p-2">
                          <p className="text-xs">
                            {rel.fromCanonicalKey} {rel.direction === "outbound" ? "->" : "<-"} {rel.type} -> {rel.toCanonicalKey}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void acceptProposedRelationship(rel)}
                            disabled={loading || accepted}
                          >
                            {accepted ? "Accepted" : "Accept"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {result?.nextOptions && result.nextOptions.length > 0 ? (
              <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Suggested continuations</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.nextOptions.slice(0, 8).map((option, index) => (
                    <button
                      key={`${option.relationshipType}-${index}`}
                      type="button"
                      onClick={() => addSuggestedStep(option)}
                      className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 px-3 py-1 text-xs transition hover:bg-[hsl(var(--muted))]"
                    >
                      {option.direction === "outbound" ? "->" : "<-"} {option.relationshipType} -> {option.targetLabels[0] ?? "Entity"}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3">
              <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Cypher</p>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">{result?.compiled.cypher ?? "--"}</pre>
                {result?.compileBlockedReason ? (
                  <p className="mt-2 text-xs text-amber-700">Compile blocked: {result.compileBlockedReason}</p>
                ) : null}
              </div>
              <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Params</p>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs">
                  {result ? JSON.stringify(result.compiled.params, null, 2) : "--"}
                </pre>
              </div>
            </div>

            {result?.traceId ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Trace ID: {result.traceId}</p>
            ) : null}
            {result?.diagnostics?.unavailableRelationships?.length ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                <p>Unavailable relationships were kept as proposed candidates.</p>
                <div className="mt-2 space-y-2">
                  {result.diagnostics.unavailableRelationships.map((item) => (
                    <div key={item.proposalId} className="rounded border border-amber-300 bg-amber-100/40 p-2">
                      <p>
                        {item.fromLabel} {item.direction === "outbound" ? "->" : "<-"} {item.relationshipType} -> {item.toLabel}
                      </p>
                      <p className="mt-1">State: {item.status}</p>
                      <p className="mt-1">Allowed targets: {item.allowedTargets.join(", ") || "none"}</p>
                      <div className="mt-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void approveRelationship(item)}
                          disabled={loading || item.status === "accepted"}
                        >
                          {item.status === "accepted" ? "Accepted" : "Approve relationship"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {result?.traceId ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void sendFeedback({ targetTraceId: result.traceId, rating: 1, context: "interpret" })}
                  disabled={loading}
                >
                  <ThumbsUp className="mr-2 h-4 w-4" />
                  Helpful
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void sendFeedback({ targetTraceId: result.traceId, rating: -1, context: "interpret" })}
                  disabled={loading}
                >
                  <ThumbsDown className="mr-2 h-4 w-4" />
                  Not helpful
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Live Result Graph</CardTitle>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Execute compiled Cypher against Neo4j and inspect returned nodes, links, and sample match chains.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!executeResult ? (
            <div className="rounded-lg border border-dashed border-[hsl(var(--border))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
              No executed result yet. Click <span className="font-medium text-[hsl(var(--foreground))]">Run Query</span> to fetch live graph data.
            </div>
          ) : (
            <>
              {executeResult.fallback?.applied ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                  {executeResult.fallback.reason} Fallback seed: "{executeResult.fallback.candidate}" ({executeResult.fallback.resultCount} match
                  {executeResult.fallback.resultCount === 1 ? "" : "es"}).
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                  <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Matched paths</p>
                  <p className="mt-1 text-base font-semibold">{executeResult.resultCount}</p>
                </div>
                <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                  <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Nodes</p>
                  <p className="mt-1 text-base font-semibold">{executeResult.graph.nodes.length}</p>
                </div>
                <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                  <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Links</p>
                  <p className="mt-1 text-base font-semibold">{executeResult.graph.links.length}</p>
                </div>
              </div>

              <div
                ref={graphContainerRef}
                className="relative h-[28rem] overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]"
              >
                {executeResult.graph.nodes.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
                    Query ran but returned zero rows. Try a broader start filter, a different relationship, or no target filter.
                  </div>
                ) : (
                  <GraphView2D
                    graphData={executeResult.graph}
                    focusNodeId={selectedNodeId ?? executeResult.graph.focusNodeId}
                    expandedTypeKeys={[]}
                    onNodeClick={(node) => setSelectedNodeId(node.id)}
                    onNodeDragEnd={() => {}}
                    showEdgeLabels={false}
                    highlightEnriched={false}
                    recentEnrichedNodeIds={new Set<string>()}
                    containerRef={graphContainerRef}
                  />
                )}
              </div>

              {executeResult.sampleMatches.length > 0 ? (
                <div className="rounded-lg border border-[hsl(var(--border))] p-3">
                  <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Sample matches</p>
                  <div className="mt-2 space-y-1.5 text-sm">
                    {executeResult.sampleMatches.map((match, index) => (
                      <p key={`match-${index}`} className="truncate">
                        {match.chain.join(" -> ")}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void sendFeedback({
                      targetTraceId: executeResult.traceId,
                      rating: 1,
                      context: "execute",
                      wasEmpty: executeResult.resultCount === 0,
                    })
                  }
                  disabled={loading}
                >
                  <ThumbsUp className="mr-2 h-4 w-4" />
                  Helpful
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void sendFeedback({
                      targetTraceId: executeResult.traceId,
                      rating: -1,
                      context: "execute",
                      wasEmpty: executeResult.resultCount === 0,
                    })
                  }
                  disabled={loading}
                >
                  <ThumbsDown className="mr-2 h-4 w-4" />
                  Not helpful
                </Button>
              </div>
            </>
          )}
          {feedbackStatus ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{feedbackStatus}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
