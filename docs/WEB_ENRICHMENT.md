# Web enrichment — canonical sources + Brave (plan & behavior)

## Intent

Entity-service (`POST /extract`) should receive a **single large stimulus** that combines:

1. **Canonical music / knowledge APIs** (always attempted for the query string): **Wikipedia** (MediaWiki), **MusicBrainz** (WS JSON), **Discogs** (REST search). Prefer structured JSON from each service; no HTML page scraping in this slice.
2. **Brave Web Search** (optional): **SERP titles + snippets only** — same as today, not full page fetches.

This matches product Q&A: APIs before HTML where available; Brave for discovery / long-tail snippets (`docs/v2-product-qa-log.md`, `AGENTS.md`).

## What runs when

| Stage | `gg search` (no `--extract`) | `gg search --extract` / `gg explore` | `gg analyze` |
|--------|------------------------------|----------------------------------------|----------------|
| Wikipedia + MB + Discogs | **Skipped** (no ES call) | **Yes** before `/extract` | **Yes** before `/extract` |
| Brave | If key set / flags | If key set | If key set |

## Stimulus layout

Sections are concatenated in order:

1. `--- Query ---` + original needle  
2. `--- Wikipedia ---` + intro extract (if search hit)  
3. `--- MusicBrainz ---` + short text from top artist hits  
4. `--- Discogs ---` + short text from top artist hits  
5. `--- Web excerpts (Brave) ---` + snippets (only if Brave succeeded; query line omitted here if section 1 already carried the needle)

If every canonical call fails and Brave is off, stimulus falls back to the **needle** only.

## `gg explore` and Brave failures

`gg explore` requires a **non-empty enrichment path** for extract: extract runs if **any** of canonical **or** Brave produced usable content. If **both** are empty/failed, extract is skipped with `extract.error: insufficient_context` (replacing the old “Brave-only” gate when canonical could have satisfied the run).

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `DISCOGS_TOKEN` | **Recommended** for Discogs | Personal access token from [Discogs Developer Settings](https://www.discogs.com/settings/developers). Sent as [`Authorization: Discogs token=…`](https://www.discogs.com/developers/page:authentication,header:authentication). If unset, the Discogs section is skipped (`canonical_sources.discogs.detail`). |
| `GROOVEGRAPH_HTTP_USER_AGENT` | **Strongly recommended** | Sent on **Wikipedia**, **MusicBrainz**, and **Discogs** requests. Discogs requires a **unique** identifying string (see [their docs](https://www.discogs.com/developers/)); MusicBrainz expects the same. Repo-root `.env` is loaded before each enrichment run. |
| `WIKIPEDIA_LANG` | Optional | Wiki subdomain (default `en`). |
| `BRAVE_API_KEY` | Optional | Brave snippets block; unchanged. |

## Limits & politeness

- Per-source text is **capped** (see `canonical_sources.py`) so one bad response does not blow `/extract`.
- **MusicBrainz**: at most **one** `artist` search per enrichment; **≥1.1s** delay before that request if Wikipedia ran first (polite use).
- **HTTP timeouts**: short per request (see code constants).

## Future (not in this slice)

- Readability-style `GET` of selected URLs (not via Brave content API).
- Playwright for JS-heavy pages.
- Dedicated MusicBrainz **release** / **recording** lookups after entity link.

## Code map

- `cli/src/groovegraph/canonical_sources.py` — fetch + format + `CanonicalEnrichmentResult`; calls `load_repo_dotenv` and reads **`discogs_token()`** / **`groovegraph_http_user_agent()`** from [`env_loader.py`](../cli/src/groovegraph/env_loader.py).
- `cli/src/groovegraph/stimulus_compose.py` — merge canonical + Brave for `/extract` `text`.
- `cli/src/groovegraph/brave_extract_context.py` — `prefix_needle` for Brave-only excerpts; rich mode uses **`--- Web excerpts (Brave) ---`**.
- `cli/src/groovegraph/search_workflow.py` / `analyze_workflow.py` — call composer; expose **`canonical_sources`** on JSON when enrichment runs.

## JSON report shape (`gg search --extract`, `gg explore`, `gg analyze`)

When canonical enrichment runs, the workflow object includes:

- **`canonical_sources`**: `{ needle, wikipedia, musicbrainz, discogs, ok_any }` — each chunk has `{ source, ok, chars, detail? }`. **`detail`** explains skips (e.g. `missing_DISCOGS_TOKEN`, `no_search_hits`, HTTP error string).
- **`extract.text`** (inside the payload sent to ES) is the merged stimulus; **`extract`** may include **`error: insufficient_context`** if neither canonical nor Brave produced usable text (`search_workflow` explore gate).

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Discogs always empty / `missing_DISCOGS_TOKEN` | **`DISCOGS_TOKEN`** unset in repo-root **`.env`** (or process did not load `.env`). |
| Discogs **401** / rate limit | Bad token or too many requests; Discogs documents per-IP limits ([developers](https://www.discogs.com/developers/)). |
| MusicBrainz **403** / blocked | **User-Agent** missing or generic; set **`GROOVEGRAPH_HTTP_USER_AGENT`** to a unique string with contact URL. |
| Wikipedia empty for valid topics | Wrong **`WIKIPEDIA_LANG`**; or API / network error in **`detail`**. |
| **`insufficient_context`** on explore | All three canonical sources failed **and** Brave failed or was off; fix keys or network. |

## Local verification

```bash
cd cli
uv sync --group dev
uv run pytest tests/test_stimulus_compose.py tests/test_canonical_sources.py -q
```

For a **live** smoke (network + keys): run **`uv run gg analyze "Some Artist"`** from **`cli/`** with `.env` filled; inspect JSON **`canonical_sources`** and **`stimulus.preview`** (or **`--emit-stimulus`** for full text).
