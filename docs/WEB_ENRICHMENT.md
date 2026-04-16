# Web enrichment — canonical sources + Brave + optional HTTP text

## Intent

Entity-service (`POST /extract`) receives a **single large stimulus** that combines:

1. **Canonical music / knowledge APIs** (always attempted when enrichment runs): **Wikipedia** (MediaWiki), **MusicBrainz** (WS JSON), **Discogs** (REST search). Prefer structured JSON from each service; **no ad hoc HTML scraping of arbitrary SERP pages** in the canonical stage.
2. **Brave Web Search** (optional): **SERP titles + snippets only** — not full-page fetch via Brave.
3. **Optional supplementary HTTP** (off by default): **directed `GET`** of a small number of **known URLs** (Brave result links + canonical `reference_urls`), then **main-text extraction** (trafilatura) merged into the stimulus. Controlled by env / CLI so API-first behavior stays the default.

This matches product direction: APIs before HTML where available; Brave for discovery / long-tail snippets (`docs/GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md`, `AGENTS.md`).

## What runs when

| Stage | `gg search` (no `--extract`) | `gg search --extract` / `gg explore` | `gg analyze` |
|--------|------------------------------|----------------------------------------|----------------|
| Wikipedia + MB + Discogs | **Skipped** (no ES call) | **Yes** before `/extract` | **Yes** before `/extract` |
| Brave | If key set / flags | If key set | If key set |
| Supplementary HTTP (`trafilatura`) | **No** | **If** `GROOVEGRAPH_SUPPLEMENTARY_HTTP_FETCH` or `--fetch-supplementary-pages` | Same |

## Stimulus layout

Sections are concatenated in order:

1. `--- Query ---` + original needle  
2. `--- Wikipedia ---` + intro extract (if search hit); Wikipedia article URL may appear in `canonical_sources.wikipedia.reference_urls`  
3. `--- MusicBrainz ---` + short text from top artist hits  
4. `--- Discogs ---` + short text from top artist hits  
5. **Deep artist (optional)** — when `GROOVEGRAPH_CANONICAL_DEEP_ARTIST` or `--deep-artist-context`: extra MB **release** lines, optional MB **recording** titles from the first matched release (`GROOVEGRAPH_MB_DEEP_RECORDING_CAP`, `0` = skip), truncated Discogs **artist profile**  
6. `--- Web excerpts (Brave) ---` + snippets (only if Brave succeeded; query line omitted here if section 1 already carried the needle)  
7. **Supplementary HTTP (optional)** — `--- Supplementary HTTP (readability-style extraction) ---` + per-URL blocks when enabled  

If every canonical call fails and Brave is off, stimulus falls back to the **needle** only.

## `gg explore` and Brave failures

`gg explore` requires a **non-empty enrichment path** for extract: extract runs if **any** of canonical **or** Brave produced usable content. If **both** are empty/failed, extract is skipped with `extract.error: insufficient_context`.

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `DISCOGS_TOKEN` | **Recommended** for Discogs | Personal access token from [Discogs Developer Settings](https://www.discogs.com/settings/developers). Sent as [`Authorization: Discogs token=…`](https://www.discogs.com/developers/page:authentication,header:authentication). If unset, the Discogs section is skipped (`canonical_sources.discogs.detail`). |
| `GROOVEGRAPH_HTTP_USER_AGENT` | **Strongly recommended** | Sent on **Wikipedia**, **MusicBrainz**, **Discogs**, and supplementary HTTP. Discogs requires a **unique** identifying string (see [their docs](https://www.discogs.com/developers/)); MusicBrainz expects the same. Repo-root `.env` is loaded before each enrichment run. |
| `WIKIPEDIA_LANG` | Optional | Wiki subdomain (default `en`). |
| `BRAVE_API_KEY` | Optional | Brave snippets block; unchanged. |
| `GROOVEGRAPH_STIMULUS_MAX_CHARS` | Optional | Hard cap on merged stimulus length (default `500000`). CLI: `--max-stimulus-chars`. |
| `GROOVEGRAPH_WIKIPEDIA_SECTION_MAX_CHARS` | Optional | Cap per Wikipedia section in combined text (default `24000`). |
| `GROOVEGRAPH_BRAVE_EMBED_MAX_CHARS` | Optional | Cap for Brave-derived excerpt block (default `500000`). |
| `GROOVEGRAPH_SUPPLEMENTARY_HTTP_FETCH` | Optional | `1` / `true` / `on` — enable optional HTTP page text merge. CLI overrides: `--fetch-supplementary-pages` / `--no-fetch-supplementary-pages`. |
| `GROOVEGRAPH_SUPPLEMENTARY_HTTP_FETCH_MAX_URLS` | Optional | Max URLs to fetch (default `3`, max `20`). |
| `GROOVEGRAPH_CANONICAL_DEEP_ARTIST` | Optional | `1` / `true` — extra MB release + recording sample + Discogs profile. CLI: `--deep-artist-context` / `--no-deep-artist-context`. |
| `GROOVEGRAPH_MB_DEEP_RELEASE_CAP` | Optional | Max release lines from MB (default `5`, max `50`). |
| `GROOVEGRAPH_MB_DEEP_RECORDING_CAP` | Optional | Max recording titles from **first** MB release (`release?inc=recordings`). Default `25` (hard max `25`); set `0` to skip the extra MB request. |

## Limits & politeness

- Per-source text is **capped** via env (see table above); defaults are in [`env_loader.py`](../cli/src/groovegraph/env_loader.py).
- **MusicBrainz**: one `artist` search per enrichment; **≥1.15s** delay before the MB request if Wikipedia ran first; additional delays before deep **artist**, **release**, and **recording** requests.
- **HTTP timeouts**: client default in `fetch_canonical_enrichment` (`timeout_s=14.0`); supplementary fetch uses a separate client with a bounded per-URL timeout (see `supplementary_http_text.py`).

## Deferred / not in CLI

- **Playwright** (or similar) for JS-heavy sites — not bundled in `gg`; would be a separate tool or future slice if product requests it.

## Code map

- [`cli/src/groovegraph/canonical_sources.py`](../cli/src/groovegraph/canonical_sources.py) — fetch + format + `CanonicalEnrichmentResult`; `load_repo_dotenv`; deep artist + recording sample.  
- [`cli/src/groovegraph/stimulus_compose.py`](../cli/src/groovegraph/stimulus_compose.py) — merge canonical + Brave for `/extract` `text`.  
- [`cli/src/groovegraph/brave_extract_context.py`](../cli/src/groovegraph/brave_extract_context.py) — `prefix_needle` for Brave-only excerpts; rich mode uses **`--- Web excerpts (Brave) ---`**; `iter_brave_web_result_urls` for supplementary URL collection.  
- [`cli/src/groovegraph/supplementary_http_text.py`](../cli/src/groovegraph/supplementary_http_text.py) — optional trafilatura merge.  
- [`cli/src/groovegraph/search_workflow.py`](../cli/src/groovegraph/search_workflow.py) / [`analyze_workflow.py`](../cli/src/groovegraph/analyze_workflow.py) — call composer; expose **`canonical_sources`**, **`supplementary_http`** when applicable.  
- [`cli/src/groovegraph/stimulus_assembly_options.py`](../cli/src/groovegraph/stimulus_assembly_options.py) — env defaults + CLI overrides for caps and flags.

## JSON report shape (`gg search --extract`, `gg explore`, `gg analyze`)

When canonical enrichment runs, the workflow object includes:

- **`canonical_sources`**: `{ needle, wikipedia, musicbrainz, discogs, ok_any, max_section_chars? }` — each chunk has `{ source, ok, chars, detail?, reference_urls? }`. **`detail`** explains skips (e.g. `missing_DISCOGS_TOKEN`, `no_search_hits`, HTTP error string). **`reference_urls`** lists canonical HTTP pointers (e.g. Wikipedia `fullurl`, MB artist page, Discogs `resource_url`) used for optional supplementary fetch.  
- **`supplementary_http`** (when enrichment + supplementary mode): structured probe result (`urls`, `per_url`, `skipped`, etc.).  
- **`extract.text`** (inside the payload sent to ES) is the merged stimulus; **`extract`** may include **`error: insufficient_context`** if neither canonical nor Brave produced usable text (`search_workflow` explore gate).

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Discogs always empty / `missing_DISCOGS_TOKEN` | **`DISCOGS_TOKEN`** unset in repo-root **`.env`** (or process did not load `.env`). |
| Discogs **401** / rate limit | Bad token or too many requests; Discogs documents per-IP limits ([developers](https://www.discogs.com/developers/)). |
| MusicBrainz **403** / blocked | **User-Agent** missing or generic; set **`GROOVEGRAPH_HTTP_USER_AGENT`** to a unique string with contact URL. |
| Wikipedia empty for valid topics | Wrong **`WIKIPEDIA_LANG`**; or API / network error in **`detail`**. |
| **`insufficient_context`** on explore | All three canonical sources failed **and** Brave failed or was off; fix keys or network. |
| Supplementary block always empty | URLs blocked or non-HTML; check **`supplementary_http.per_url`**; reduce fetch count or disable. |

## Local verification

```bash
cd cli
uv sync --group dev
uv run pytest tests/test_stimulus_compose.py tests/test_canonical_sources.py tests/test_canonical_sources_mocktransport.py -q
```

For a **live** smoke (network + keys): run **`uv run gg analyze "Some Artist"`** from **`cli/`** with `.env` filled; inspect JSON **`canonical_sources`** and **`stimulus.preview`** (or **`--emit-stimulus`** for full text). With **`GROOVEGRAPH_SUPPLEMENTARY_HTTP_FETCH=1`**, confirm **`supplementary_http`** in **`gg search --extract`** / **`gg explore`** output.
