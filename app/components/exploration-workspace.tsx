"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { EntitySearchControls } from "./entity-search-controls";
import { GraphLegend } from "./graph-legend";
import {
  getEntityDescriptionNoun,
  getEntityDisplayName,
  getEntityEmptyHint,
  getEntityExample,
  isEntityLabel,
  type EntityLabel,
} from "@/lib/entity-config";
import type {
  ExplorationViewMode,
  GraphNodePayload,
  QueryResultPayload,
} from "@/lib/exploration-types";
import { getLinkColor, getNodeColor } from "../lib/graph-viz";

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d").then((module) => module.default),
  { ssr: false }
);

const NODE_RADIUS = 6;
const COLUMN_GAP = 240;
const ROW_GAP = 92;
const GUIDED_ENTITY_TYPES: EntityLabel[] = ["Artist", "Genre", "Label", "Venue"];

type PropertyChange = {
  key: string;
  value: unknown;
  action: "created" | "updated";
  targetId: string;
  targetLabel: string;
};

type NodeChange = {
  id: string;
  label: string;
  name: string;
  action: "created" | "matched_existing" | "updated_existing";
  changedProperties: string[];
};

type EdgeChange = {
  id: string;
  type: string;
  fromNodeId: string;
  toNodeId: string;
  fromName: string;
  toName: string;
  action: "created" | "matched_existing" | "updated_existing";
  changedProperties: string[];
};

type EnrichFeedback = {
  summary: string;
  sourcesUsed: string[];
  propertyChanges: PropertyChange[];
  nodeChanges: NodeChange[];
  edgeChanges: EdgeChange[];
} | null;

type GraphState = {
  nodes: GraphNodePayload[];
  links: Array<{
    source:
      | string
      | {
          id?: string;
        };
    target:
      | string
      | {
          id?: string;
        };
    type: string;
  }>;
  focusNodeId?: string;
};

type GraphRenderNode = GraphNodePayload & {
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  vx?: number;
  vy?: number;
};

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function normalizeEntityType(value: string | null): EntityLabel {
  return value && isEntityLabel(value) ? value : "Artist";
}

function getLayoutColumn(label: string, focusLabel: string): number {
  if (label === focusLabel) return 0;

  if (focusLabel === "Artist") {
    if (label === "Album" || label === "Release") return 1;
    if (label === "Track" || label === "SongWork") return 2;
    return 3;
  }

  if (focusLabel === "Album" || focusLabel === "Release") {
    if (label === "Artist") return 0;
    if (label === "Album" || label === "Release") return 1;
    if (label === "Track" || label === "SongWork") return 2;
    return 3;
  }

  if (focusLabel === "Track" || focusLabel === "SongWork") {
    if (label === "Artist") return 0;
    if (label === "Album" || label === "Release") return 1;
    if (label === "Track" || label === "SongWork") return 2;
    return 3;
  }

  if (focusLabel === "Genre") {
    if (label === "Artist") return 1;
    if (label === "Album" || label === "Release") return 2;
    if (label === "Track" || label === "SongWork") return 3;
    return 2;
  }

  if (label === "Artist") return 1;
  if (label === "Album" || label === "Release") return 2;
  if (label === "Track" || label === "SongWork") return 3;
  return 2;
}

function applySemanticLayout(graph: GraphState): GraphState {
  if (graph.nodes.length === 0) return graph;

  const focusNode =
    graph.nodes.find((node) => node.id === graph.focusNodeId) ?? graph.nodes[0];
  if (!focusNode) return graph;

  const focusLabel = focusNode.label;
  const orderedNodes = [...graph.nodes].sort((left, right) => {
    const leftColumn = getLayoutColumn(left.label, focusLabel);
    const rightColumn = getLayoutColumn(right.label, focusLabel);
    if (left.id === focusNode.id) return -1;
    if (right.id === focusNode.id) return 1;
    if (leftColumn !== rightColumn) return leftColumn - rightColumn;
    if (left.label !== right.label) {
      return left.label.localeCompare(right.label, "en", { sensitivity: "base" });
    }
    return left.name.localeCompare(right.name, "en", { sensitivity: "base" });
  });

  const columnBuckets = new Map<number, GraphRenderNode[]>();
  for (const node of orderedNodes) {
    const column = node.id === focusNode.id ? 0 : getLayoutColumn(node.label, focusLabel);
    const bucket = columnBuckets.get(column) ?? [];
    bucket.push({ ...node });
    columnBuckets.set(column, bucket);
  }

  const columns = [...columnBuckets.keys()].sort((a, b) => a - b);
  const offset = (columns.length - 1) / 2;
  const positionedNodes = new Map<string, GraphRenderNode>();

  for (const column of columns) {
    const bucket = columnBuckets.get(column) ?? [];
    const verticalOffset = (bucket.length - 1) / 2;
    bucket.forEach((node, index) => {
      const x = (column - offset) * COLUMN_GAP;
      const y = node.id === focusNode.id ? 0 : (index - verticalOffset) * ROW_GAP;
      positionedNodes.set(node.id, {
        ...node,
        x,
        y,
        fx: x,
        fy: y,
      });
    });
  }

  return {
    ...graph,
    nodes: graph.nodes.map((node) => positionedNodes.get(node.id) ?? node),
  };
}

function freezeGraphPositions(graph: GraphState): GraphState {
  let changed = false;
  const nodes = graph.nodes.map((node) => {
    const nextX = node.x;
    const nextY = node.y;
    const nextFx = nextX ?? node.fx;
    const nextFy = nextY ?? node.fy;
    if (
      nextFx !== undefined &&
      nextFy !== undefined &&
      (node.fx !== nextFx || node.fy !== nextFy)
    ) {
      changed = true;
    }
    return {
      ...node,
      fx: nextFx,
      fy: nextFy,
    };
  });

  return changed ? { ...graph, nodes } : graph;
}

export function ExplorationWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const graphRef = useRef<{
    zoomToFit?: (durationMs?: number, paddingPx?: number) => void;
  } | null>(null);

  const initialEntityType = normalizeEntityType(searchParams.get("entityType"));
  const initialQuery = searchParams.get("query") ?? searchParams.get("q") ?? searchParams.get("artist") ?? "";
  const initialView: ExplorationViewMode = searchParams.get("view") === "query" ? "query" : "graph";

  const [entityType, setEntityType] = useState<EntityLabel>(initialEntityType);
  const [searchText, setSearchText] = useState(initialQuery);
  const [viewMode, setViewMode] = useState<ExplorationViewMode>(initialView);
  const [queryResult, setQueryResult] = useState<QueryResultPayload | null>(null);
  const [graphState, setGraphState] = useState<GraphState>({ nodes: [], links: [] });
  const [queryError, setQueryError] = useState<string | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [showEdgeLabels, setShowEdgeLabels] = useState(false);
  const [highlightEnriched, setHighlightEnriched] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<GraphNodePayload | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNodePayload | null>(null);
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);
  const [enrichFeedback, setEnrichFeedback] = useState<EnrichFeedback>(null);
  const [recentEnrichedNodeIds, setRecentEnrichedNodeIds] = useState<Set<string>>(new Set());
  const [graphInstanceKey, setGraphInstanceKey] = useState(0);

  const activeNode = hoveredNode ?? selectedNode;
  const loading = loadingQuery || loadingGraph;

  const syncUrl = useCallback(
    (nextEntityType: EntityLabel, nextQuery: string, nextView: ExplorationViewMode) => {
      const params = new URLSearchParams();
      params.set("view", nextView);
      params.set("entityType", nextEntityType);
      if (nextQuery.trim()) {
        params.set("query", nextQuery.trim());
      }
      const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      router.replace(nextUrl, { scroll: false });
    },
    [pathname, router]
  );

  const loadContext = useCallback(
    async (
      nextEntityType: EntityLabel = entityType,
      nextQuery: string = searchText,
      options?: { preserveFeedback?: boolean }
    ) => {
      const trimmedQuery = nextQuery.trim();
      syncUrl(nextEntityType, trimmedQuery, viewMode);
      if (!options?.preserveFeedback) {
        setEnrichFeedback(null);
        setRecentEnrichedNodeIds(new Set());
      }
      setQueryError(null);
      setGraphError(null);
      setLoadingGraph(true);
      setLoadingQuery(Boolean(trimmedQuery));

      try {
        const graphParams = new URLSearchParams({ entityType: nextEntityType });
        if (trimmedQuery) {
          graphParams.set("query", trimmedQuery);
        } else {
          graphParams.set("random", "1");
        }

        const graphPromise = fetch(`/api/graph?${graphParams.toString()}`).then(async (response) => {
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || "Failed to load graph");
          }
          return data;
        });

        const queryPromise = trimmedQuery
          ? fetch("/api/query-artist", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ entityType: nextEntityType, query: trimmedQuery }),
            }).then(async (response) => {
              const data = await response.json();
              if (!response.ok) {
                throw new Error(data.error || "Query failed");
              }
              return data.result as QueryResultPayload;
            })
          : Promise.resolve<QueryResultPayload | null>(null);

        const [graphResult, queryResponse] = await Promise.allSettled([graphPromise, queryPromise]);

        if (graphResult.status === "fulfilled") {
          const nextGraph = applySemanticLayout({
            nodes: Array.isArray(graphResult.value.nodes) ? graphResult.value.nodes : [],
            links: Array.isArray(graphResult.value.links) ? graphResult.value.links : [],
            focusNodeId:
              typeof graphResult.value.focusNodeId === "string" ? graphResult.value.focusNodeId : undefined,
          });
          setGraphState(nextGraph);
          setGraphInstanceKey((current) => current + 1);
          const focusNode =
            nextGraph.nodes.find((node) => node.id === nextGraph.focusNodeId) ??
            nextGraph.nodes[0] ??
            null;
          setSelectedNode(focusNode);
        } else {
          setGraphState({ nodes: [], links: [] });
          setSelectedNode(null);
          setGraphError(graphResult.reason instanceof Error ? graphResult.reason.message : "Failed to load graph");
        }

        if (queryResponse.status === "fulfilled") {
          setQueryResult(queryResponse.value);
          if (!trimmedQuery) {
            setQueryResult(null);
          }
        } else if (trimmedQuery) {
          setQueryResult(null);
          setQueryError(
            queryResponse.reason instanceof Error ? queryResponse.reason.message : "Failed to load summary"
          );
        } else {
          setQueryResult(null);
        }
      } finally {
        setLoadingGraph(false);
        setLoadingQuery(false);
      }
    },
    [entityType, searchText, syncUrl, viewMode]
  );

  useEffect(() => {
    if (hasAutoLoaded) return;
    setHasAutoLoaded(true);
    void loadContext(initialEntityType, initialQuery);
  }, [hasAutoLoaded, initialEntityType, initialQuery, loadContext]);

  const graphData = useMemo(
    () => ({
      nodes: graphState.nodes.map((node) => ({ ...node })),
      links: graphState.links.map((link) => ({
        source:
          typeof link.source === "string"
            ? link.source
            : String(link.source?.id ?? ""),
        target:
          typeof link.target === "string"
            ? link.target
            : String(link.target?.id ?? ""),
        type: link.type,
      })),
    }),
    [graphState]
  );

  const resetGraphLayout = useCallback(() => {
    setGraphState((current) => applySemanticLayout(current));
    setGraphInstanceKey((current) => current + 1);
  }, []);

  const errorMessage = queryError ?? graphError;

  async function handleEnrich() {
    if (!queryResult || (queryResult.entityType !== "Artist" && queryResult.entityType !== "Album")) {
      return;
    }
    try {
      const response = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: queryResult.entityType.toLowerCase(),
          id: queryResult.id,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Enrichment failed");
      }
      const nextFeedback: EnrichFeedback = {
        summary: String(data.message ?? "Enrichment applied."),
        sourcesUsed: Array.isArray(data.sourcesUsed) ? data.sourcesUsed : [],
        propertyChanges: Array.isArray(data.propertyChanges) ? data.propertyChanges : [],
        nodeChanges: Array.isArray(data.nodeChanges) ? data.nodeChanges : [],
        edgeChanges: Array.isArray(data.edgeChanges) ? data.edgeChanges : [],
      };
      setEnrichFeedback(nextFeedback);
      setRecentEnrichedNodeIds(
        new Set([
          queryResult.id,
          ...nextFeedback.nodeChanges.map((change) => change.id),
          ...(nextFeedback.propertyChanges.length > 0 ? [queryResult.id] : []),
        ])
      );
      await loadContext(entityType, searchText, { preserveFeedback: true });
    } catch (error) {
      setEnrichFeedback({
        summary: error instanceof Error ? error.message : "Enrichment failed",
        sourcesUsed: [],
        propertyChanges: [],
        nodeChanges: [],
        edgeChanges: [],
      });
    }
  }

  function handleViewChange(nextView: ExplorationViewMode) {
    setViewMode(nextView);
    syncUrl(entityType, searchText, nextView);
  }

  function renderQueryPanel() {
    if (!queryResult) {
      return (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {searchText.trim()
                ? `No ${getEntityDescriptionNoun(entityType)} summary is available yet.`
                : getEntityEmptyHint(entityType)}
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                <span>{getEntityDisplayName(queryResult.entityType)}</span>
                {queryResult.sourceBadges.map((badge) => (
                  <span
                    key={badge}
                    className="rounded-full bg-[hsl(var(--muted))] px-2 py-1 text-[10px] font-medium text-[hsl(var(--muted-foreground))]"
                  >
                    {badge}
                  </span>
                ))}
              </div>
              <CardTitle className="text-xl">{queryResult.name}</CardTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">{queryResult.summary}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(queryResult.entityType === "Artist" || queryResult.entityType === "Album") && (
                <Button variant="outline" size="sm" onClick={handleEnrich}>
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  Enrich {getEntityDescriptionNoun(queryResult.entityType)}
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => handleViewChange("graph")}>
                Show in graph
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
            <div className="space-y-4">
              {queryResult.propertyFacts.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                    Key facts
                  </p>
                  <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                    {queryResult.propertyFacts.map((fact) => (
                      <div key={fact.key} className="rounded-lg border border-[hsl(var(--border))] p-3">
                        <dt className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                          {fact.label}
                        </dt>
                        <dd className="mt-1 text-sm font-medium">{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Connected entities
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {queryResult.relatedEntityCounts.map((item) => (
                    <span
                      key={item.key}
                      className="rounded-full border border-[hsl(var(--border))] px-3 py-1 text-xs text-[hsl(var(--muted-foreground))]"
                    >
                      {getEntityDisplayName(item.key)} {item.count}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Relationship types
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {queryResult.relationshipCounts.map((item) => (
                    <span
                      key={item.key}
                      className="rounded-full bg-[hsl(var(--muted))] px-3 py-1 text-xs text-[hsl(var(--muted-foreground))]"
                    >
                      {item.key.replace(/_/g, " ")} {item.count}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  Discovery preview
                </p>
                <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                  {queryResult.relatedItems.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">
                          {getEntityDisplayName(item.label)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                        {item.direction === "outbound" ? "Outgoing" : "Incoming"} via{" "}
                        {item.relationshipType.replace(/_/g, " ")}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderEnrichmentPanel() {
    if (!enrichFeedback) return null;

    return (
      <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-amber-800 dark:text-amber-200">{enrichFeedback.summary}</p>
            {enrichFeedback.sourcesUsed.map((source) => (
              <span
                key={source}
                className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-900/50 dark:text-amber-100"
              >
                {source}
              </span>
            ))}
          </div>

          {enrichFeedback.propertyChanges.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
                Properties persisted
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-900 dark:text-amber-100">
                {enrichFeedback.propertyChanges.map((change) => (
                  <li key={`${change.targetId}-${change.key}`}>
                    <span className="font-medium">{change.key}</span>: {formatValue(change.value)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {enrichFeedback.nodeChanges.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
                Entities identified
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-900 dark:text-amber-100">
                {enrichFeedback.nodeChanges.map((change) => (
                  <li key={change.id}>
                    <span className="font-medium">{change.label}</span> {change.name} (
                    {change.action.replace(/_/g, " ")})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {enrichFeedback.edgeChanges.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
                Relationships identified
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-900 dark:text-amber-100">
                {enrichFeedback.edgeChanges.map((change) => (
                  <li key={change.id}>
                    <span className="font-medium">{change.type}</span>: {change.fromName} -&gt;{" "}
                    {change.toName} ({change.action.replace(/_/g, " ")})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderGraphPanel() {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
              <input
                type="checkbox"
                checked={showEdgeLabels}
                onChange={(event) => setShowEdgeLabels(event.target.checked)}
                className="h-4 w-4 rounded border-[hsl(var(--border))]"
              />
              Edge labels
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
              <input
                type="checkbox"
                checked={highlightEnriched}
                onChange={(event) => setHighlightEnriched(event.target.checked)}
                className="h-4 w-4 rounded border-[hsl(var(--border))]"
              />
              Highlight enriched nodes
            </label>
            <Button variant="outline" size="sm" onClick={resetGraphLayout}>
              Reset layout
            </Button>
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Drag nodes to pin them where you drop them, scroll to zoom, and pan to inspect relationships.
          </p>
        </div>

        <div className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          {activeNode && (
            <div className="absolute bottom-3 left-3 z-10 max-h-[40vh] w-80 overflow-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 shadow-lg">
              <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                {getEntityDisplayName(activeNode.label)}
              </p>
              <p className="mt-1 font-medium text-[hsl(var(--foreground))]">{activeNode.name}</p>
              <div className="mt-3 space-y-1.5 border-t border-[hsl(var(--border))] pt-2 text-xs text-[hsl(var(--muted-foreground))]">
                {activeNode.country && (
                  <p>
                    <span className="font-medium text-[hsl(var(--foreground))]">Country:</span>{" "}
                    {activeNode.country}
                  </p>
                )}
                {activeNode.active_years && (
                  <p>
                    <span className="font-medium text-[hsl(var(--foreground))]">Active:</span>{" "}
                    {activeNode.active_years}
                  </p>
                )}
                {activeNode.biography && <p className="line-clamp-6">{activeNode.biography}</p>}
                {activeNode.enrichment_source && (
                  <p className="italic">Source: {activeNode.enrichment_source}</p>
                )}
              </div>
            </div>
          )}

          {loadingGraph ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--muted-foreground))]" />
            </div>
          ) : graphData.nodes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
              <p>{getEntityEmptyHint(entityType)}</p>
              <p>Use the controls above or try a guided example.</p>
            </div>
          ) : (
            <ForceGraph2D
              key={graphInstanceKey}
              ref={graphRef as never}
              graphData={graphData}
              nodeLabel={(node) =>
                String((node as { name?: string }).name ?? (node as { id?: string }).id ?? "")
              }
              nodeCanvasObject={(node, ctx, globalScale) => {
                const current = node as GraphRenderNode;
                const x = current.x ?? 0;
                const y = current.y ?? 0;
                const color = getNodeColor(current.label ?? "Track");
                const isHighlighted =
                  highlightEnriched &&
                  (Boolean(current.enrichment_source) || recentEnrichedNodeIds.has(current.id));
                const radius = isHighlighted ? NODE_RADIUS + 2 : NODE_RADIUS;

                if (isHighlighted) {
                  ctx.beginPath();
                  ctx.arc(x, y, radius + 2, 0, 2 * Math.PI);
                  ctx.fillStyle = "rgba(251, 191, 36, 0.25)";
                  ctx.fill();
                }

                ctx.beginPath();
                ctx.arc(x, y, radius, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.strokeStyle = "hsl(var(--border))";
                ctx.lineWidth = 1 / globalScale;
                ctx.stroke();

                const fontSize = 12 / globalScale;
                ctx.font = `${fontSize}px Sans-Serif`;
                const label =
                  current.name.length > 20 ? `${current.name.slice(0, 18)}...` : current.name;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = "hsl(var(--foreground))";
                ctx.fillText(label, x, y + radius + fontSize);
              }}
              linkColor={(link) => getLinkColor((link as { type?: string }).type ?? "")}
              linkCanvasObject={
                showEdgeLabels
                  ? (link, ctx, globalScale) => {
                      const current = link as {
                        source: { x?: number; y?: number };
                        target: { x?: number; y?: number };
                        type?: string;
                      };
                      const x1 = current.source.x ?? 0;
                      const y1 = current.source.y ?? 0;
                      const x2 = current.target.x ?? 0;
                      const y2 = current.target.y ?? 0;
                      const midX = (x1 + x2) / 2;
                      const midY = (y1 + y2) / 2;
                      ctx.beginPath();
                      ctx.moveTo(x1, y1);
                      ctx.lineTo(x2, y2);
                      ctx.strokeStyle = getLinkColor(current.type ?? "");
                      ctx.lineWidth = 1 / globalScale;
                      ctx.stroke();
                      if (!current.type) return;
                      const fontSize = 10 / globalScale;
                      ctx.font = `${fontSize}px Sans-Serif`;
                      ctx.textAlign = "center";
                      ctx.textBaseline = "middle";
                      ctx.fillStyle = "hsl(var(--muted-foreground))";
                      ctx.fillText(current.type, midX, midY);
                    }
                  : undefined
              }
              nodeColor={(node) => getNodeColor((node as { label?: string }).label ?? "Track")}
              onNodeClick={(node) => setSelectedNode(node as GraphNodePayload)}
              onNodeHover={(node) => setHoveredNode(node ? (node as GraphNodePayload) : null)}
              onNodeDragEnd={(node) => {
                const draggedNode = node as GraphRenderNode;
                const nextX = draggedNode.x ?? 0;
                const nextY = draggedNode.y ?? 0;
                draggedNode.fx = nextX;
                draggedNode.fy = nextY;
                setGraphState((current) =>
                  freezeGraphPositions({
                    ...current,
                    nodes: current.nodes.map((item) =>
                      item.id === draggedNode.id
                        ? {
                            ...item,
                            x: nextX,
                            y: nextY,
                            fx: nextX,
                            fy: nextY,
                          }
                        : item
                    ),
                  })
                );
              }}
              backgroundColor="hsl(var(--card))"
              enableZoomInteraction={true}
              enablePanInteraction={true}
              enableNodeDrag={true}
              cooldownTicks={100}
              onEngineStop={() => {
                setGraphState((current) => freezeGraphPositions(current));
              }}
            />
          )}
        </div>

        <GraphLegend />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                Unified exploration
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                Explore artists, genres, labels, venues, and more in one graph-first workspace.
              </h1>
            </div>
            <div className="inline-flex rounded-lg border border-[hsl(var(--border))] p-1">
              <button
                type="button"
                onClick={() => handleViewChange("graph")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === "graph"
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
                }`}
              >
                Graph
              </button>
              <button
                type="button"
                onClick={() => handleViewChange("query")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === "query"
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
                }`}
              >
                Query
              </button>
            </div>
          </div>

          <p className="max-w-3xl text-sm text-[hsl(var(--muted-foreground))]">
            Start from any entity type, inspect its facts, and switch between a graph view and a
            structured query view without losing context. Shared nodes like genres and labels act as
            hubs so previously unknown connections stay discoverable.
          </p>

          <EntitySearchControls
            entityType={entityType}
            query={searchText}
            onEntityTypeChange={(value) => setEntityType(value)}
            onQueryChange={setSearchText}
            onSubmit={() => void loadContext()}
            loading={loading}
            buttonLabel={viewMode === "graph" ? "Load graph" : "Load summary"}
          />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              Guided examples
            </span>
            {GUIDED_ENTITY_TYPES.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  const example = getEntityExample(label);
                  setEntityType(label);
                  setSearchText(example);
                  void loadContext(label, example);
                }}
                className="rounded-full border border-[hsl(var(--border))] px-3 py-1 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))]"
              >
                {getEntityDisplayName(label)}: {getEntityExample(label)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {errorMessage && (
        <Card className="border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/20">
          <CardContent className="pt-6">
            <p className="text-sm text-red-700 dark:text-red-200">{errorMessage}</p>
          </CardContent>
        </Card>
      )}

      {renderEnrichmentPanel()}

      {queryResult && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Focus entity
              </p>
              <p className="mt-2 text-base font-semibold">{queryResult.name}</p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                {getEntityDisplayName(queryResult.entityType)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Related entity types
              </p>
              <p className="mt-2 text-base font-semibold">{queryResult.relatedEntityCounts.length}</p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Distinct connected node categories around this seed.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Relationship signals
              </p>
              <p className="mt-2 text-base font-semibold">{queryResult.relationshipCounts.length}</p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Typed connections you can now traverse in the graph.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {viewMode === "graph" ? renderGraphPanel() : renderQueryPanel()}
    </div>
  );
}
