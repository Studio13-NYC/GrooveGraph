/**
 * Tools the LLM can call on the fly during enrichment or search.
 * Uses OpenAI-style tool definitions (function schema + executor).
 */

import { loadOntologySchema, ontologySchemaForLlm } from "../../lib/ontology";
import { getEntityDisplayPropertyKeys } from "../../lib/entity-config";
import type { GraphStore } from "../../store/types";

/** OpenAI tool definition: type "function" with name and parameters. */
export interface LlmToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties?: Record<string, { type: string; description?: string }>;
      required?: string[];
    };
  };
}

/** Result of executing one tool call. */
interface LlmToolResult {
  tool_call_id: string;
  content: string;
}

/** Context passed to tool executors (e.g. store for search). */
export interface LlmToolContext {
  store?: GraphStore;
}

const ONTOLOGY_TOOL: LlmToolDef = {
  type: "function",
  function: {
    name: "get_ontology_schema",
    description:
      "Get the full graph ontology: entity labels, properties, allowed relationships, synonyms, and identity rules. Call this when you need to check valid labels, relationship types, or how to structure candidates.",
    parameters: { type: "object", properties: {} },
  },
};

const SEARCH_ENTITY_TOOL: LlmToolDef = {
  type: "function",
  function: {
    name: "search_entity",
    description:
      "Search the graph for an entity by label and name/title. Returns matching node ids and display names so you can reference existing nodes or avoid duplicates.",
    parameters: {
      type: "object",
      properties: {
        label: {
          type: "string",
          description: "Entity label (e.g. Artist, Album, Track). Use only labels from the ontology.",
        },
        name: {
          type: "string",
          description: "Display name or title to search for (e.g. artist name, album title).",
        },
      },
      required: ["label", "name"],
    },
  },
};

/**
 * Tool definitions to send in the chat/completions request.
 * The LLM can request these when it needs ontology or graph lookup.
 */
export const ENRICHMENT_LLM_TOOLS: LlmToolDef[] = [ONTOLOGY_TOOL, SEARCH_ENTITY_TOOL];

/**
 * Execute a single tool call. Returns the content string to send back as tool result.
 */
export async function executeLlmTool(
  name: string,
  args: Record<string, unknown>,
  context: LlmToolContext
): Promise<string> {
  if (name === "get_ontology_schema") {
    const schema = loadOntologySchema();
    return ontologySchemaForLlm(schema);
  }

  if (name === "search_entity") {
    const store = context.store;
    if (!store) {
      return JSON.stringify({ error: "Graph store not available for search." });
    }
    const label = typeof args.label === "string" ? args.label.trim() : "";
    const nameArg = typeof args.name === "string" ? args.name.trim() : "";
    if (!label || !nameArg) {
      return JSON.stringify({ error: "search_entity requires label and name." });
    }
    const displayKeys = getEntityDisplayPropertyKeys(label);
    const primaryKey = displayKeys[0] ?? "name";
    const nodes = await store.findNodes({
      label,
      propertyKey: primaryKey,
      propertyValue: nameArg,
      maxResults: 20,
    });
    const results = nodes.map((node) => {
      const nameVal =
        (node.properties[primaryKey] as string) ??
        (node.properties.name as string) ??
        (node.properties.title as string) ??
        node.id;
      return { id: node.id, label: node.labels[0], name: nameVal };
    });
    return JSON.stringify({ matches: results, count: results.length });
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

/**
 * Build the system prompt snippet that tells the LLM it can use tools.
 */
export function getLlmToolsSystemSnippet(): string {
  return [
    "You have access to tools you can call when needed:",
    "- get_ontology_schema(): returns the full graph ontology (entity labels, relationships, synonyms). Call this if you need to check allowed labels or relationship types.",
    "- search_entity(label, name): search the graph for an entity by label and name. Use to check if an entity already exists or to reference existing node ids.",
    "When you need information from a tool, call it; the result will be provided before you continue.",
  ].join("\n");
}
