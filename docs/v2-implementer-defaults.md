# GrooveGraph v2 — implementer defaults

**Status:** Product-approved defaults (2026-04-15). They extend the full Q&A record in [`v2-product-qa-log.md`](v2-product-qa-log.md); if this file and the log ever disagree, **reconcile** and update both.

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
| **`gg` after `doctor`** | Add **entity-service schema pipeline** commands next (e.g. **`gg er raw`**, then validate/formatted wrappers)—aligns with Q13–Q14 and [`USER_AND_AGENT_GUIDE.md`](USER_AND_AGENT_GUIDE.md). Add **`gg search`** once DB-first + MO-shaped ingest exists. |
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

1. **`.gitignore`** — ignore `.env`; add **`.env.example`** at repo root (names + placeholders only).
2. **`typedb/`** — add `groovegraph-schema.tql` (empty or minimal stub until MO matrix drives content) and **`typedb/README.md`** for manual apply.
3. **`ontology/mo-coverage-matrix.md`** — stub or first rows for MO-first coverage (Q30).
4. **`cli/`** — `pyproject.toml` (`uv`, Typer, Pydantic, python-dotenv, httpx, official TypeDB Python HTTP client, pytest), package layout, console script **`gg`**.
5. **`gg doctor`** — JSON default, `--pretty`, Brave env check + **`--probe`** one-shot (Q27–Q28).

CI (GitHub Actions) stays **out** until explicitly requested (Q24).
