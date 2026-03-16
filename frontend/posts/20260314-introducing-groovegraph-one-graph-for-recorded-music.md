# Introducing GrooveGraph: One Graph for Every Facet of Recorded Music

What if every fact about a piece of recorded music—who made it, where it was cut, which instruments were used, which label put it out—lived in one place, so you could ask *Who else worked with this producer?* or *What else was recorded at this studio?* and get real answers? That is the promise of **GrooveGraph**, a property graph for recorded music that unifies artists, tracks, albums, studios, labels, credits, and sessions into a single, queryable model. Discovery becomes graph traversal: follow the connections instead of reconciling spreadsheets and APIs.

Most music data lives in silos. Credits in one system, release metadata in another, session info somewhere else. GrooveGraph is different: it is **the graph layer** for recorded music. You ingest from any source—catalogs, play history, external APIs—and connect everything with typed relationships: PERFORMED_BY, RECORDED_AT, PRODUCED_BY, RELEASED_ON, USED_EQUIPMENT, and many more. The domain model is music-native: Artist, Album, Track, Studio, Label, Instrument (brand, model, year), Credit, Session, Venue. So when you ask a relationship question, you get back a traversable graph, not a dead end.

In practice, that means you can explore recording lineage from a song to its contributors and studio, trace contributor networks across recordings and sessions, or map production topology from a producer or studio to related artists and gear. The app runs on **Neo4j** (with a pluggable store so you can swap backends), and it ships with a **staged enrichment workflow**: pull in new facts from the web or other sources, attach them with full **provenance** (source URL, date, excerpt, confidence), review candidates in a dedicated workspace, and apply only what you approve. The graph grows over time and stays traceable.

Under the hood, GrooveGraph is Next.js and TypeScript, with API routes for graph data, type-aware query summaries, and the enrichment review pipeline. The `/enrichment` workspace lets curators select targets, run automated collection or triplet exploration (e.g. “Album:any CONTAINS Track:any” scoped to an artist), review staged candidates with provenance, reject bad fits, and write only deduped, approved changes to Neo4j. The main UI is graph-first: search by entity type, inspect structured summaries, and view neighborhoods in a force-directed layout without leaving one page.

## Try It Like This

If you want to see the experience quickly:

- **Discovery:** Search for an artist, then follow edges to their albums, tracks, collaborators, and studios. Switch to query mode for a typed summary, or stay in graph view to drag and explore.
- **Enrichment:** Open the enrichment workspace, pick a set of graph entities, and run triplet exploration or LLM-backed extraction. Review the staged candidates (with source and confidence), reject what does not fit, and apply the rest so the graph gains new nodes and edges with provenance.
- **Paths:** Use the graph to answer “Who produced this album?”, “What else was recorded at this studio?”, or “Which artists share this engineer?” The answers are traversals, not joins.

Because the graph is one model and enrichment is review-before-write, you can iterate: add data, check connections, enrich again, and keep the catalog coherent.

## Why This Matters

GrooveGraph is not trying to replace label databases, streaming metadata, or human curators. It is the layer that makes “every facet of a recording, connected” possible. Catalog curators get one place to maintain canonical records and relationships. Music researchers get contributor networks, production topology, and cross-collection linkage. Connection curators can enrich the graph from the web and attach facts with provenance so the graph improves over time without losing traceability.

For product teams, a clear domain model and import contract make it easier to map external metadata (Spotify, Last.fm, play history) into the same graph and build discovery or research experiences on top. For anyone who has asked “Where is that connection?” and hit a wall—GrooveGraph is built for you. One graph, typed relationships, provenance built in. Run it locally, point it at Neo4j Aura, and start traversing. The repo is [github.com/Studio13-NYC/GrooveGraph](https://github.com/Studio13-NYC/GrooveGraph).
