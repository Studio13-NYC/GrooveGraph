import neo4j, { Driver, Integer, Record as Neo4jRecord } from "neo4j-driver";
import { GraphNode } from "../domain/GraphNode.js";
import { GraphEdge } from "../domain/GraphEdge.js";
import { getEntityDisplayPropertyKeys } from "../lib/entity-config.js";
import type {
  DeleteNodeOptions,
  Direction,
  EdgePatch,
  EdgeQuery,
  GraphStore,
  NodePatch,
  NodeQuery,
} from "./types.js";
import { getNeo4jConfig } from "./neo4j-config.js";

type Neo4jNodeRecord = {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

type Neo4jEdgeRecord = {
  id: string;
  type: string;
  fromNodeId: string;
  toNodeId: string;
  properties: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

class StoredNode extends GraphNode {
  constructor(
    id: string,
    labels: string[],
    properties: Record<string, unknown>,
    meta?: Record<string, unknown>
  ) {
    super(id, labels, properties, meta);
  }
}

class StoredEdge extends GraphEdge {
  constructor(
    id: string,
    type: string,
    fromNodeId: string,
    toNodeId: string,
    properties: Record<string, unknown>,
    meta?: Record<string, unknown>
  ) {
    super(id, type, fromNodeId, toNodeId, properties, meta);
  }
}

function assertSafeToken(value: string, kind: "label" | "relationship"): string {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid ${kind} token: ${value}`);
  }
  return value;
}

function assertSafePropertyKey(value: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid property key: ${value}`);
  }
  return value;
}

function serializePropertyValue(value: unknown): unknown {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean")) {
      return value;
    }
    return `__json__${JSON.stringify(value)}`;
  }
  return `__json__${JSON.stringify(value)}`;
}

function deserializePropertyValue(value: unknown): unknown {
  if (neo4j.isInt(value)) {
    return (value as Integer).toNumber();
  }
  if (Array.isArray(value)) {
    return value.map((item) => deserializePropertyValue(item));
  }
  if (typeof value === "string" && value.startsWith("__json__")) {
    try {
      return JSON.parse(value.slice("__json__".length));
    } catch {
      return value;
    }
  }
  return value;
}

function serializeProperties(properties: Record<string, unknown>, meta?: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    const serialized = serializePropertyValue(value);
    if (serialized !== undefined) out[key] = serialized;
  }
  if (meta !== undefined) {
    out.__meta = JSON.stringify(meta);
  }
  return out;
}

function extractProperties(
  raw: Record<string, unknown>
): { properties: Record<string, unknown>; meta?: Record<string, unknown> } {
  const properties: Record<string, unknown> = {};
  let meta: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(raw)) {
    if (key === "id") continue;
    if (key === "__meta") {
      if (typeof value === "string" && value.trim()) {
        try {
          meta = JSON.parse(value) as Record<string, unknown>;
        } catch {
          meta = { raw_meta: value };
        }
      }
      continue;
    }
    properties[key] = deserializePropertyValue(value);
  }
  return { properties, meta };
}

function toPlainObject(
  value: unknown
): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(obj)) {
    out[key] = deserializePropertyValue(rawValue);
  }
  return out;
}

function toNodeRecord(record: Neo4jRecord): Neo4jNodeRecord {
  const node = record.get("n") as { properties: Record<string, unknown> };
  const labels = (record.get("labels") as string[]).filter((label) => label !== "GraphEntity");
  const props = toPlainObject(node.properties);
  const { properties, meta } = extractProperties(props);
  return {
    id: String(props.id),
    labels,
    properties,
    meta,
  };
}

function toEdgeRecord(record: Neo4jRecord): Neo4jEdgeRecord {
  const relationship = record.get("r") as { properties: Record<string, unknown> };
  const props = toPlainObject(relationship.properties);
  const { properties, meta } = extractProperties(props);
  return {
    id: String(props.id),
    type: String(record.get("type")),
    fromNodeId: String(record.get("fromNodeId")),
    toNodeId: String(record.get("toNodeId")),
    properties,
    meta,
  };
}

function toNodeRecordFromMap(raw: Record<string, unknown>): Neo4jNodeRecord {
  const props = toPlainObject(raw.properties);
  const { properties, meta } = extractProperties(props);
  return {
    id: String(raw.id),
    labels: ((raw.labels as string[]) ?? []).filter((label) => label !== "GraphEntity"),
    properties,
    meta,
  };
}

function toEdgeRecordFromMap(raw: Record<string, unknown>): Neo4jEdgeRecord {
  const props = toPlainObject(raw.properties);
  const { properties, meta } = extractProperties(props);
  return {
    id: String(raw.id),
    type: String(raw.type),
    fromNodeId: String(raw.fromNodeId),
    toNodeId: String(raw.toNodeId),
    properties,
    meta,
  };
}

let driverSingleton: Driver | null = null;
let schemaPromise: Promise<void> | null = null;

async function getDriver(): Promise<Driver> {
  if (driverSingleton) return driverSingleton;
  const config = getNeo4jConfig();
  driverSingleton = neo4j.driver(
    config.uri,
    neo4j.auth.basic(config.username, config.password)
  );
  await driverSingleton.verifyConnectivity();
  return driverSingleton;
}

async function ensureSchema(database: string): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const driver = await getDriver();
    const session = driver.session({ database });
    try {
      await session.run(
        "CREATE CONSTRAINT graph_entity_id IF NOT EXISTS FOR (n:GraphEntity) REQUIRE n.id IS UNIQUE"
      );
    } finally {
      await session.close();
    }
  })();
  return schemaPromise;
}

export class Neo4jGraphStore implements GraphStore {
  private constructor(private readonly driver: Driver, private readonly database: string) {}

  static async create(): Promise<Neo4jGraphStore> {
    const config = getNeo4jConfig();
    const driver = await getDriver();
    await ensureSchema(config.database);
    return new Neo4jGraphStore(driver, config.database);
  }

  private async read<T>(work: (session: ReturnType<Driver["session"]>) => Promise<T>): Promise<T> {
    const session = this.driver.session({ database: this.database, defaultAccessMode: neo4j.session.READ });
    try {
      return await work(session);
    } finally {
      await session.close();
    }
  }

  private async write<T>(work: (session: ReturnType<Driver["session"]>) => Promise<T>): Promise<T> {
    const session = this.driver.session({ database: this.database, defaultAccessMode: neo4j.session.WRITE });
    try {
      return await work(session);
    } finally {
      await session.close();
    }
  }

  async clearAll(): Promise<void> {
    await this.write(async (session) => {
      await session.run("MATCH (n:GraphEntity) DETACH DELETE n");
    });
  }

  async importGraph(nodes: GraphNode[], edges: GraphEdge[]): Promise<void> {
    const nodeGroups = new Map<string, Array<{ id: string; props: Record<string, unknown> }>>();
    for (const node of nodes) {
      const key = [...node.labels].sort().join("|");
      const list = nodeGroups.get(key) ?? [];
      list.push({
        id: node.id,
        props: serializeProperties(node.properties, node.meta),
      });
      nodeGroups.set(key, list);
    }

    const edgeGroups = new Map<string, Array<{
      id: string;
      fromNodeId: string;
      toNodeId: string;
      props: Record<string, unknown>;
    }>>();
    for (const edge of edges) {
      const list = edgeGroups.get(edge.type) ?? [];
      list.push({
        id: edge.id,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        props: serializeProperties(edge.properties, edge.meta),
      });
      edgeGroups.set(edge.type, list);
    }

    await this.write(async (session) => {
      for (const [labelKey, rows] of nodeGroups) {
        const labels = labelKey
          .split("|")
          .filter(Boolean)
          .map((label) => assertSafeToken(label, "label"));
        const setLabelsClause = labels.map((label) => `SET n:${label}`).join(" ");
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500);
          await session.run(
            `UNWIND $rows AS row
             MERGE (n:GraphEntity {id: row.id})
             SET n += row.props
             ${setLabelsClause}`,
            { rows: batch }
          );
        }
      }

      for (const [type, rows] of edgeGroups) {
        const safeType = assertSafeToken(type, "relationship");
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500);
          await session.run(
            `UNWIND $rows AS row
             MATCH (from:GraphEntity {id: row.fromNodeId}), (to:GraphEntity {id: row.toNodeId})
             MERGE (from)-[r:${safeType} {id: row.id}]->(to)
             SET r += row.props`,
            { rows: batch }
          );
        }
      }
    });
  }

  async findBestNodeMatch(label: string, query: string): Promise<GraphNode | null> {
    const safeLabel = assertSafeToken(label, "label");
    const propertyKeys = getEntityDisplayPropertyKeys(label).map((key) => assertSafePropertyKey(key));
    return this.read(async (session) => {
      const result = await session.run(
        `MATCH (n:GraphEntity:${safeLabel})
         WITH n, [key IN $propertyKeys WHERE n[key] IS NOT NULL | toString(n[key])] AS values
         WHERE size(values) > 0
           AND any(value IN values WHERE toLower(value) = toLower($query) OR toLower(value) CONTAINS toLower($query))
         WITH n, values,
              CASE
                WHEN any(value IN values WHERE toLower(value) = toLower($query)) THEN 0
                ELSE 1
              END AS exactRank,
              head(values) AS displayValue
         RETURN n, labels(n) AS labels
         ORDER BY exactRank, displayValue
         LIMIT 1`,
        { propertyKeys, query }
      );
      if (result.records.length === 0) return null;
      const record = toNodeRecord(result.records[0]);
      return new StoredNode(record.id, record.labels, record.properties, record.meta);
    });
  }

  async getNodeSubgraph(nodeId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    return this.read(async (session) => {
      const result = await session.run(
        `MATCH (seed:GraphEntity {id: $nodeId})
         OPTIONAL MATCH path=(seed)-[*1..2]-(neighbor:GraphEntity)
         WITH seed, collect(path)[0..250] AS rawPaths
         WITH
           [seed] + reduce(nodeAcc = [], path IN rawPaths |
             nodeAcc + CASE
               WHEN path IS NULL THEN []
               ELSE nodes(path)
             END
           ) AS nodeList,
           reduce(edgeAcc = [], path IN rawPaths |
             edgeAcc + CASE
               WHEN path IS NULL THEN []
               ELSE relationships(path)
             END
           ) AS edgeList
         RETURN
           [node IN nodeList WHERE node IS NOT NULL | {
             id: node.id,
             labels: labels(node),
             properties: properties(node)
           }] AS nodeMaps,
           [edge IN edgeList WHERE edge IS NOT NULL | {
             id: edge.id,
             type: type(edge),
             fromNodeId: startNode(edge).id,
             toNodeId: endNode(edge).id,
             properties: properties(edge)
           }] AS edgeMaps`,
        { nodeId }
      );
      if (result.records.length === 0) {
        return { nodes: [], edges: [] };
      }

      const nodeMaps = (result.records[0].get("nodeMaps") as Array<Record<string, unknown> | null>) ?? [];
      const edgeMaps = (result.records[0].get("edgeMaps") as Array<Record<string, unknown> | null>) ?? [];

      const nodes = Array.from(
        new Map(
          nodeMaps
            .filter((node): node is Record<string, unknown> => !!node && !!node.id)
            .map((node) => {
              const record = toNodeRecordFromMap(node);
              return [record.id, new StoredNode(record.id, record.labels, record.properties, record.meta)];
            })
        ).values()
      );
      const edges = Array.from(
        new Map(
          edgeMaps
            .filter((edge): edge is Record<string, unknown> => !!edge && !!edge.id)
            .map((edge) => {
              const record = toEdgeRecordFromMap(edge);
              return [
                record.id,
                new StoredEdge(
                  record.id,
                  record.type,
                  record.fromNodeId,
                  record.toNodeId,
                  record.properties,
                  record.meta
                ),
              ];
            })
        ).values()
      );

      return { nodes, edges };
    });
  }

  async getNodePreview(nodeId: string): Promise<
    Array<{
      id: string;
      label: string;
      name: string;
      relationshipType: string;
      direction: "inbound" | "outbound";
    }>
  > {
    return this.read(async (session) => {
      const result = await session.run(
        `MATCH (seed:GraphEntity {id: $nodeId})
         CALL {
           WITH seed
           OPTIONAL MATCH (seed)-[outRel]->(outNode:GraphEntity)
           RETURN collect(DISTINCT CASE
             WHEN outNode IS NULL THEN NULL
             ELSE {
               id: outNode.id,
               label: head([label IN labels(outNode) WHERE label <> 'GraphEntity']),
               name: coalesce(outNode.name, outNode.title, outNode.venue, outNode.id),
               relationshipType: type(outRel),
               direction: 'outbound'
             }
           END) AS outboundItems
         }
         CALL {
           WITH seed
           OPTIONAL MATCH (inNode:GraphEntity)-[inRel]->(seed)
           RETURN collect(DISTINCT CASE
             WHEN inNode IS NULL THEN NULL
             ELSE {
               id: inNode.id,
               label: head([label IN labels(inNode) WHERE label <> 'GraphEntity']),
               name: coalesce(inNode.name, inNode.title, inNode.venue, inNode.id),
               relationshipType: type(inRel),
               direction: 'inbound'
             }
           END) AS inboundItems
         }
         RETURN outboundItems + inboundItems AS previewItems`,
        { nodeId }
      );

      if (result.records.length === 0) {
        return [];
      }

      const items = (result.records[0].get("previewItems") as Array<Record<string, unknown> | null>) ?? [];
      return items
        .filter((item): item is Record<string, unknown> => !!item && !!item.id)
        .map((item) => ({
          id: String(item.id),
          label: String(item.label ?? "Node"),
          name: String(item.name ?? item.id),
          relationshipType: String(item.relationshipType ?? ""),
          direction: item.direction === "inbound" ? "inbound" : "outbound",
        }));
    });
  }

  async getArtistSubgraph(artistQuery: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const artist = await this.findBestNodeMatch("Artist", artistQuery);
    if (!artist) {
      return { nodes: [], edges: [] };
    }
    return this.getNodeSubgraph(artist.id);
  }

  async createNode(node: GraphNode): Promise<void> {
    const labels = [":GraphEntity", ...node.labels.map((label) => `:${assertSafeToken(label, "label")}`)].join("");
    const props = serializeProperties(node.properties, node.meta);
    await this.write(async (session) => {
      await session.run(
        `CREATE (n${labels} {id: $id}) SET n += $props`,
        { id: node.id, props }
      );
    });
  }

  async updateNode(nodeId: string, patch: NodePatch): Promise<GraphNode> {
    const existing = await this.getNode(nodeId);
    if (!existing) throw new Error(`Node not found: ${nodeId}`);
    const labels = patch.labels ?? existing.labels;
    const nextProps = patch.properties ? { ...existing.properties, ...patch.properties } : existing.properties;
    const nextMeta = patch.meta ?? existing.meta;
    const addLabels = labels.filter((label) => !existing.labels.includes(label));
    const removeLabels = existing.labels.filter((label) => !labels.includes(label));
    const addClause = addLabels.map((label) => `SET n:${assertSafeToken(label, "label")}`).join(" ");
    const removeClause = removeLabels.map((label) => `REMOVE n:${assertSafeToken(label, "label")}`).join(" ");
    await this.write(async (session) => {
      await session.run(
        `MATCH (n:GraphEntity {id: $id}) ${removeClause} ${addClause} SET n += $props RETURN n`,
        { id: nodeId, props: serializeProperties(nextProps, nextMeta) }
      );
    });
    return new StoredNode(nodeId, labels, nextProps, nextMeta);
  }

  async deleteNode(nodeId: string, options?: DeleteNodeOptions): Promise<void> {
    await this.write(async (session) => {
      const adjacent = await session.run(
        "MATCH (n:GraphEntity {id: $id}) OPTIONAL MATCH (n)-[r]-() RETURN count(r) AS count",
        { id: nodeId }
      );
      const count = Number(adjacent.records[0]?.get("count") ?? 0);
      if (count > 0 && !options?.cascade) {
        throw new Error(`Cannot delete node ${nodeId}: has ${count} incident edges (use cascade)`);
      }
      await session.run(
        options?.cascade
          ? "MATCH (n:GraphEntity {id: $id}) DETACH DELETE n"
          : "MATCH (n:GraphEntity {id: $id}) DELETE n",
        { id: nodeId }
      );
    });
  }

  async getNode(nodeId: string): Promise<GraphNode | null> {
    return this.read(async (session) => {
      const result = await session.run(
        "MATCH (n:GraphEntity {id: $id}) RETURN n, labels(n) AS labels",
        { id: nodeId }
      );
      if (result.records.length === 0) return null;
      const record = toNodeRecord(result.records[0]);
      return new StoredNode(record.id, record.labels, record.properties, record.meta);
    });
  }

  async findNodes(query: NodeQuery): Promise<GraphNode[]> {
    const labelClause = query.label ? `:GraphEntity:${assertSafeToken(query.label, "label")}` : ":GraphEntity";
    const whereParts: string[] = [];
    const params: Record<string, unknown> = { maxResults: neo4j.int(query.maxResults ?? 1000) };
    if (query.propertyKey !== undefined) {
      whereParts.push("n[$propertyKey] IS NOT NULL");
      params.propertyKey = query.propertyKey;
      if (query.propertyValue !== undefined) {
        whereParts.push("n[$propertyKey] = $propertyValue");
        params.propertyValue = serializePropertyValue(query.propertyValue);
      }
    }
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
    return this.read(async (session) => {
      const result = await session.run(
        `MATCH (n${labelClause}) ${whereClause} RETURN n, labels(n) AS labels ORDER BY n.id LIMIT $maxResults`,
        params
      );
      return result.records.map((record) => {
        const node = toNodeRecord(record);
        return new StoredNode(node.id, node.labels, node.properties, node.meta);
      });
    });
  }

  async createEdge(edge: GraphEdge): Promise<void> {
    const type = assertSafeToken(edge.type, "relationship");
    await this.write(async (session) => {
      await session.run(
        `MATCH (from:GraphEntity {id: $fromNodeId}), (to:GraphEntity {id: $toNodeId})
         CREATE (from)-[r:${type} {id: $id}]->(to)
         SET r += $props`,
        {
          id: edge.id,
          fromNodeId: edge.fromNodeId,
          toNodeId: edge.toNodeId,
          props: serializeProperties(edge.properties, edge.meta),
        }
      );
    });
  }

  async updateEdge(edgeId: string, patch: EdgePatch): Promise<GraphEdge> {
    const existing = await this.getEdge(edgeId);
    if (!existing) throw new Error(`Edge not found: ${edgeId}`);
    const nextProps = patch.properties ? { ...existing.properties, ...patch.properties } : existing.properties;
    const nextMeta = patch.meta ?? existing.meta;
    await this.write(async (session) => {
      await session.run(
        "MATCH ()-[r {id: $id}]->() SET r += $props RETURN r",
        { id: edgeId, props: serializeProperties(nextProps, nextMeta) }
      );
    });
    return new StoredEdge(
      existing.id,
      existing.type,
      existing.fromNodeId,
      existing.toNodeId,
      nextProps,
      nextMeta
    );
  }

  async deleteEdge(edgeId: string): Promise<void> {
    await this.write(async (session) => {
      const result = await session.run("MATCH ()-[r {id: $id}]->() DELETE r RETURN count(r) AS count", { id: edgeId });
      const count = Number(result.records[0]?.get("count") ?? 0);
      if (count === 0) throw new Error(`Edge not found: ${edgeId}`);
    });
  }

  async getEdge(edgeId: string): Promise<GraphEdge | null> {
    return this.read(async (session) => {
      const result = await session.run(
        "MATCH (from:GraphEntity)-[r]->(to:GraphEntity) WHERE r.id = $id RETURN r, type(r) AS type, from.id AS fromNodeId, to.id AS toNodeId",
        { id: edgeId }
      );
      if (result.records.length === 0) return null;
      const edge = toEdgeRecord(result.records[0]);
      return new StoredEdge(edge.id, edge.type, edge.fromNodeId, edge.toNodeId, edge.properties, edge.meta);
    });
  }

  async findEdges(query: EdgeQuery): Promise<GraphEdge[]> {
    const typeClause = query.type ? `:${assertSafeToken(query.type, "relationship")}` : "";
    const whereParts: string[] = [];
    const params: Record<string, unknown> = { maxResults: neo4j.int(query.maxResults ?? 1000) };
    if (query.fromNodeId !== undefined) {
      whereParts.push("from.id = $fromNodeId");
      params.fromNodeId = query.fromNodeId;
    }
    if (query.toNodeId !== undefined) {
      whereParts.push("to.id = $toNodeId");
      params.toNodeId = query.toNodeId;
    }
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
    return this.read(async (session) => {
      const result = await session.run(
        `MATCH (from:GraphEntity)-[r${typeClause}]->(to:GraphEntity)
         ${whereClause}
         RETURN r, type(r) AS type, from.id AS fromNodeId, to.id AS toNodeId
         ORDER BY r.id LIMIT $maxResults`,
        params
      );
      return result.records.map((record) => {
        const edge = toEdgeRecord(record);
        return new StoredEdge(edge.id, edge.type, edge.fromNodeId, edge.toNodeId, edge.properties, edge.meta);
      });
    });
  }

  async getAdjacentEdges(nodeId: string, direction: Direction): Promise<GraphEdge[]> {
    const pattern =
      direction === "outbound"
        ? "(from:GraphEntity {id: $nodeId})-[r]->(to:GraphEntity)"
        : direction === "inbound"
          ? "(from:GraphEntity)-[r]->(to:GraphEntity {id: $nodeId})"
          : "(from:GraphEntity)-[r]-(to:GraphEntity) WHERE from.id = $nodeId OR to.id = $nodeId";
    const query =
      direction === "both"
        ? `MATCH ${pattern}
           RETURN r, type(r) AS type, startNode(r).id AS fromNodeId, endNode(r).id AS toNodeId
           ORDER BY r.id`
        : `MATCH ${pattern}
           RETURN r, type(r) AS type, from.id AS fromNodeId, to.id AS toNodeId
           ORDER BY r.id`;
    return this.read(async (session) => {
      const result = await session.run(query, { nodeId });
      return result.records.map((record) => {
        const edge = toEdgeRecord(record);
        return new StoredEdge(edge.id, edge.type, edge.fromNodeId, edge.toNodeId, edge.properties, edge.meta);
      });
    });
  }

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}
