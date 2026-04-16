# Next agent — TODO (handoff checklist)

Work from **top to bottom** unless product reorders. Check boxes in your own notes or commits; keep this file honest when a row ships.

---

## P0 — Operator / integration health

- [ ] **TypeDB + `gg-generic`:** On every live DB used for explore/search, confirm **`entity gg-generic`** exists (apply [`typedb/groovegraph-schema-add-gg-generic.tql`](../typedb/groovegraph-schema-add-gg-generic.tql) or full [`typedb/groovegraph-schema.tql`](../typedb/groovegraph-schema.tql); strip leading `//` lines if your apply path rejects comments).
- [ ] **Dual TypeDB env:** Confirm **entity-service** process **`TYPEDB_*`** targets the **same** database as **`gg`** so **`POST /schema-pipeline/formatted`** returns non-empty **`knownEntities`** when data exists ([`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md)).
- [ ] **`.env` for enrichment:** Repo-root **`DISCOGS_TOKEN`** + unique **`GROOVEGRAPH_HTTP_USER_AGENT`** set; run **`gg analyze "Known Artist"`** and verify JSON **`canonical_sources`** has non-empty **`discogs`** / **`wikipedia`** / **`musicbrainz`** where expected ([`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md)).

## P1 — Product slice (web → graph, APIs first)

- [ ] **URL fetch / readability:** Implement optional **`GET`** of selected URLs (from Brave results or canonical links), main-text extraction (readability-style), merge into stimulus **behind** a flag or subcommand — per [`v2-product-qa-log.md`](v2-product-qa-log.md) (HTTP + APIs first; no Brave page API).
- [ ] **Deeper MusicBrainz / Discogs:** After artist match, optional **release/recording** fetch and short text blocks; keep rate limits and caps ([`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md) “Future”).
- [ ] **Explore / search UX:** If stimulus grows very large, consider **`--max-stimulus-chars`** or per-source caps configurable via env (today: constants in `canonical_sources.py` / `brave_extract_context.py`).

## P2 — entity-service (sibling repo)

- [ ] **Regression pass:** With **`useTypeDbTypes`** and **`useGgGenericForUnknownCatalogLabels`**, contract tests green; **`gg-generic`** only on **`entities[].label`** for those paths (no legacy `generic:` prefix).
- [ ] **Docs:** Keep **entity-service** `README.md` / `USER_AND_AGENT_GUIDE` aligned with GrooveGraph mirror when the HTTP contract changes.

## P3 — Tests / CI / tech debt

- [ ] **pytest:** Add **`httpx.MockTransport`** (or VCR-style) tests for **`fetch_canonical_enrichment`** happy paths without network; keep workflow tests stubbing **`fetch_canonical_enrichment`** on **`search_workflow`** / **`analyze_workflow`** modules.
- [ ] **CI:** If the product owner turns on GitHub Actions, wire **`pytest -m "not entity_service"`** (or full suite with skips) per [`AGENTS.md`](../AGENTS.md).
- [ ] **Grep cleanup:** Legacy **`generic:`** string in client docs or scripts (both repos) — remove or document as historical only.

## Done recently (context only — do not redo)

- **entity-service:** **`gg-generic`** for TypeDB alignment; **`useGgGenericForUnknownCatalogLabels`**; GrooveGraph **`run_gg_search`** sets catalog fallback for extract.
- **GrooveGraph:** **`canonical_sources`**, **`stimulus_compose`**, explore gate **`insufficient_context`**, Brave **`prefix_needle`**, **`load_repo_dotenv`** inside enrichment, **`env_loader.discogs_token` / `groovegraph_http_user_agent`**, default **`--brave-count` 20**, larger extract caps.
- **Docs:** **`WEB_ENRICHMENT.md`**, **`WORKFLOWS.md`**, **`AGENT_ONBOARDING.md`**, **`v2-implementer-defaults.md`**, **`.env.example`**, **`cli/README.md`**, mirrored **`USER_AND_AGENT_GUIDE`** note.

---

## Quick verification commands

```bash
cd GrooveGraph/cli
uv sync --group dev
uv run pytest -q
uv run gg doctor
uv run gg analyze "Elvis Costello" --pretty
```

Inspect **`canonical_sources`**, **`extract`**, and **`stimulus`** in the JSON output.
