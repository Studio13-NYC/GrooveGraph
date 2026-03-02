# Groovegraph

**A property graph for recorded music: one place for every facet of a recording, and the connections between them.**

---

## The problem

Everything we know about a piece of recorded music is scattered. Credits live in one place, release metadata in another. Who produced it, where it was recorded, which instruments were used, which label put it out—each fact sits in a different system or spreadsheet. That makes it hard to answer the questions that actually matter: *Who else worked with this producer? What else was recorded at this studio? Which artists share this engineer?* You can’t see the connections if the data never meets in one model.

## The objective

Groovegraph exists to **unify every aspect of recorded music into a single, queryable property graph** and to **surfacing the relationships that are invisible when data stays siloed**.

We want a catalog curator, a music researcher, or a product team to:

- **Ingest** artists, tracks, albums, studios, labels, instruments, credits, and sessions from any source into one graph.
- **Connect** them with typed, directed relationships (performed by, recorded at, produced by, released by, and many more).
- **Discover** paths and patterns: lineage of a recording, contributor networks, production topology, cross-collection links—all by traversing the graph.
- **Enrich** over time: pull in new facts from the web or other sources and attach them with full **provenance** (source, date, confidence), so the graph grows and stays traceable.

Success looks like: you ask a relationship question and get back a traversable graph, not a dead end.

---

## Why Groovegraph is different

| What others do | What Groovegraph does |
|----------------|------------------------|
| Triple stores or flat metadata | **Property graph**: nodes and edges both carry rich, typed properties (dates, roles, specs, provenance). |
| Generic knowledge graphs | **Music-native ontology**: entities and relationships that match how music is made—Artist, Track, Studio, Instrument (brand, model, year), Credit, Session, Label, Performance, and more. |
| Single-source ingestion | **Multi-source + enrichment**: import from catalogs, APIs, and play history; then **Connection Curator**-style enrichment (web search, attach facts with provenance) so the graph improves over time. |
| Lock-in to one database | **Pluggable storage**: a clear `GraphStore` interface with an in-memory reference implementation; later, SQLite, Neo4j, or others without changing core behavior. |
| Implementation-first | **Spec-first**: architecture, domain model, and functional spec are the single source of truth so the graph semantics stay clear before and after implementation. |

We’re not building another metadata API or another recommendation engine. We’re building **the graph layer** that makes “every facet of a recording, connected” possible—so discovery, research, and product experiences can sit on top of it.

---

## Who it’s for

- **Catalog curators** — Maintain canonical graph records and keep entities and relationships accurate.
- **Music researchers** — Explore historical and production connections, contributor networks, and influence chains.
- **Connection curators** — Enrich the graph by searching the web (or other sources), attaching new facts with provenance (source URL, date, excerpt, confidence), and expanding the graph with newly discovered entities and relationships.
- **Product integrators** — Map external metadata (Spotify, Last.fm, play history, etc.) into the graph via a clear import contract and domain model.

---

## What you can do with the graph

- **Recording lineage** — From a track, follow links to album, contributors (with roles), studio, session, and instruments.
- **Contributor networks** — From an artist or person, find collaborators across recordings, releases, and sessions.
- **Production topology** — From a studio or producer, see related recordings, artists, labels, and recurring equipment/instruments.
- **Cross-collection linkage** — After importing multiple catalogs or play histories, discover shared entities (same person, work, label, studio) and build connected subgraphs.

The domain model defines **node types** (Artist, Album, Track, Instrument, Studio, Person, Credit, Label, Performance, Effect, Genre, Playlist, Venue, Session, Release, and more) and **relationship types** (PERFORMED_BY, RECORDED_AT, PRODUCED_BY, RELEASED_ON, USED_EQUIPMENT, PLAYED_ON, and many others). Everything is designed so that “find the connections” is a natural graph traversal, not a join across tables.

---

## Benefits

- **One model for recorded music** — One graph holds works, people, places, gear, and events; you query it instead of reconciling spreadsheets and APIs.
- **Relationship-first** — Discovery is traversal: follow edges by type and filter by properties. Paths and neighborhoods are first-class.
- **Provenance built in** — Enrichment and import can record source and date so you know where a fact came from and whether to trust it.
- **Extensible and portable** — TypeScript-first core, pluggable storage, and a published domain model make it easy to add backends, UIs, or integrations without rewriting the semantics.

---

## Project status and docs

**Phase 1 (current)** is specification and domain design: we have a clear architecture, a full ontology, a functional spec, and a storage abstraction. Implementation (graph core, in-memory store, traversal, and adapters) follows in Phase 2.

| Document | Purpose |
|----------|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Property-graph core, conceptual layers, query model, indexing, validation. |
| [docs/DOMAIN_MODEL.md](docs/DOMAIN_MODEL.md) | **Single source of truth**: node labels, properties, edge types, and advanced structures (Instrument, SongWork, provenance). |
| [docs/FUNCTIONAL_SPEC.md](docs/FUNCTIONAL_SPEC.md) | Product outcome, actors, capabilities, discovery use cases, enrichment, import contract. |
| [docs/STORAGE_ABSTRACTION.md](docs/STORAGE_ABSTRACTION.md) | `GraphStore` interface, in-memory default, future adapters. |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Implementation plan: domain types, OOP rule, entity/relationship layout, data population. |
| [docs/RULES_AND_STANDARDS.md](docs/RULES_AND_STANDARDS.md) | Catalog of Cursor rules and coding/layout standards. |
| [data/README.md](data/README.md) | Reference datasets (Last.fm, play history, Spotify lists) for import and testing. |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Deploy to Azure: provision rg-groovegraph + swa-groovegraph, build static + graph.json, deploy with SWA CLI. |

**Run it:** From the repo root, `npm install` then `npm run build`. Use `npm run load` to ingest play history (CSV) into the in-memory graph and print a summary. Use `npm run query -- "Artist Name"` to list that artist’s tracks and albums (e.g. `npm run query -- "Kacey Musgraves"`).

**Web UI:** Run `npm run dev` and open http://localhost:3000. Query by artist, view an artist subgraph in the graph view, or trigger Enrich (stub). The graph uses react-force-graph-2d for force-directed visualization.

---

## Repo and license

- **Repository**: [github.com/Studio13-NYC/GrooveGraph](https://github.com/Studio13-NYC/GrooveGraph)  
- **Organization**: [Studio13-NYC](https://github.com/Studio13-NYC) — *Exploring the Future of Media*

This project is specification-first. The domain model and specs are intended to stand alone so that any team can build or adopt the graph layer with a clear target.
