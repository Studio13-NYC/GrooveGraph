import type { EnrichmentEdgeMutation, EnrichmentNodeMutation, RawEnrichmentPayload } from "../types.js";
import type { SourceDefinition } from "../sources/registry.js";
import { slug } from "../../load/build-graph.js";
import { buildSourceMetadata, fetchJson } from "./shared.js";

interface WikidataSearchResponse {
  search?: Array<{
    id?: string;
    label?: string;
    description?: string;
    concepturi?: string;
  }>;
}

interface WikidataSparqlResult {
  results?: {
    bindings?: Array<Record<string, { type: string; value: string }>>;
  };
}

const SEARCH_API =
  "https://www.wikidata.org/w/api.php?action=wbsearchentities&language=en&format=json&limit=1&search=";
const SPARQL_API = "https://query.wikidata.org/sparql?format=json&query=";

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim()))];
}

function buildMemberNode(name: string, wikidataId?: string): EnrichmentNodeMutation {
  return {
    id: wikidataId ? `person-wikidata-${wikidataId.toLowerCase()}` : `person-${slug(name)}`,
    labels: ["Person"],
    properties: {
      name,
      ...(wikidataId ? { wikidata_id: wikidataId } : {}),
    },
  };
}

function buildMemberEdge(fromNodeId: string, toNodeId: string, context: string): EnrichmentEdgeMutation {
  return {
    id: `enriched-member-of-${slug(fromNodeId)}-${slug(toNodeId)}-${slug(context)}`,
    type: "MEMBER_OF",
    fromNodeId,
    toNodeId,
    properties: {
      context,
    },
  };
}

function buildBandDetailsQuery(qid: string): string {
  return `
    SELECT ?item ?itemLabel ?itemDescription ?countryLabel ?inception ?genreLabel WHERE {
      VALUES ?item { wd:${qid} }
      OPTIONAL { ?item schema:description ?itemDescription FILTER (lang(?itemDescription) = "en") }
      OPTIONAL { ?item wdt:P495 ?country }
      OPTIONAL { ?item wdt:P571 ?inception }
      OPTIONAL { ?item wdt:P136 ?genre }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;
}

function buildBandMembersQuery(qid: string): string {
  return `
    SELECT ?member ?memberLabel WHERE {
      VALUES ?item { wd:${qid} }
      OPTIONAL {
        ?member wdt:P463 ?item .
        ?member wdt:P31 wd:Q5 .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
    }
  `;
}

function buildGroupMembershipsQuery(qid: string): string {
  return `
    SELECT ?group ?groupLabel WHERE {
      VALUES ?item { wd:${qid} }
      OPTIONAL {
        ?item wdt:P463 ?group .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
    }
  `;
}

export async function fetchWikidataByName(
  source: SourceDefinition,
  displayName: string,
  entityType: string,
  targetNodeId: string
): Promise<RawEnrichmentPayload[]> {
  if (!displayName.trim()) return [];

  const searchResponse = await fetchJson<WikidataSearchResponse>(`${SEARCH_API}${encodeURIComponent(displayName.trim())}`);
  const match = searchResponse?.search?.[0];
  if (!match?.id) return [];

  const qid = match.id;
  const [detailsResult, membersResult, groupsResult] = await Promise.all([
    fetchJson<WikidataSparqlResult>(`${SPARQL_API}${encodeURIComponent(buildBandDetailsQuery(qid))}`, {
      headers: {
        Accept: "application/sparql-results+json",
      },
    }),
    fetchJson<WikidataSparqlResult>(`${SPARQL_API}${encodeURIComponent(buildBandMembersQuery(qid))}`, {
      headers: {
        Accept: "application/sparql-results+json",
      },
    }),
    fetchJson<WikidataSparqlResult>(`${SPARQL_API}${encodeURIComponent(buildGroupMembershipsQuery(qid))}`, {
      headers: {
        Accept: "application/sparql-results+json",
      },
    }),
  ]);
  const bindings = detailsResult?.results?.bindings ?? [];
  const memberBindings = membersResult?.results?.bindings ?? [];
  const groupBindings = groupsResult?.results?.bindings ?? [];
  const sourceUrl = match.concepturi || `https://www.wikidata.org/wiki/${qid}`;
  const country = bindings[0]?.countryLabel?.value;
  const inception = bindings[0]?.inception?.value?.slice(0, 4);
  const genres = uniqueStrings(bindings.map((binding) => binding.genreLabel?.value)).slice(0, 6);
  const members = memberBindings
    .map((binding) => ({
      name: binding.memberLabel?.value,
      wikidataId: binding.member?.value?.split("/").pop(),
    }))
    .filter((member) => member.name);
  const groups = groupBindings
    .map((binding) => ({
      name: binding.groupLabel?.value,
      wikidataId: binding.group?.value?.split("/").pop(),
    }))
    .filter((group) => group.name);

  const relatedNodes: EnrichmentNodeMutation[] = [];
  const relatedEdges: EnrichmentEdgeMutation[] = [];

  for (const genre of genres) {
    const genreId = `genre-${slug(genre)}`;
    relatedNodes.push({
      id: genreId,
      labels: ["Genre"],
      properties: { name: genre },
    });
    relatedEdges.push({
      id: `enriched-part-of-genre-${slug(displayName)}-${slug(genre)}`,
      type: "PART_OF_GENRE",
      fromNodeId: targetNodeId,
      toNodeId: genreId,
      properties: {},
    });
  }

  for (const member of members) {
    const personNode = buildMemberNode(member.name!, member.wikidataId);
    relatedNodes.push(personNode);
    relatedEdges.push(buildMemberEdge(personNode.id, targetNodeId, "wikidata_member"));
  }

  if (entityType === "Artist" || entityType === "Person") {
    for (const group of groups) {
      const groupId = group.wikidataId ? `artist-wikidata-${group.wikidataId.toLowerCase()}` : `artist-${slug(group.name!)}`;
      relatedNodes.push({
        id: groupId,
        labels: ["Artist"],
        properties: {
          name: group.name!,
          ...(group.wikidataId ? { wikidata_id: group.wikidataId } : {}),
        },
      });
      relatedEdges.push(buildMemberEdge(targetNodeId, groupId, "wikidata_member_of"));
    }
  }

  const properties: Record<string, unknown> = {
    ...(match.description ? { biography: match.description } : {}),
    ...(country ? { country } : {}),
    ...(inception ? { active_years: `${inception}-present` } : {}),
  };

  if (Object.keys(properties).length === 0 && relatedNodes.length === 0 && relatedEdges.length === 0) {
    return [];
  }

  return [
    {
      source: buildSourceMetadata(source, sourceUrl, match.description),
      sourceDisplayName: match.label ?? displayName,
      properties,
      ...(relatedNodes.length > 0 ? { relatedNodes } : {}),
      ...(relatedEdges.length > 0 ? { relatedEdges } : {}),
    },
  ];
}
