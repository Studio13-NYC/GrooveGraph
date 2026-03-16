import type { RawEnrichmentPayload } from "../types";
import type { SourceDefinition } from "../sources/registry";
import {
  buildNarrativePayload,
  buildSummaryNarrative,
  extractDomain,
  fetchPageSummary,
  scrapeFirecrawlPageSummary,
  searchFirecrawl,
  searchDuckDuckGo,
} from "./shared";

export async function fetchGenericSourceByName(
  source: SourceDefinition,
  displayName: string,
  entityType: string
): Promise<RawEnrichmentPayload[]> {
  if (!displayName.trim()) return [];

  const sourceDomain = extractDomain(source.baseUrl);
  const queryParts = [`"${displayName.trim()}"`, `"${source.name}"`];
  if (entityType) {
    queryParts.push(entityType);
  }

  const firecrawlSummaries = await searchFirecrawl(
    sourceDomain ? `${queryParts.join(" ")} site:${sourceDomain}` : queryParts.join(" "),
    { maxResults: 3 }
  );

  const summary = await (
    firecrawlSummaries[0] ??
    (async () => {
      const searchResults = await searchDuckDuckGo(queryParts.join(" "), {
        ...(sourceDomain ? { siteDomain: sourceDomain } : {}),
        maxResults: 3,
      });
      const firstResult = searchResults[0];
      if (!firstResult) return null;
      return (await scrapeFirecrawlPageSummary(firstResult.url)) ?? (await fetchPageSummary(firstResult.url));
    })()
  );

  if (!summary) return [];

  const narrative = buildSummaryNarrative(summary);
  if (!narrative) return [];

  const propertyKey =
    source.id === "wikipedia" || source.id === "allmusic" || source.id === "rollingstone"
      ? "biography"
      : "notes";

  return buildNarrativePayload(
    source,
    summary.url,
    summary.title || displayName,
    narrative,
    propertyKey,
    "web_search"
  );
}
