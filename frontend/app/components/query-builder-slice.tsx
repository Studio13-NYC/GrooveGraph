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
  relationship: RelationshipType;
  targetEntity: EntityLabel;
  propertyFilter: string;
};

type QueryBuilderCompileResponse = {
  traceId: string;
  summary: string;
  compiled: {
    cypher: string;
    params: Record<string, unknown>;
  };
};

const DEFAULT_FORM_STATE: QueryBuilderFormState = {
  entityType: "Artist",
  relationship: "PLAYED_INSTRUMENT",
  targetEntity: "Instrument",
  propertyFilter: "",
};

function getPropertyKeyForLabel(label: EntityLabel): string {
  return label === "Venue" ? "venue" : "name";
}

export function QueryBuilderSlice() {
  const [formState, setFormState] = useState<QueryBuilderFormState>(DEFAULT_FORM_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryBuilderCompileResponse | null>(null);

  const userSummary = useMemo(() => {
    const filterLabel = formState.propertyFilter.trim()
      ? ` filtered by "${formState.propertyFilter.trim()}"`
      : " with no property filter";
    return `${formState.entityType} ${formState.relationship} ${formState.targetEntity}${filterLabel}`;
  }, [formState.entityType, formState.relationship, formState.targetEntity, formState.propertyFilter]);

  async function handleCompile() {
    setLoading(true);
    setError(null);

    const propertyFilter = formState.propertyFilter.trim();
    const queryState = {
      start: {
        label: formState.entityType,
        propertyKey: getPropertyKeyForLabel(formState.entityType),
        value: propertyFilter,
      },
      steps: [
        {
          relationshipType: formState.relationship,
          direction: "outbound" as const,
          target: {
            label: formState.targetEntity,
            propertyKey: getPropertyKeyForLabel(formState.targetEntity),
            value: propertyFilter,
          },
        },
      ],
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

  function resetForm() {
    setFormState(DEFAULT_FORM_STATE);
    setResult(null);
    setError(null);
  }

  return (
    <div className="grid gap-4 md:grid-cols-5">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Query Builder (First Slice)</CardTitle>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Compose one ontology-aware row and compile a live Cypher preview.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium">Entity type</span>
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
            <span className="text-sm font-medium">Relationship</span>
            <select
              value={formState.relationship}
              onChange={(event) =>
                setFormState((current) => ({ ...current, relationship: event.target.value as RelationshipType }))
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
            <span className="text-sm font-medium">Target entity</span>
            <select
              value={formState.targetEntity}
              onChange={(event) =>
                setFormState((current) => ({ ...current, targetEntity: event.target.value as EntityLabel }))
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
            <span className="text-sm font-medium">Optional property filter</span>
            <Input
              value={formState.propertyFilter}
              onChange={(event) => setFormState((current) => ({ ...current, propertyFilter: event.target.value }))}
              placeholder="e.g. guitar"
            />
          </label>

          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => void handleCompile()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Compile Cypher Preview
            </Button>
            <Button type="button" variant="outline" onClick={resetForm} disabled={loading}>
              Reset Row
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
