"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { loadGraphJson, getGraphData, getRandomArtistName, type GraphJson } from "../lib/static-graph";
import {
  getNodeColor,
  getLinkColor,
  getEntityDisplayName,
  ENTITY_LABELS,
  RELATIONSHIP_TYPES,
} from "../lib/graph-viz";

const NODE_RADIUS = 6;

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d").then((m) => m.default),
  { ssr: false }
);

function Legend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        <span>Legend: entity and relationship types</span>
      </button>
      {open && (
        <div className="grid gap-6 border-t border-[hsl(var(--border))] p-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-2 font-medium text-[hsl(var(--foreground))]">Entities (nodes)</h4>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {ENTITY_LABELS.map((label) => (
                <li key={label} className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: getNodeColor(label) }}
                    aria-hidden
                  />
                  <span className="text-xs">{getEntityDisplayName(label)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-2 font-medium text-[hsl(var(--foreground))]">Relationships (edges)</h4>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {RELATIONSHIP_TYPES.map((type) => (
                <li key={type} className="flex items-center gap-1.5">
                  <span
                    className="h-0.5 w-3 shrink-0 rounded"
                    style={{ backgroundColor: getLinkColor(type) }}
                    aria-hidden
                  />
                  <span className="text-xs">{type.replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

type GraphData = {
  nodes: { id: string; label: string; name?: string }[];
  links: { source: string; target: string; type: string }[];
};

function GraphContent() {
  const searchParams = useSearchParams();
  const initialArtist = searchParams.get("artist") ?? "";
  const [artistFilter, setArtistFilter] = useState(initialArtist);
  const [staticJson, setStaticJson] = useState<GraphJson | null | undefined>(undefined);
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEdgeLabels, setShowEdgeLabels] = useState(false);

  useEffect(() => {
    loadGraphJson().then(setStaticJson);
  }, []);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (staticJson) {
        const artistName = artistFilter.trim() || getRandomArtistName(staticJson);
        const out = getGraphData(staticJson, artistName || undefined);
        setData({ nodes: out.nodes, links: out.links });
      } else if (staticJson === null) {
        const params = artistFilter.trim()
          ? `?artist=${encodeURIComponent(artistFilter.trim())}`
          : "?random=1";
        const res = await fetch(`/api/graph${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load graph");
        setData({ nodes: json.nodes ?? [], links: json.links ?? [] });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load graph");
      setData({ nodes: [], links: [] });
    } finally {
      setLoading(false);
    }
  }, [artistFilter, staticJson]);

  const graphData = useMemo(
    () => ({ nodes: data.nodes, links: data.links }),
    [data]
  );

  return (
    <>
      <div className="flex flex-col gap-y-2">
        <div className="flex flex-wrap items-center justify-between gap-4 py-1.5">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Filter by artist name"
                value={artistFilter}
                onChange={(e) => setArtistFilter(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadGraph()}
                className="w-56"
              />
              <Button onClick={loadGraph} disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Load"
                )}
              </Button>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
            <input
              type="checkbox"
              checked={showEdgeLabels}
              onChange={(e) => setShowEdgeLabels(e.target.checked)}
              className="h-4 w-4 rounded border-[hsl(var(--border))]"
            />
            Edge labels
          </label>
        </div>

        <div className="space-y-4">
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="h-[70vh] min-h-[400px] w-full overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--muted-foreground))]" />
          </div>
        ) : graphData.nodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-[hsl(var(--muted-foreground))]">
            <p>Enter an artist name and click Load, or leave blank and click Load for a sample.</p>
            <p>No graph loaded yet.</p>
          </div>
        ) : (
          <ForceGraph2D
            graphData={graphData}
            nodeLabel={(node) =>
              String((node as { name?: string }).name ?? (node as { id?: string }).id ?? "")
            }
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as {
                name?: string;
                id?: string;
                label?: string;
                x?: number;
                y?: number;
              };
              const x = n.x ?? 0;
              const y = n.y ?? 0;
              const label = n.name ?? n.id ?? "";
              const color = getNodeColor(n.label ?? "Track");

              ctx.beginPath();
              ctx.arc(x, y, NODE_RADIUS, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
              ctx.strokeStyle = "hsl(var(--border))";
              ctx.lineWidth = 1 / globalScale;
              ctx.stroke();

              const fontSize = 12 / globalScale;
              ctx.font = `${fontSize}px Sans-Serif`;
              const labelTrim =
                String(label).length > 20 ? String(label).slice(0, 18) + "…" : String(label);
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillStyle = "hsl(var(--foreground))";
              ctx.fillText(labelTrim, x, y + NODE_RADIUS + fontSize);
            }}
            linkColor={(link) => getLinkColor((link as { type?: string }).type ?? "")}
            linkCanvasObject={
              showEdgeLabels
                ? (link, ctx, globalScale) => {
                    const l = link as {
                      source: { x?: number; y?: number };
                      target: { x?: number; y?: number };
                      type?: string;
                    };
                    const x1 = l.source.x ?? 0;
                    const y1 = l.source.y ?? 0;
                    const x2 = l.target.x ?? 0;
                    const y2 = l.target.y ?? 0;
                    const midX = (x1 + x2) / 2;
                    const midY = (y1 + y2) / 2;
                    // Draw the line so it is visible when using custom linkCanvasObject
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.strokeStyle = getLinkColor(l.type ?? "");
                    ctx.lineWidth = 1 / globalScale;
                    ctx.stroke();
                    // Draw the edge label at midpoint
                    const label = l.type ?? "";
                    if (!label) return;
                    const fontSize = 10 / globalScale;
                    ctx.font = `${fontSize}px Sans-Serif`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillStyle = "hsl(var(--muted-foreground))";
                    ctx.fillText(label, midX, midY);
                  }
                : undefined
            }
            nodeColor={(node) => getNodeColor((node as { label?: string }).label ?? "Track")}
            backgroundColor="hsl(var(--card))"
            enableZoomInteraction={true}
            enablePanInteraction={true}
            enableNodeDrag={true}
            cooldownTicks={100}
            onEngineStop={() => {}}
          />
        )}
      </div>
      </div>
      </div>

      <Legend />
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Drag nodes, scroll to zoom, drag canvas to pan.
      </p>
    </>
  );
}

export default function GraphPage() {
  return (
    <Suspense fallback={<div className="flex h-[70vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--muted-foreground))]" /></div>}>
      <GraphContent />
    </Suspense>
  );
}
