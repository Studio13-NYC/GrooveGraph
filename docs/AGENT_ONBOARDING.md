# Agent onboarding — GrooveGraph v2

Use this file when you are **new to the project**. It answers: **what this is**, **what we are building now**, **how we work**, and **where to read next**. For day-one commands, see [`cli/README.md`](../cli/README.md) and [`WORKFLOWS.md`](WORKFLOWS.md).

**Taking over from a prior agent?** Read **[`NEXT_AGENT_TODO.md`](NEXT_AGENT_TODO.md)** first — prioritized checklist, open integrations, and verification steps.

---

## 1. What this project is

**GrooveGraph** (this repo) is the **greenfield v2** stack for a **music / catalog knowledge graph** and the tooling around it. All v2 product and CLI work ships here.

| Layer | Role |
|--------|------|
| **TypeDB** | System of record for **catalog-style entities** (names, MO-ish types, approval, ingestion provenance). Target: **TypeDB Cloud**; schema lives under **`typedb/`**. |
| **`gg` (Python CLI)** | Operator and agent interface: **readiness**, **search**, **explore**, **discovery NER**, **schema slice for extract**, **draft ingest**, **pending review**. Lives under **`cli/`**. JSON-first output for automation. |
| **entity-service (ES)** | **Stateless HTTP** service: **`POST /extract`**, optional **`POST /schema-pipeline/*`** when **its** process has TypeDB env. It does **not** own GrooveGraph’s persistence story. |
| **Brave** | First **web search** adapter: **SERP titles + snippets** merged into the extract stimulus (not full-page fetch). |
| **Canonical APIs (caller-side)** | **`gg`** calls **Wikipedia**, **MusicBrainz**, and **Discogs** (when token set) to build rich **`text`** for **`POST /extract`** before / alongside Brave. See [`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md). |

**Ontology direction:** **MO-first** (Music Ontology mindset) — see [`ontology/mo-coverage-matrix.md`](../ontology/mo-coverage-matrix.md) and TypeQL under **`typedb/`**. Your **live TypeDB** schema may differ from the repo file until operators **manually apply** updates ([`typedb/README.md`](../typedb/README.md)).

---

## 2. What we are working on (current slice)

The **canonical checklist** is [`GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md`](GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md) (§10). In plain terms, the active arc is:

1. **Reliable integrations** — `gg doctor` (TypeDB + required entity types + **`POST /schema-pipeline/formatted`** probe + ES liveness + Brave on explore), **`dual_typedb_env_suspected`** when GrooveGraph’s TypeDB lists catalog types but ES still returns an **empty** DB-backed **`knownEntities`** slice while **`entityTypes`** is populated (often **wrong ES `TYPEDB_*` database** or **no rows** yet for those types). Empty **both** arrays can also mean a **non-`gg` client** sent **`entityTypes: []`** to ES ([`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md)).
2. **Operator loop** — DB-first **`gg search`** (optional **`--extract`**), **`gg explore`** (doctor + TypeDB bootstrap + canonical + Brave + formatted + extract), **`gg analyze`** (canonical + optional Brave + **`/extract`**; no explore doctor gate).
3. **Extract stimulus** — **Wikipedia + MusicBrainz + Discogs** + **Brave**; optional **supplementary HTTP** (trafilatura) and **deep artist** (MB releases/recordings, Discogs profile) — all env/CLI in [`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md) and [`.env.example`](../.env.example).
4. **entity-service alignment** — **`gg-generic`** label and **`useGgGenericForUnknownCatalogLabels`** on **`/extract`** where applicable. **`TYPEDB_*` must be on the same OS process as the FastAPI server** (not only in GrooveGraph’s `.env`). Upstream: **entity-service** / [`Studio13/entity-service`](https://github.com/Studio13/entity-service).
5. **Schema path** — Default **`gg`** flows call **`POST /schema-pipeline/formatted`** only, with **catalog MO `entityTypes`** in **`assumptions`** so ES can sample **`knownEntities`**. **`/raw`** is for **testing / define inspection** (`gg schema raw`), not the main extract path.
6. **Draft persistence** — **`gg ingest-draft`**, **`gg explore --ingest`**, **`gg pending list`** (`approval-status`, `ingestion-batch`). Ingest **skips** rows whose **`(entity type, name)`** already exists in TypeDB; **`extract.body.entities`** can still list duplicate spans until merge logic grows (relationships / extra attributes).
7. **Deferred / follow-up** — **Playwright** (or similar) for JS-heavy pages remains out of the CLI; see Q&A log and [`NEXT_AGENT_TODO.md`](NEXT_AGENT_TODO.md). Stimulus caps, supplementary HTTP, and deep MB/Discogs are **documented in [`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md)**.

**Explicitly not assumed:** automatic `gg typedb apply` (manual apply policy), silent promotion of web results to trusted graph data. **CI:** [`.github/workflows/cli-pytest.yml`](../.github/workflows/cli-pytest.yml) runs **`pytest -m "not entity_service"`** by default; broader gates stay a product call ([`GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md`](GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md) §8).

---

## 3. How we work (process + code)

Align with **[`AGENTS.md`](../AGENTS.md)** — it is the **binding** agent index (non-negotiables, test markers, coding rules). Summary:

| Practice | Detail |
|----------|--------|
| **Repo boundary** | All **v2 implementation** in **GrooveGraph** on **`origin`**. entity-service is a **separate** repo; mirror docs only when the HTTP contract is shared. |
| **Secrets** | Never commit **`.env`**. Names only in [`.env.example`](../.env.example). |
| **Diffs** | **Small, purposeful** changes; match neighboring style; no drive-by refactors or deps without need. |
| **Python stack** | **`uv`**, **Typer**, **Pydantic**, **httpx**, **typedb-driver**, **`pytest`**. `requires-python >= 3.12` unless the repo changes it. |
| **Tests** | Under **`cli/tests/`**. Markers: **`core`**, **`entity_service`**, **`e2e`**, **`brave_only`**. Upstream ES/TypeDB gaps → **`skip`** + tags in punch list / [`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md), not fake “GrooveGraph green”. |
| **Test data in TypeDB** | Rows created by automation use **`approval_status`: `test`** ([`AGENTS.md`](../AGENTS.md)). |
| **Uncertainty** | After docs, if **product intent**, **schema safety**, **secrets**, or **compliance** is unclear → **stop and ask the human** with evidence ([`AGENTS.md`](../AGENTS.md)). |
| **Handoff** | Commit messages: **full sentences**, what changed and why. Update **`NEXT_AGENT_TODO.md`** when you finish or reprioritize a slice. |

**Workflow (repeatable):** orient (read order below) → small vertical slice → run targeted tests / `gg doctor` → commit. Prefer **`gg`** and JSON logs under **`logs/`** for dogfooding.

**Logs:** GrooveGraph CLI writes to **`logs/gg.log`** (and **`logs/pytest.log`** for tests). Tail these alongside the **entity-service terminal** when debugging HTTP (`/extract`, `/schema-pipeline/*`).

---

## 4. First session — read in this order

When you **implement or debug**, read **before** large changes:

1. **[`AGENTS.md`](../AGENTS.md)** — rules, read order pointer, non-negotiables.
2. **[`docs/README.md` (map)](README.md)** — active vs [`archive/`](archive/) material in **`docs/`**.
3. **[`WORKFLOWS.md`](WORKFLOWS.md)** — **who calls whom** (diagrams): TypeDB, ES, Brave, canonical APIs, `gg`.
4. **[`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md)** — **extract stimulus**: Wikipedia, MusicBrainz, Discogs, Brave; env vars; `insufficient_context`; JSON shape.
5. **[`NEXT_AGENT_TODO.md`](NEXT_AGENT_TODO.md)** — **prioritized handoff checklist** for the next implementer.
6. **[`GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md`](GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md)** — product **Q&A outcomes**, stack defaults, and **slice status**; do not contradict without a recorded decision (update the synthesis when you log one).
7. **[`USER_AND_AGENT_GUIDE.md`](USER_AND_AGENT_GUIDE.md)** — **entity-service** HTTP contract (`/extract`, `/schema-pipeline/*`).
8. **[`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md)** — if **`/extract`** or **`/formatted`** look empty or “wrong” (two TypeDB configs, symptoms, pytest tags).
9. **[`archive/ENTITY_SERVICE_PUNCH_LIST.md`](archive/ENTITY_SERVICE_PUNCH_LIST.md)** — **archived** upstream integration checklist (historical); tags live in **AGENT_ENTITY_SERVICE_ISSUES** §1.2.

**Hands-on setup:**

- **Secrets:** copy [`.env.example`](../.env.example) → **`.env`** at repo root (gitignored). For canonical enrichment set **`DISCOGS_TOKEN`** and a unique **`GROOVEGRAPH_HTTP_USER_AGENT`** (see [`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md) and [Discogs authentication](https://www.discogs.com/developers/page:authentication,header:authentication)).
- **TypeDB:** credentials per USER guide §7; **manual** apply of [`typedb/groovegraph-schema.tql`](../typedb/groovegraph-schema.tql) and incremental [`typedb/groovegraph-schema-add-gg-generic.tql`](../typedb/groovegraph-schema-add-gg-generic.tql) per [`typedb/README.md`](../typedb/README.md) (strip `//` comments if applying via programmatic `query()` — see TypeDB parser behavior).
- **entity-service:** run per upstream README; set **`NER_SERVICE_URL`** in GrooveGraph `.env`. For **local** runs with the **same** TypeDB as `gg`, start the API from your **entity-service** checkout with GrooveGraph’s env file so **`TYPEDB_*`** match, e.g. `uv run --env-file D:/path/to/GrooveGraph/.env fastapi dev app/main.py` (on Windows use **forward slashes** in `--env-file`). See entity-service **`README.md`** (run section) and **`docs/GROOVEGRAPH_TYPEDB_ON_ENTITY_SERVICE.md`** (why `gg` `.env` ≠ API process env).
- **CLI:** [`cli/README.md`](../cli/README.md) — `cd cli`, `uv sync`, `uv run gg --help`, `uv run gg doctor`.

---

## 5. Repo layout (where things live)

| Path | Purpose |
|------|---------|
| **`cli/`** | **`gg`** package, Typer entrypoint, **`cli/tests/`** pytest. |
| **`cli/src/groovegraph/canonical_sources.py`** | Wikipedia / MusicBrainz / Discogs fetch for extract stimulus. |
| **`cli/src/groovegraph/stimulus_compose.py`** | Merge canonical + Brave → one **`text`**. |
| **`cli/src/groovegraph/stimulus_assembly_options.py`** | Env defaults + CLI overrides for stimulus caps and flags. |
| **`cli/src/groovegraph/supplementary_http_text.py`** | Optional trafilatura merge for ranked URLs. |
| **`cli/src/groovegraph/doctor.py`** | Readiness: TypeDB, required entity types, ES **`/formatted`** probe, enrichment hints, Brave. |
| **`cli/src/groovegraph/entity_service_schema_probe.py`** | DB-backed **`formatted`** probe (used by doctor). |
| **`cli/src/groovegraph/schema_pipeline.py`** | **`POST /schema-pipeline/formatted`** (DB-backed assumptions: catalog **`entityTypes`**). |
| **`typedb/`** | Canonical **TypeQL** and apply policy. |
| **`ontology/`** | MO coverage matrix and pointers. |
| **`docs/`** | Product Q&A, workflows, ES guides, **`WEB_ENRICHMENT.md`**, **`NEXT_AGENT_TODO.md`**, agent issues; **[`README.md`](README.md)** indexes active vs **`archive/`**. |
| **`cli/src/groovegraph/draft_ingest.py`** | Draft catalog writes; **skips** existing **`(type, name)`** before insert. |
| **`ner-client/`** | Thin **TypeScript** types + `fetch` client for ES (optional callers). |
| **`logs/`** | Rotating **`gg.log`** / **`pytest.log`** (see [`logs/README.md`](../logs/README.md)). |
| **`groovegraph-dev.code-workspace`** | Optional VS Code / Cursor workspace file for this repo. |

---

## 6. Live end-to-end verification (operators + agents)

Use a **realistic prompt** and watch **both** `logs/gg.log` and the **entity-service** process stdout (request trace / uvicorn).

**Example prompt:** `Find all you can about elvis costello`

| Command | Doctor preflight? | What it proves |
|---------|-------------------|----------------|
| **`gg explore "<prompt>"`** | **Yes** — fails fast if `doctor.ok` is false. | Full operator path: Brave probe, TypeDB bootstrap option, search+extract. |
| **`gg analyze "<prompt>" --emit-stimulus`** | **No** | Canonical + Brave + **`POST /extract`** to **`NER_SERVICE_URL`** without explore gate. |
| **`gg search "<prompt>" --extract`** | **No** | TypeDB catalog search + Brave + canonical + **`formatted`** + **`/extract`**. |

**Common outcomes (Apr 2026 live run):**

1. **`explore` exits 2 at `doctor_failed`** — JSON may show **`entity_service_schema.dual_typedb_env_suspected`: true** when GrooveGraph’s TypeDB lists catalog types but **`POST …/schema-pipeline/formatted`** still returns an **empty `knownEntities`** slice (doctor also reports **`entity_types_count`** / **`known_entities_count`**). **Common fixes:** align **`TYPEDB_*`** on the **entity-service** process with **`gg`**’s database; seed catalog rows so ES can sample names; confirm **`gg`** is on a version that sends **non-empty `entityTypes`** on DB-backed `formatted` (see [`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md)). **`analyze`** / **`search --extract`** may still succeed past this gate; they are not substitutes for a green **`gg explore`** preflight.
2. **`/extract` returns 200 with `entities: []`** — pipeline ran; NER produced no spans (stimulus length, labels filter, schema slice, or model path). Compare **`canonical_sources`** and **`stimulus`** in JSON; see [`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md).
3. **Wikipedia `403`** on `action=query` — MediaWiki blocking or UA policy. Ensure a **unique** **`GROOVEGRAPH_HTTP_USER_AGENT`** with contact info; try a **shorter** needle for wiki-only debugging.

**Quick commands:**

```bash
cd cli
uv sync --group dev
uv run gg doctor --pretty
uv run gg explore "Find all you can about elvis costello" --pretty
uv run gg analyze "Find all you can about elvis costello" --emit-stimulus --pretty
uv run gg search "Find all you can about elvis costello" --extract --pretty
```

---

## 7. Operational handoff TODO

Operator acceptance and integration checks live in **[`NEXT_AGENT_TODO.md`](NEXT_AGENT_TODO.md)** (section **Operational — full `gg explore` pipeline** plus shipped P0–P3 history). Update that file when you close or reprioritize a row; avoid duplicating long checklists here.

---

## 8. Quick clone checklist (new machine)

```bash
git clone https://github.com/Studio13-NYC/GrooveGraph.git
cd GrooveGraph
```

Copy **`.env.example`** → **`.env`**, then `cd cli && uv sync && uv run gg doctor`.

---

## 9. When you are still stuck

1. Re-read [`GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md`](GROOVEGRAPH_V2_PRODUCT_AND_BUILD_SYNTHESIS.md).
2. For HTTP / ES behavior: [`USER_AND_AGENT_GUIDE.md`](USER_AND_AGENT_GUIDE.md) + [`AGENT_ENTITY_SERVICE_ISSUES.md`](AGENT_ENTITY_SERVICE_ISSUES.md).
3. For **`/extract`** stimulus assembly: [`WEB_ENRICHMENT.md`](WEB_ENRICHMENT.md).
4. For **explore vs doctor** failures: section **6** above + **`logs/gg.log`**.
5. If product or data-risk remains ambiguous, follow [`AGENTS.md`](../AGENTS.md): **ask the human** with a short evidence summary.
