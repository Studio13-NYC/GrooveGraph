/**
 * Shared contract for graph view components (2D now, 3D later).
 * Any view that renders the exploration graph (e.g. GraphView2D Cytoscape, or a future GraphView3D)
 * receives these props and exposes fitView via ref so the workspace can fit the viewport.
 */

import type { GraphLinkPayload, GraphNodePayload } from "@/lib/exploration-types";

export type GraphViewGraphData = {
  nodes: GraphNodePayload[];
  links: GraphLinkPayload[];
};

export type GraphViewProps = {
  graphData: GraphViewGraphData;
  focusNodeId: string | undefined;
  expandedTypeKeys: string[];
  onNodeClick: (node: GraphNodePayload) => void;
  onNodeDragEnd: (nodeId: string, x: number, y: number) => void;
  onNodeHover?: (node: GraphNodePayload | null) => void;
  showEdgeLabels: boolean;
  highlightEnriched: boolean;
  recentEnrichedNodeIds: Set<string>;
  /** Optional container ref from the parent for resize/fit coordination. */
  containerRef?: React.RefObject<HTMLDivElement | null>;
};

/** Ref handle for the active graph view. Workspace calls fitView() after load/resize. */
export type GraphViewHandle = {
  fitView: (padding?: number) => void;
};
