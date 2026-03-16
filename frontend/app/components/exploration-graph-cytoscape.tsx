"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { GraphViewHandle, GraphViewProps } from "./graph-view-types";
import { getLinkColor, getNodeColor } from "../lib/graph-viz";
import type { GraphNodePayload } from "@/lib/exploration-types";

const GRAPH_FIT_PADDING = 120;
/** Slightly larger for readability and hierarchy (repair plan §5 polish). */
const NODE_SIZE_FOCUS = 16;
const NODE_SIZE_DEFAULT = 12;
/** Min hit area for node proxy buttons (a11y / automation). */
const NODE_PROXY_HIT_SIZE = 28;

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
      "border-width": 1,
      "border-color": "hsl(var(--border))",
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
    const x = node.x ?? node.fx ?? 0;
    const y = node.y ?? node.fy ?? 0;
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
      position: { x, y },
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
  /** Viewport positions for a11y/automation node proxy buttons (updated on render). */
  const [nodeProxyPositions, setNodeProxyPositions] = useState<Array<{ id: string; x: number; y: number }>>([]);
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
      const layout = cy.layout({ name: "preset" });
      layout.run();
      layout.on("layoutstop", () => {
        cy.resize();
        fitViewRef.current(GRAPH_FIT_PADDING);
      });
    },
    []
  );

  const proxyUpdateTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let destroyed = false;
    import("cytoscape").then((cytoscape) => {
      if (destroyed) return;
      const container = containerRef.current;
      if (!container) return;
      const cy = cytoscape.default({
        container,
        elements: [],
        style: CYTOSCAPE_STYLE as import("cytoscape").CytoscapeOptions["style"],
        layout: { name: "preset" },
        userZoomingEnabled: true,
        userPanningEnabled: true,
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

      let rafScheduled = false;
      const updateProxyPositions = () => {
        if (destroyed) return;
        try {
          const positions = cy.nodes().map((n) => {
            const r = n.renderedPosition();
            return { id: n.id(), x: r.x, y: r.y };
          });
          setNodeProxyPositions(positions);
        } catch {
          if (!destroyed) setNodeProxyPositions([]);
        }
      };
      const onRender = () => {
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(() => {
          rafScheduled = false;
          if (destroyed) return;
          updateProxyPositions();
        });
      };
      cy.on("render", onRender);
      proxyUpdateTimeoutRef.current = window.setTimeout(updateProxyPositions, 600);
    });
    return () => {
      destroyed = true;
      if (proxyUpdateTimeoutRef.current != null) {
        clearTimeout(proxyUpdateTimeoutRef.current);
        proxyUpdateTimeoutRef.current = null;
      }
      const cy = cyRef.current;
      if (cy) {
        cy.destroy();
        cyRef.current = null;
      }
    };
  }, [syncGraphDataToCy]);

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
    const layout = cy.layout({ name: "preset" });
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

  const half = NODE_PROXY_HIT_SIZE / 2;
  return (
    <div
      className="relative h-full w-full"
      style={{ minHeight: 300 }}
      data-testid="exploration-graph-cytoscape"
    >
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      <div
        className="absolute inset-0 pointer-events-none"
        role="application"
        aria-label="Graph nodes; use Tab to move between nodes, Enter or click to select"
      >
        {graphData.nodes.map((node) => {
          const pos = nodeProxyPositions.find((p) => p.id === node.id);
          if (pos == null) return null;
          const kindLabel =
            node.nodeKind === "focus"
              ? "focus node"
              : node.nodeKind === "type_hub"
                ? "type hub"
                : "entity";
          return (
            <button
              key={node.id}
              type="button"
              className="absolute rounded-full border-0 bg-transparent outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:ring-offset-2 pointer-events-auto"
              style={{
                left: pos.x - half,
                top: pos.y - half,
                width: NODE_PROXY_HIT_SIZE,
                height: NODE_PROXY_HIT_SIZE,
              }}
              data-node-id={node.id}
              data-testid={`graph-node-${node.id}`}
              aria-label={`${node.name}, ${kindLabel}. Click to select.`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const n = graphData.nodes.find((nd) => nd.id === node.id);
                if (n) propsRef.current.onNodeClick(n);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export const GraphView2D = React.forwardRef(ExplorationGraphCytoscape);
