# Groovegraph

Groovegraph is a TypeScript-first project to build a music property graph that pulls together the disparate aspects of recorded music and exposes the connections between them.

## Business Purpose

Recorded music knowledge is fragmented across credits, releases, contributors, studios, labels, gear, and listening context. Groovegraph exists to unify those fragments into one graph-native model so people can discover relationships that are hard to see in isolated datasets.

In practical terms, Groovegraph aims to:

- Represent a recording and its surrounding context as connected entities with rich properties.
- Link people, places, works, releases, sessions, and equipment into queryable relationship paths.
- Support insight workflows such as lineage, influence, collaboration, and production-network discovery.

## Scope Boundaries

This project intentionally starts clean:

- `d:\Studio13\Lab\musikgraph` is read-only reference material.
- `d:\Studio13\Lab\music2` is read-only reference material.
- No Graphiti-specific implementation in Groovegraph.
- No dual-memory/agent memory features in Groovegraph.

## Reference Data

The `data/` folder holds collected reference datasets (Last.fm cleaned exports, play history CSV, Spotify track lists) for import and enrichment. See `data/README.md` for format and usage.

## Phase 1 Deliverables

- `docs/ARCHITECTURE.md`
- `docs/DOMAIN_MODEL.md` (ontology: entity types, properties, relationships — single source of truth)
- `docs/FUNCTIONAL_SPEC.md`
- `docs/STORAGE_ABSTRACTION.md`
- `data/README.md` (reference data catalog)

Phase 1 is specification-first and focuses on architecture, product intent, and a clear functional contract before implementation.
