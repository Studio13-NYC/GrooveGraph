"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d").then((m) => m.default),
  { ssr: false }
);

type GraphData = {
  nodes: { id: string; label: string; name?: string }[];
  links: { source: string; target: string; type: string }[];
};

function GraphContent() {
  const searchParams = useSearchParams();
  const initialArtist = searchParams.get("artist") ?? "";
  const [artistFilter, setArtistFilter] = useState(initialArtist);
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = artistFilter.trim()
      ? `?artist=${encodeURIComponent(artistFilter.trim())}`
      : "";
    try {
      const res = await fetch(`/api/graph${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load graph");
      setData({ nodes: json.nodes ?? [], links: json.links ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load graph");
      setData({ nodes: [], links: [] });
    } finally {
      setLoading(false);
    }
  }, [artistFilter]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  const graphData = {
    nodes: data.nodes.map((n) => ({ ...n, id: n.id })),
    links: data.links.map((l) => ({
      source: l.source,
      target: l.target,
      type: l.type,
    })),
  };

  return (
    <div className="space-y-4">
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

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="h-[70vh] min-h-[400px] w-full overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--muted-foreground))]" />
          </div>
        ) : graphData.nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
            No nodes to display. Try another artist or load the full sample.
          </div>
        ) : (
          <ForceGraph2D
            graphData={graphData}
            nodeLabel={(node) =>
              String((node as { name?: string }).name ?? (node as { id?: string }).id ?? "")
            }
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as { name?: string; id?: string; x?: number; y?: number };
              const label = n.name ?? n.id ?? "";
              const fontSize = 12 / globalScale;
              ctx.font = `${fontSize}px Sans-Serif`;
              const labelTrim = String(label).length > 20 ? String(label).slice(0, 18) + "…" : String(label);
              const x = n.x ?? 0;
              const y = n.y ?? 0;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillStyle = "hsl(var(--foreground))";
              ctx.fillText(labelTrim, x, y);
            }}
            linkColor={() => "hsl(var(--muted-foreground))"}
            nodeColor={(node) => {
              const label = (node as { label?: string }).label;
              if (label === "Artist") return "hsl(262 80% 50%)";
              if (label === "Album") return "hsl(142 70% 40%)";
              return "hsl(210 70% 45%)";
            }}
            backgroundColor="hsl(var(--card))"
          />
        )}
      </div>

      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Purple = Artist, Green = Album, Blue = Track. Drag nodes to rearrange;
        scroll to zoom.
      </p>
    </div>
  );
}

export default function GraphPage() {
  return (
    <Suspense fallback={<div className="flex h-[70vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--muted-foreground))]" /></div>}>
      <GraphContent />
    </Suspense>
  );
}
