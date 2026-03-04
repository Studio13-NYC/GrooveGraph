/**
 * Wikipedia adapter: fetch summary (short bio) from Wikipedia REST API.
 * Uses Opensearch to resolve display name to page title, then page summary.
 */

import type { RawEnrichmentPayload, SourceMetadata } from "../types.js";

const OPENSEARCH_URL = "https://en.wikipedia.org/w/api.php";
const REST_SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const USER_AGENT = "GrooveGraph/1.0 (https://github.com/Studio13-NYC/GrooveGraph)";

function buildSourceMetadata(url: string, excerpt?: string): SourceMetadata {
  return {
    source_id: "wikipedia",
    source_name: "Wikipedia",
    source_type: "api",
    url,
    retrieved_at: new Date().toISOString(),
    excerpt,
  };
}

/**
 * Fetch Wikipedia summary for an entity by name (e.g. artist name). Returns zero or one raw payload.
 */
export async function fetchSummaryByName(
  name: string
): Promise<RawEnrichmentPayload[]> {
  if (!name.trim()) return [];
  const searchQuery = encodeURIComponent(name.trim());
  const searchUrl = `${OPENSEARCH_URL}?action=opensearch&search=${searchQuery}&limit=1&format=json`;
  const searchRes = await fetch(searchUrl, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!searchRes.ok) return [];
  const searchData = (await searchRes.json()) as [string, string[], string[], string[]];
  const titles = searchData[1];
  const urls = searchData[3];
  if (!titles?.length || !urls?.length) return [];
  const pageTitle = titles[0];
  const pageUrl = urls[0];
  const summaryRes = await fetch(
    `${REST_SUMMARY_URL}${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`,
    { headers: { "User-Agent": USER_AGENT } }
  );
  if (!summaryRes.ok) return [];
  const summaryData = (await summaryRes.json()) as {
    title?: string;
    extract?: string;
    description?: string;
  };
  const extract = summaryData.extract ?? summaryData.description ?? undefined;
  if (!extract) return [];
  return [
    {
      source: buildSourceMetadata(pageUrl, extract.slice(0, 500)),
      sourceDisplayName: summaryData.title ?? pageTitle,
      properties: {
        biography: extract,
      },
    },
  ];
}
