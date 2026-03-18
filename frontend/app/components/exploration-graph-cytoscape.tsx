"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { GraphViewHandle, GraphViewProps } from "./graph-view-types";
import { getLinkColor, getNodeColor } from "../lib/graph-viz";
import type { GraphNodePayload } from "@/lib/exploration-types";

const GRAPH_FIT_PADDING = 120;
/** Slightly larger for readability and hierarchy (repair plan §5 polish). */
const NODE_SIZE_FOCUS = 16;
const NODE_SIZE_DEFAULT = 12;

const CYTOSCAPE_STYLE = [
  {
    selector: "node",
    style: {
      "background-color": "data(color)",
      width: "data(width)",
      height: "data(width)",
      label: "data(label)",
      "text-valign": "bottom",
      "text-halign": "center",
      "font-size": "12px",
      "text-margin-y": 6,
      "text-wrap": "wrap",
      "text-max-width": "140px",
      "border-width": 1,
      // Cytoscape cannot resolve CSS variables inside style strings.
      "border-color": "#64748b",
    },
  },
  { selector: "node:selected", style: { "border-width": 2 } },
  { selector: "node[nodeKind='focus']", style: { "border-width": 2 } },
  {
    selector: "node[?isEnriched]",
    style: { "border-width": 3, "border-color": "rgba(251, 191, 36, 0.9)" },
  },
  {
    selector: "edge",
    style: {
      "line-color": "data(color)",
      width: 1,
      label: "data(edgeLabel)",
      "font-size": "10px",
      "text-margin-y": 2,
      "text-rotation": "autorotate",
    },
  },
];

function buildCytoscapeElements(
  graphData: GraphViewProps["graphData"],
  showEdgeLabels: boolean,
  highlightEnriched: boolean,
  recentEnrichedNodeIds: Set<string>
): Array<{ group: "nodes"; data: Record<string, unknown>; position?: { x: number; y: number } } | { group: "edges"; data: Record<string, unknown> }> {
  const nodes = graphData.nodes.map((node: GraphNodePayload) => {
    const x = node.x ?? node.fx;
    const y = node.y ?? node.fy;
    const entityLabel = node.entityLabel ?? node.label ?? "Track";
    const color =
      node.nodeKind === "type_hub" ? getNodeColor("Genre") : getNodeColor(entityLabel);
    const label =
      node.nodeKind === "type_hub" && typeof node.relatedCount === "number"
        ? `${node.name} (${node.relatedCount})`
        : node.name.length > 22
          ? `${node.name.slice(0, 20)}…`
          : node.name;
    const width = node.nodeKind === "focus" ? NODE_SIZE_FOCUS : NODE_SIZE_DEFAULT;
    const isEnriched =
      highlightEnriched &&
      (Boolean(node.enrichment_source) || recentEnrichedNodeIds.has(node.id));
    return {
      group: "nodes" as const,
      data: {
        id: node.id,
        label,
        nodeKind: node.nodeKind,
        entityLabel,
        groupKey: node.groupKey,
        relatedCount: node.relatedCount,
        enrichment_source: node.enrichment_source,
        name: node.name,
        labels: node.labels,
        isEnriched,
      },
      position: typeof x === "number" && typeof y === "number" ? { x, y } : undefined,
    };
  });
  const edges = graphData.links.map((link, i) => ({
    group: "edges" as const,
    data: {
      id: `e${i}-${link.source}-${link.target}`,
      source: link.source,
      target: link.target,
      type: link.type,
      color: getLinkColor(link.type),
      edgeLabel: showEdgeLabels ? link.type : "",
    },
  }));
  return [...nodes, ...edges];
}

function hasPresetNodePositions(nodes: GraphViewProps["graphData"]["nodes"]): boolean {
  if (nodes.length === 0) return false;
  return nodes.every((node) => {
    const x = node.x ?? node.fx;
    const y = node.y ?? node.fy;
    return typeof x === "number" && typeof y === "number";
  });
}

function isEditableEventTarget(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

/**
 * 2D graph view using Cytoscape.js. Implements the GraphViewProps contract so the
 * exploration workspace can swap this for a future 3D view without changing the workspace.
 */
export function ExplorationGraphCytoscape(
  props: GraphViewProps,
  ref: React.Ref<GraphViewHandle>
) {
  const { graphData, showEdgeLabels, highlightEnriched, recentEnrichedNodeIds } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<import("cytoscape").Core | null>(null);
  const fitViewRef = useRef<(padding?: number) => void>(() => {});
  const propsRef = useRef(props);
  const lastFitTimeRef = useRef<number | null>(null);
  const lastCytoscapeContainerSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const [cyLoadError, setCyLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  propsRef.current = props;

  const fitView = useCallback((padding: number = GRAPH_FIT_PADDING) => {
    const cy = cyRef.current;
    if (!cy) return;
    try {
      cy.fit(undefined, padding);
    } catch {
      // no-op if no elements
    }
  }, []);
  fitViewRef.current = fitView;

  useEffect(() => {
    const handle: GraphViewHandle = { fitView };
    if (typeof ref === "function") {
      ref(handle);
    } else if (ref && typeof ref === "object") {
      (ref as React.MutableRefObject<GraphViewHandle | null>).current = handle;
    }
    return () => {
      if (typeof ref === "object" && ref && "current" in ref) {
        (ref as React.MutableRefObject<GraphViewHandle | null>).current = null;
      }
    };
  }, [ref, fitView]);

  const syncGraphDataToCy = useCallback(
    (cy: import("cytoscape").Core) => {
      const { graphData: gd, showEdgeLabels: sel, highlightEnriched: he, recentEnrichedNodeIds: reid } = propsRef.current;
      if (gd.nodes.length === 0) return;
      const elements = buildCytoscapeElements(gd, sel, he, reid);
      const nodes = elements.filter((e): e is typeof e & { group: "nodes" } => e.group === "nodes");
      const edges = elements.filter((e): e is typeof e & { group: "edges" } => e.group === "edges");
      nodes.forEach((n) => {
        const color =
          (n.data.nodeKind as string) === "type_hub"
            ? getNodeColor("Genre")
            : getNodeColor((n.data.entityLabel as string) ?? "Track");
        const width = (n.data.nodeKind as string) === "focus" ? NODE_SIZE_FOCUS : NODE_SIZE_DEFAULT;
        (n.data as Record<string, unknown>).color = color;
        (n.data as Record<string, unknown>).width = width;
      });
      cy.elements().remove();
      cy.add([...nodes, ...edges]);
      cy.resize();
      const usePreset = hasPresetNodePositions(gd.nodes);
      const layout = cy.layout(
        usePreset
          ? { name: "preset" }
          : {
              name: "cose",
              animate: false,
              fit: true,
              padding: 64,
              nodeDimensionsIncludeLabels: true,
              nodeRepulsion: 18000,
              idealEdgeLength: 220,
              edgeElasticity: 200,
              gravity: 0.4,
              nestingFactor: 0.8,
            }
      );
      layout.run();
      layout.on("layoutstop", () => {
        cy.resize();
        fitViewRef.current(GRAPH_FIT_PADDING);
      });
    },
    []
  );

  useEffect(() => {
    const swallowKeyboardForEditableTargets = (event: KeyboardEvent) => {
      if (!isEditableEventTarget(event.target)) return;
      // Keep typing/navigation events scoped to form controls, never graph handlers.
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", swallowKeyboardForEditableTargets, true);
    window.addEventListener("keypress", swallowKeyboardForEditableTargets, true);
    window.addEventListener("keyup", swallowKeyboardForEditableTargets, true);
    return () => {
      window.removeEventListener("keydown", swallowKeyboardForEditableTargets, true);
      window.removeEventListener("keypress", swallowKeyboardForEditableTargets, true);
      window.removeEventListener("keyup", swallowKeyboardForEditableTargets, true);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let destroyed = false;
    async function initCytoscape() {
      const MAX_RETRIES = 2;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        try {
          const cytoscape = await import("cytoscape");
          if (destroyed) return;
          setCyLoadError(null);
          const container = containerRef.current;
          if (!container) return;
          const cy = cytoscape.default({
            container,
            elements: [],
            style: CYTOSCAPE_STYLE as import("cytoscape").CytoscapeOptions["style"],
            layout: { name: "preset" },
            userZoomingEnabled: true,
            zoomingEnabled: true,
            userPanningEnabled: true,
            panningEnabled: true,
            boxSelectionEnabled: false,
          });
          cyRef.current = cy;
          syncGraphDataToCy(cy);

          cy.on("tap", "node", (evt) => {
            const target = evt.target;
            if (!target.isNode()) return;
            const id = target.id();
            const p = propsRef.current;
            const node = p.graphData.nodes.find((n) => n.id === id);
            if (node) p.onNodeClick(node);
          });

          cy.on("dragfree", "node", (evt) => {
            const target = evt.target;
            if (!target.isNode()) return;
            const pos = target.position();
            propsRef.current.onNodeDragEnd(target.id(), pos.x, pos.y);
          });

          cy.on("mouseover", "node", (evt) => {
            const id = evt.target.id();
            const node = propsRef.current.graphData.nodes.find((n) => n.id === id);
            if (propsRef.current.onNodeHover && node) propsRef.current.onNodeHover(node);
          });
          cy.on("mouseout", "node", () => {
            if (propsRef.current.onNodeHover) propsRef.current.onNodeHover(null);
          });

          return;
        } catch (error) {
          if (attempt === MAX_RETRIES) {
            const message = error instanceof Error ? error.message : "Unknown chunk loading error";
            if (!destroyed) {
              setCyLoadError(`Graph runtime failed to load: ${message}`);
            }
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
    }

    void initCytoscape();
    return () => {
      destroyed = true;
      const cy = cyRef.current;
      if (cy) {
        cy.destroy();
        cyRef.current = null;
      }
    };
  }, [syncGraphDataToCy, loadAttempt]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || graphData.nodes.length === 0) return;
    const elements = buildCytoscapeElements(
      graphData,
      showEdgeLabels,
      highlightEnriched,
      recentEnrichedNodeIds
    );
    const nodes = elements.filter((e): e is typeof e & { group: "nodes" } => e.group === "nodes");
    const edges = elements.filter((e): e is typeof e & { group: "edges" } => e.group === "edges");
    nodes.forEach((n) => {
      const color =
        (n.data.nodeKind as string) === "type_hub"
          ? getNodeColor("Genre")
          : getNodeColor((n.data.entityLabel as string) ?? "Track");
      const width = (n.data.nodeKind as string) === "focus" ? NODE_SIZE_FOCUS : NODE_SIZE_DEFAULT;
      (n.data as Record<string, unknown>).color = color;
      (n.data as Record<string, unknown>).width = width;
    });
    cy.elements().remove();
    cy.add([...nodes, ...edges]);
    const usePreset = hasPresetNodePositions(graphData.nodes);
    const layout = cy.layout(
      usePreset
        ? { name: "preset" }
        : {
            name: "cose",
            animate: false,
            fit: true,
            padding: 64,
            nodeDimensionsIncludeLabels: true,
            nodeRepulsion: 18000,
            idealEdgeLength: 220,
            edgeElasticity: 200,
            gravity: 0.4,
            nestingFactor: 0.8,
          }
    );
    layout.run();
    const FIT_THROTTLE_MS = 400;
    const onDone = () => {
      const now = Date.now();
      if (now - (lastFitTimeRef.current ?? 0) < FIT_THROTTLE_MS) return;
      lastFitTimeRef.current = now;
      fitViewRef.current(GRAPH_FIT_PADDING);
    };
    layout.on("layoutstop", onDone);
    return () => {
      layout.off("layoutstop", onDone);
    };
  }, [graphData, showEdgeLabels, highlightEnriched, recentEnrichedNodeIds]);

  useEffect(() => {
    const container = containerRef.current;
    const cy = cyRef.current;
    if (!container || !cy) return;
    const observer = new ResizeObserver((entries: ResizeObserverEntry[]) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const { width, height } = lastCytoscapeContainerSizeRef.current;
      const sizeChanged = rect.width !== width || rect.height !== height;
      cy.resize();
      if (!sizeChanged) return;
      lastCytoscapeContainerSizeRef.current = { width: rect.width, height: rect.height };
      fitViewRef.current(GRAPH_FIT_PADDING);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [graphData.nodes.length]);

  return (
    <div
      className="relative h-full w-full"
      style={{ minHeight: 300 }}
      data-testid="exploration-graph-cytoscape"
    >
      {cyLoadError ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[hsl(var(--card))]/90 p-4 text-center">
          <p className="text-xs text-red-600">{cyLoadError}</p>
          <button
            type="button"
            className="rounded border border-[hsl(var(--border))] px-3 py-1 text-xs hover:bg-[hsl(var(--muted))]"
            onClick={() => {
              setCyLoadError(null);
              setLoadAttempt((value) => value + 1);
            }}
          >
            Retry graph load
          </button>
        </div>
      ) : null}
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

export const GraphView2D = React.forwardRef(ExplorationGraphCytoscape);
