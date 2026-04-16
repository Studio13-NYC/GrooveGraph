> **Archived snapshot.** Active canonical doc: **[`../GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md`](../GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md)**. Verbatim Q&A: **[`v2-product-qa-log.md`](v2-product-qa-log.md)** (this folder).

# GrooveGraph v2 — implementer defaults

**Release:** **`v0.0.4` (rolling)** — **`cli/`** + **`gg`**: doctor, search/explore/analyze, DB-backed **`formatted`** assumptions, draft ingest with **duplicate-name skip**, optional CI workflow for default pytest.

**Status:** Product-approved defaults (2026-04-16). They extend the full Q&A record in [`v2-product-qa-log.md`](v2-product-qa-log.md) (archived); if this file and the log ever disagree, **reconcile** in the synthesis doc above.

**Purpose:** One place for builders (humans and agents) to read **concrete choices** that were either answered explicitly in discovery or inferred conservatively from those answers.

---

## Q33 — TypeQL files under `typedb/` (single file vs migrations)

**Question:** Start with one canonical `.tql` or numbered migrations from day one?

**Decision:**

- Start with **one canonical** schema file under `typedb/` (e.g. `typedb/groovegraph-schema.tql`).
- Introduce **numbered migrations** (or split files + ordered apply) only when incremental change and review make a single file unwieldy.
- Rationale: matches **conservative** manual schema apply (see Q32 in the Q&A log) and leaves room for **`gg typedb apply`** later.

---

## Synthesized defaults (implementer judgment)

These items were **not** each asked as a separate discovery question; they follow from logged answers and conservative defaults. **Change here and in the Q&A log** if the product owner revises direction.

| Topic | Default |
|--------|---------|
| **Future `gg` work** | **`gg search`** (DB then web) once MO-shaped ingest exists; later **`gg typedb apply`** when schema automation is justified (Q32). |
| **HTTP client in `cli/`** | **`httpx`** for Brave, entity-service, and other REST calls. |
| **`requires-python`** | **`>=3.12`** in `cli/pyproject.toml` until a reason appears to widen or narrow. |
| **Manual schema apply** | Document in **`typedb/README.md`** (and link from root `README.md`): env vars, **empty database** expectation, and that apply is **deliberate** until automation lands. |
| **Lint / format (Python)** | Add **`ruff`** when the `cli/` package grows enough to justify it; not required on day zero. |
| **Ingest library boundary** | Keep **`cli/`** thin: shared **pure modules** (e.g. under `cli/src/groovegraph/` or a future `packages/` tree) if logic outgrows commands—matches the **middle path** (Q7) for a future worker. |
| **Pending + provenance in TypeQL** | When drafting schema, add **`approval-status`** and **`ingestion-batch`** (or equivalent names from MO matrix review) in the same MO-first pass—per Q2–Q3. |
| **stderr** | Keep **stdout JSON-only** for machine default; human-friendly output via **`--pretty`**; optional **structured errors** on stderr later if needed. |

---

## First implementation slice (round 1)

In order of dependency:

| Step | Status | Notes |
|------|--------|--------|
| 1. **`.gitignore` + `.env.example`** | **Done** | Repo root; `.env` gitignored. |
| 2. **`typedb/`** + **`typedb/README.md`** | **Done** | `groovegraph-schema.tql` is a first MO-aligned catalog slice (manual apply still required). |
| 3. **`ontology/mo-coverage-matrix.md`** | **Done** | MVP rows filled; evolve in parallel with TypeQL. |
| 4. **`cli/`** package + **`gg` entry** | **Done** | `pyproject.toml`: `uv`, Typer, Pydantic, python-dotenv, httpx, official TypeDB Python driver, pytest; console script **`gg`**. |
| 5. **`gg doctor`** | **Done** | JSON default, `--pretty`; TypeDB via **`type_schema()`** + type list; entity-service **GET `/health`** (fallback **`/ready`**, **`/docs`**); one Brave search when **`BRAVE_API_KEY`** is set (429 treated as reachable); **`--probe`** fails Brave block if the key is missing. |
| 6. **`gg schema *` (entity-service pipeline)** | **Done** | `gg schema run` uses **`POST /schema-pipeline/formatted`** only (DB-backed); `raw|validate|formatted` for testing / stdin pipes per [`USER_AND_AGENT_GUIDE.md`](USER_AND_AGENT_GUIDE.md). |
| 7. **Catalog operator loop (post-`v0.0.3`)** | **Done (slice)** | **`gg search`**, **`gg analyze`**, **`gg extract`**, **`gg ingest-draft`**, **`gg pending list`**, **`gg explore --ingest`**. **Canonical API enrichment** (Wikipedia + MusicBrainz + Discogs → `/extract` `text`), optional **supplementary HTTP** and **deep artist** context, and **DB-backed `formatted`** assumptions (catalog **`entityTypes`**) are **done** — see [`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md), [`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md). **Next:** richer MO relations, **`gg typedb apply`** once schema automation is justified (Q32), heavier browser automation (deferred in Q&A). |

**CI:** [`.github/workflows/cli-pytest.yml`](../.github/workflows/cli-pytest.yml) runs **`pytest -m "not entity_service"`** for a default PR signal. Broader CI (full markers, secrets) remains a product decision (Q24); reconcile with [`NEXT_AGENT_TODO.md`](NEXT_AGENT_TODO.md) when expanding.
