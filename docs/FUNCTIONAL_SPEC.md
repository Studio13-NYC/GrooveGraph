# Groovegraph Functional Specification (v1)

## 1. Product Outcome

Groovegraph v1 must let users represent a recorded-music universe as a connected property graph and query relationship paths across that universe.

Success means a user can:

- Ingest entities from multiple music facets into one model.
- Connect those entities with typed relationships and properties.
- Ask relationship questions and receive traversable graph results.

## 2. Primary Actors

- **Catalog Curator**: Maintains canonical graph records.
- **Music Researcher**: Explores historical and production connections.
- **Connection Curator**: Searches the web and other sources to gather additional information about any entity, attaches that information to the graph with full provenance (source URL, date, excerpt, confidence). This actor drives data enrichment and expansion—filling in biographies, genres, credits, and relationships that are missing from initial imports.
- **Product Integrator**: Imports external metadata into graph primitives.

## 3. Core Functional Capabilities

### 3.1 Node Lifecycle

System shall support:

- Create node with `id`, labels, and properties.
- Update node labels and properties.
- Delete node with configurable edge-handling policy:
  - reject if connected, or
  - cascade-delete incident edges.
- Fetch node by ID.
- List/filter nodes by label and property predicates.

### 3.2 Edge Lifecycle

System shall support:

- Create directed edge between existing nodes.
- Attach and update edge properties.
- Delete edge by ID.
- Fetch edge by ID.
- List edges by type and endpoint filters.

### 3.3 Property Operations

System shall support:

- Upsert individual properties without replacing full entity payload.
- Remove a property by key.
- Validate property values against schema rules when configured.

### 3.4 Traversal and Discovery

System shall support:

- One-hop neighborhood exploration.
- Multi-hop traversal with depth limits.
- Traversal constrained by:
  - direction
  - edge types
  - node labels
  - property predicates
- Path search between two nodes with type constraints.

## 4. Recorded-Music Discovery Use Cases

### Use case A: Recording lineage

Given a track node, identify:

- associated album/release
- credited contributors and roles
- studio/session context
- linked equipment/instruments where known

### Use case B: Contributor network

Given an artist/person, find collaborators across recordings, releases, and sessions, including role-based relationships.

### Use case C: Production topology

Given a studio or producer, discover related recordings, artists, labels, and recurring equipment patterns.

### Use case D: Cross-collection linkage

Given imported catalog segments, discover shared entities (same person, work, label, studio) and build connected subgraphs.

## 5. Data Enrichment and Expansion (Connection Curator)

The **Connection Curator** actor enriches existing graph entities by searching the web (or other sources) and attaching new facts with provenance.

### 5.1 Capabilities

- **Target any entity**: Select a node (e.g. Artist, Track, Studio) and trigger enrichment for that entity.
- **Web search**: Search the web for additional information about the entity (biography, credits, release history, equipment, collaborations, etc.).
- **Attach with provenance**: Every added or updated property derived from enrichment must carry provenance:
  - source type (e.g. web, article, official site)
  - source URL
  - retrieved date (ISO)
  - optional excerpt or citation
  - optional confidence or verification flag
- **Expand the graph**: New entities or relationships discovered during research (e.g. a producer, a studio, a collaborator) can be added as nodes and edges, also with provenance, so the graph grows from enrichment.

### 5.2 Provenance model

Provenance is stored in node/edge `meta` or in dedicated properties (e.g. `enrichment_source`, `enrichment_url`, `enrichment_date`). The system shall support:

- Storing at least one provenance record per enriched property or per enrichment run.
- Querying or filtering by provenance (e.g. “show only facts from web” or “last enriched on date X”).

### 5.3 Staged review and triplet exploration

v1 enrichment writes are mediated through a staged review workflow:

- Candidate changes (properties, nodes, edges) are imported into a review session.
- Reviewers can reject low-quality or incorrect candidates before apply.
- Only non-rejected candidates are applied to the canonical graph.

v1 also supports triplet-driven exploration in the enrichment workspace:

- Input pattern: `subjectType:subjectName RELATIONSHIP objectType:objectName`
- `any` placeholders are supported with an explicit scope requirement.
- Triplet output is treated as staged candidates and goes through the same review/apply gate.

### 5.4 Out of scope (v1)

- Automated continuous enrichment pipelines.
- Deduplication or conflict resolution across multiple enrichment sources (can be added later).

## 6. Import Contract (Source Adapter Model)

External connectors map source payloads into normalized graph commands:

- `CreateNodeCommand`
- `CreateEdgeCommand`
- `UpsertNodePropertiesCommand`
- `UpsertEdgePropertiesCommand`

Adapter responsibilities:

- normalize IDs
- map source fields into canonical labels and properties (see [DOMAIN_MODEL.md](DOMAIN_MODEL.md))
- assign relationship types (see DOMAIN_MODEL)
- preserve source provenance in metadata properties

## 7. Functional Constraints

- All edge endpoints must exist at write time.
- Writes must be atomic per command execution.
- Duplicate node/edge IDs must fail deterministically.
- Traversal queries must honor max-depth and max-results guards.

## 8. Output Contracts (v1)

### Node response

- `id`, `labels`, `properties`, `meta`

### Edge response

- `id`, `type`, `fromNodeId`, `toNodeId`, `properties`, `meta`

### Traversal response

- visited nodes
- visited edges
- optional path sequences
- query execution metadata (depth reached, truncation flags)

## 9. Out of Scope (v1)

- Graphiti integration
- Dual-memory or chat memory synchronization
- Recommendation ranking/ML logic
- Full-text relevance tuning beyond basic filtering
