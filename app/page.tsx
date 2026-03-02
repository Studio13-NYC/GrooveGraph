"use client";

import { useState, useEffect } from "react";
import { Search, Sparkles, Music, Disc } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import Link from "next/link";
import {
  loadGraphJson,
  queryArtistFromGraph,
  type GraphJson,
} from "./lib/static-graph";

type QueryResult = {
  artist: string;
  id: string;
  tracks: number;
  trackList: { track: string; album: string }[];
} | null;

type EnrichMessage = string | null;

const ENRICH_STUB_MESSAGE =
  "Enrichment will attach external metadata (biography, genres, images) to this entity.";

export default function HomePage() {
  const [artistQuery, setArtistQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrichMessage, setEnrichMessage] = useState<EnrichMessage>(null);
  const [graphData, setGraphData] = useState<GraphJson | null>(null);

  useEffect(() => {
    loadGraphJson().then(setGraphData);
  }, []);

  async function handleQuery() {
    const q = artistQuery.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setEnrichMessage(null);
    try {
      if (graphData) {
        const data = queryArtistFromGraph(graphData, q);
        if (data) setResult(data);
        else setError("No artist found");
      } else {
        const res = await fetch("/api/query-artist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artist: q }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Query failed");
          return;
        }
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnrich(type: "artist" | "album", id: string) {
    setEnrichMessage(null);
    if (graphData) {
      setEnrichMessage(ENRICH_STUB_MESSAGE);
      return;
    }
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        setEnrichMessage(data.message);
      } else {
        setEnrichMessage(data.error || "Enrich request failed");
      }
    } catch (e) {
      setEnrichMessage(e instanceof Error ? e.message : "Request failed");
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">
          Query by artist
        </h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Search the play-history graph for an artist and see their tracks and
          albums.
        </p>
        <div className="mt-4 flex gap-2">
          <Input
            placeholder="e.g. Kacey Musgraves"
            value={artistQuery}
            onChange={(e) => setArtistQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleQuery()}
            className="max-w-sm"
          />
          <Button onClick={handleQuery} disabled={loading}>
            <Search className="mr-2 h-4 w-4" />
            {loading ? "Searching…" : "Search"}
          </Button>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </section>

      {result && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              {result.artist}
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEnrich("artist", result.id)}
              >
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                Enrich artist
              </Button>
              <Link href={`/graph?artist=${encodeURIComponent(result.artist)}`}>
                <Button variant="secondary" size="sm">
                  View in graph
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {result.tracks} track{result.tracks !== 1 ? "s" : ""}
            </p>
            <ul className="mt-4 max-h-80 space-y-1 overflow-y-auto text-sm">
              {result.trackList.map((row, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-4 rounded-md px-2 py-1 hover:bg-[hsl(var(--muted))]"
                >
                  <span className="font-medium">{row.track}</span>
                  <span className="flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
                    <Disc className="h-3.5 w-3.5" />
                    {row.album}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {enrichMessage && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardContent className="pt-6">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              {enrichMessage}
            </p>
          </CardContent>
        </Card>
      )}

      <section className="rounded-lg border border-dashed border-[hsl(var(--border))] p-6">
        <h2 className="text-lg font-medium">More actions</h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Visualize the graph or explore by artist in the graph view.
        </p>
        <Link href="/graph" className="mt-4 inline-block">
          <Button variant="secondary">Open graph view</Button>
        </Link>
      </section>
    </div>
  );
}
