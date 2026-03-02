# Groovegraph Storage Abstraction

## 1. Goal

Define a pluggable persistence contract so Groovegraph core behavior is consistent regardless of storage backend.

Default for v1 is an in-memory reference implementation. Future adapters can target persistent stores without changing core semantics.

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

## 4. InMemoryGraphStore (Default v1)

### 4.1 Purpose

- Fast prototyping
- Deterministic test target
- Baseline semantics for future adapters

### 4.2 Internal structures

- `Map<string, GraphNode>` for nodes by ID
- `Map<string, GraphEdge>` for edges by ID
- `Map<string, Set<string>>` for label index
- Property index maps for targeted filter acceleration
- Adjacency maps for inbound/outbound edge IDs

### 4.3 Behavioral guarantees

- O(1) ID lookups
- Consistent validation behavior
- Deterministic traversal ordering policy (documented)

## 5. Adapter Compliance Rules

Every backend adapter must preserve:

- Node/edge identity semantics
- Validation and error contracts
- Traversal result semantics for equivalent queries
- Atomicity for single operation transactions

## 6. Future Adapters

Potential storage adapters:

- `SQLiteGraphStore`
- `Neo4jGraphStore`
- `PostgresGraphStore` (edge/node tables + indexes)

All future adapters must implement `GraphStore` directly and pass shared conformance tests.

## 7. Conformance Test Suite

Create backend-agnostic tests that run against every adapter:

- Node CRUD behavior
- Edge CRUD behavior
- Property filtering behavior
- Traversal parity tests
- Constraint and error contract tests

The in-memory implementation acts as the first reference backend and baseline for adapter parity.

## 8. Explicit Exclusions

- No Graphiti-specific storage APIs
- No memory synchronization persistence model
- No backend-specific query language leakage into core interfaces
