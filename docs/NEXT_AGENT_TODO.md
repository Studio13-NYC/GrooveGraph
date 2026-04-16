# Next agent — TODO (handoff checklist)

Work from **top to bottom** unless product reorders. Check boxes in your own notes or commits; keep this file honest when a row ships.

**Shipped slices** (sections P0–P3 below) are marked done in code/docs. **Remaining** for a real operator run is usually the **operational** checklist in [§ Full-stack `gg explore` acceptance](#operational--full-gg-explore-pipeline) — especially **`gg explore`**, which exits early when **`gg doctor`** is not OK (stricter than **`gg analyze`** / **`gg search --extract`**, which may still call **`/extract`**).

---

## Operational — full `gg explore` pipeline

**Goal:** A full-stack run end to end. **`gg explore`** is the strictest path because it refuses to continue when **`gg doctor`** is not OK.

**Pipeline read:** (1) and (2) are the structural steps toward a successful full explore pipeline; (3) proves it; (4) improves extract quality when Wikipedia matters; (5) supports shipping those fixes (evidence, not runtime).

- [ ] **(1) entity-service + TypeDB (same DB as `gg`).** Run **entity-service** with **`TYPEDB_*`** targeting the **same** catalog database **`gg`** uses (see [`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md); in the **entity-service** repo, **`docs/GROOVEGRAPH_TYPEDB_ON_ENTITY_SERVICE.md`**). **Fixes:** doctor stops flagging **`dual_typedb_env_suspected`**; **`POST /schema-pipeline/formatted`** can return a slice that matches the TypeDB **`gg`** uses. **Closer to full run:** yes — main **gate** for **`gg explore`**. Without it, explore often never reaches the rest of the pipeline even though analyze/search might still hit **`/extract`**.

- [ ] **(2) Empty `formatted` slice (investigate on entity-service).** When the type-schema path works on ES but **`entityTypes` / `knownEntities`** stay empty, triage in **entity-service** (schema pipeline, ER assumptions). **Fixes:** non-empty formatted slice so **`search --extract`** / explore get real schema-driven context. **Closer to full run:** yes for anything that depends on **`formatted`**; it does not by itself guarantee non-empty **`/extract`** `entities`, but it removes a silent “wrong slice” failure mode.

- [ ] **(3) `gg explore` E2E after doctor is green.** Re-run explore (e.g. a realistic prompt from [`AGENT_ONBOARDING.md`](AGENT_ONBOARDING.md)); confirm final JSON **`ok`: true** and inspect **`extract.body.entities`**. **Closer to full run:** yes — acceptance that (1) and (2) bought a full run, not only an isolated green doctor.

- [ ] **(4) Wikipedia 403.** Reproduce (e.g. long query string), fix **UA** / policy / shorter needles per [`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md); document troubleshooting if needed. **Closer to full run:** sometimes — explore can still succeed if MusicBrainz / Discogs / Brave carry the stimulus; fixing 403 improves canonical text for **`/extract`** when Wikipedia matters.

- [ ] **(5) Log discipline.** For the next debugging cycle: attach **`logs/gg.log`** excerpts (timestamps + stage) and matching **entity-service** lines for **`/extract`** and **`/schema-pipeline/formatted`**. **Closer to full run:** indirect — better evidence → faster fixes on (1)–(4).

---

## P0 — Operator / integration health

- [x] **TypeDB + `gg-generic`:** On every live DB used for explore/search, confirm **`entity gg-generic`** exists (apply [`typedb/groovegraph-schema-add-gg-generic.tql`](../typedb/groovegraph-schema-add-gg-generic.tql) or full [`typedb/groovegraph-schema.tql`](../typedb/groovegraph-schema.tql); strip leading `//` lines if your apply path rejects comments). — **`gg doctor`** now checks configurable required define labels (default **`gg-generic`**) via `GROOVEGRAPH_REQUIRED_TYPEDB_ENTITY_TYPES`.
- [x] **Dual TypeDB env:** Confirm **entity-service** process **`TYPEDB_*`** targets the **same** database as **`gg`** so **`POST /schema-pipeline/formatted`** returns non-empty **`knownEntities`** when data exists ([`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md)). — **`gg doctor`** runs the same DB-backed **`formatted`** probe and sets **`dual_typedb_env_suspected`** when GrooveGraph TypeDB lists catalog types but the slice is empty.
- [x] **`.env` for enrichment:** Repo-root **`DISCOGS_TOKEN`** + unique **`GROOVEGRAPH_HTTP_USER_AGENT`** set; run **`gg analyze "Known Artist"`** and verify JSON **`canonical_sources`** has non-empty **`discogs`** / **`wikipedia`** / **`musicbrainz`** where expected ([`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md)). — **`gg doctor`** emits **`canonical_enrichment`** + non-fatal **`warnings`** when token/UA are missing.

## P1 — Product slice (web → graph, APIs first)

- [x] **URL fetch / readability:** Implement optional **`GET`** of selected URLs (from Brave results or canonical links), main-text extraction (readability-style), merge into stimulus **behind** a flag or subcommand — per [`GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md`](GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md) §4 (HTTP + APIs first; no Brave page API). — **`GROOVEGRAPH_SUPPLEMENTARY_HTTP_FETCH`** + CLI **`--fetch-supplementary-pages`** (trafilatura); JSON **`supplementary_http`** on search/extract and analyze.
- [x] **Deeper MusicBrainz / Discogs:** After artist match, optional **release/recording** fetch and short text blocks; keep rate limits and caps ([`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md) “Future”). — **`GROOVEGRAPH_CANONICAL_DEEP_ARTIST`** + **`GROOVEGRAPH_MB_DEEP_RELEASE_CAP`** + CLI **`--deep-artist-context`**.
- [x] **Explore / search UX:** If stimulus grows very large, consider **`--max-stimulus-chars`** or per-source caps configurable via env (today: constants in `canonical_sources.py` / `brave_extract_context.py`). — **`GROOVEGRAPH_STIMULUS_MAX_CHARS`**, **`GROOVEGRAPH_WIKIPEDIA_SECTION_MAX_CHARS`**, **`GROOVEGRAPH_BRAVE_EMBED_MAX_CHARS`**, CLI **`--max-stimulus-chars`** on search/explore/analyze.

## P2 — entity-service (sibling repo)

- [x] **Regression pass:** With **`useTypeDbTypes`** and **`useGgGenericForUnknownCatalogLabels`**, contract tests green; **`gg-generic`** only on **`entities[].label`** for those paths (no legacy `generic:` prefix). — `uv run pytest` (73 tests) on sibling repo; contract tests unchanged.
- [x] **Docs:** Keep **entity-service** `README.md` / `USER_AND_AGENT_GUIDE` aligned with GrooveGraph mirror when the HTTP contract changes. — No HTTP contract change this slice; GrooveGraph **`.env.example`** documents operator env for stimulus/schema checks.

## P3 — Tests / CI / tech debt

- [x] **pytest:** Add **`httpx.MockTransport`** (or VCR-style) tests for **`fetch_canonical_enrichment`** happy paths without network; keep workflow tests stubbing **`fetch_canonical_enrichment`** on **`search_workflow`** / **`analyze_workflow`** modules. — Added [`cli/tests/test_canonical_sources_mocktransport.py`](../cli/tests/test_canonical_sources_mocktransport.py); stubs accept `**kwargs`.
- [x] **CI:** If the product owner turns on GitHub Actions, wire **`pytest -m "not entity_service"`** (or full suite with skips) per [`AGENTS.md`](../AGENTS.md). — Added [`.github/workflows/cli-pytest.yml`](../.github/workflows/cli-pytest.yml) (`pytest -m "not entity_service"`).
- [x] **Grep cleanup:** Legacy **`generic:`** string in client docs or scripts (both repos) — remove or document as historical only. — No substantive `generic:` prefix usage in code paths (only doc mentions / false positives); contract tests already assert **`gg-generic`**.

## Done recently (context only — do not redo)

- **entity-service:** **`gg-generic`** for TypeDB alignment; **`useGgGenericForUnknownCatalogLabels`**; GrooveGraph **`run_gg_search`** sets catalog fallback for extract.
- **GrooveGraph:** **`canonical_sources`**, **`stimulus_compose`**, explore gate **`insufficient_context`**, Brave **`prefix_needle`**, **`load_repo_dotenv`** inside enrichment, **`env_loader.discogs_token` / `groovegraph_http_user_agent`**, default **`--brave-count` 20**, larger extract caps.
- **Docs:** **`WEB_ENRICHMENT.md`**, **`WORKFLOWS.md`**, **`AGENT_ONBOARDING.md`**, **`GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md`**, **`.env.example`**, **`cli/README.md`**, mirrored **`USER_AND_AGENT_GUIDE`** note.

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
