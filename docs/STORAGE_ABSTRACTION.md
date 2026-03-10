# Groovegraph Storage Abstraction

## 1. Goal

Define a pluggable persistence contract so Groovegraph core behavior is consistent regardless of storage backend.

**Production** uses **Neo4j Aura** as the persistent graph store. The **InMemoryGraphStore** remains for tests, scripts, and as a reference implementation.

## 2. Design Requirements

- Backend-independent core services
- Predictable behavior across adapters
- Clear read/write contracts
- Support for property graph primitives and traversal-friendly access patterns

## 3. GraphStore Port

The storage interface for the core graph engine.

### 3.1 Responsibilities

- Persist and retrieve nodes and edges
- Provide indexed lookups (ID, label, property)
- Provide adjacency access for traversal
- Execute writes atomically per operation

### 3.2 Interface shape (TypeScript sketch)

```ts
export interface GraphStore {
  // Node operations
  createNode(node: GraphNode): Promise<void>;
  updateNode(nodeId: string, patch: NodePatch): Promise<GraphNode>;
  deleteNode(nodeId: string, options?: DeleteNodeOptions): Promise<void>;
  getNode(nodeId: string): Promise<GraphNode | null>;
  findNodes(query: NodeQuery): Promise<GraphNode[]>;

  // Edge operations
  createEdge(edge: GraphEdge): Promise<void>;
  updateEdge(edgeId: string, patch: EdgePatch): Promise<GraphEdge>;
  deleteEdge(edgeId: string): Promise<void>;
  getEdge(edgeId: string): Promise<GraphEdge | null>;
  findEdges(query: EdgeQuery): Promise<GraphEdge[]>;

  // Traversal support
  getAdjacentEdges(nodeId: string, direction: Direction): Promise<GraphEdge[]>;

  // Transaction boundary
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}
```

## 4. Neo4jGraphStore (Production)

### 4.1 Purpose

- **Production runtime**: All API routes and enrichment persist to Neo4j Aura.
- Configure via `.env.local` (see [neo4j.md](neo4j.md)).
- Uses the official `neo4j-driver`; implements `GraphStore` with Cypher.

### 4.2 Capabilities

- Batched `importGraph()` for loading CSV/JSON snapshot into Aura.
- `getArtistSubgraph()` for fast single-query artist subgraph retrieval.
- Full CRUD via `GraphStore` interface; writes are persisted immediately.

---

## 5. InMemoryGraphStore (Reference / Scripts)

### 5.1 Purpose

- Fast prototyping and deterministic tests
- Baseline semantics for adapter parity
- Source for `load:neo4j` import (build from CSV or load from `data/graph-store.json`)

### 5.2 Internal structures

- `Map<string, GraphNode>` for nodes by ID
- `Map<string, GraphEdge>` for edges by ID
- `Map<string, Set<string>>` for label index
- Property index maps for targeted filter acceleration
- Adjacency maps for inbound/outbound edge IDs

### 5.3 Behavioral guarantees

- O(1) ID lookups
- Consistent validation behavior
- Deterministic traversal ordering policy (documented)

## 6. Adapter Compliance Rules

Every backend adapter must preserve:

- Node/edge identity semantics
- Validation and error contracts
- Traversal result semantics for equivalent queries
- Atomicity for single operation transactions

## 7. Future Adapters

Potential additional storage adapters:

- `SQLiteGraphStore`
- `PostgresGraphStore` (edge/node tables + indexes)

All future adapters must implement `GraphStore` directly and pass shared conformance tests.

## 8. Conformance Test Suite

Create backend-agnostic tests that run against every adapter:

- Node CRUD behavior
- Edge CRUD behavior
- Property filtering behavior
- Traversal parity tests
- Constraint and error contract tests

The in-memory implementation acts as the first reference backend and baseline for adapter parity.

## 9. Explicit Exclusions

- No Graphiti-specific storage APIs
- No memory synchronization persistence model
- No backend-specific query language leakage into core interfaces
