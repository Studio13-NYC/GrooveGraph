# GrooveGraph v2 — product Q&A log

Permanent record of discovery questions and answers. Append new entries in chronological order.

---

## Baseline context (2026-04-15, from initial kickoff)

Agreed technical direction (not Q&A, for reference):

- **Storage:** TypeDB + TypeQL.
- **Type system foundation:** Music Ontology ([motools/musicontology](https://github.com/motools/musicontology)); see `ontology/ontology-location.mc`.
- **Entity extraction / resolution:** HTTP **entity-service** + TypeScript **`ner-client`** (`ner-client/`); Python service does not own the database.
- **Web data:** A capable scraping + preprocessing pipeline is required so inputs to extraction are cleaner than raw HTML.

---

## Q1 — Primary users and first end-to-end experience

**Question (2026-04-15):** Who is the primary user for v2 in the first few months (pick the closest fit, even if it’s a blend), and in one sentence what should they be able to do end-to-end without leaving the app?

**Answer (2026-04-15):**

- **Users:** Eventually anyone who comes to the site. Initially it is just the product owner working with the agent in chat, and possibly from the CLI.
- **What they do:** They search for information about musicians, albums, tracks, instruments, producers, studios, labels, equipment, etc.
- **Search behavior:** Search **first** hits the **database**, then the **web**. As new information is found, it is **added to the database**.
- **Goal:** Build a graph that encompasses everything and, most importantly, shows **how everything is interconnected**.
- **How we start dogfooding:** When ready, the product owner will ask the agent to search for something; the agent runs through the rest of the process, learns **patterns of use** and **desired outcomes**, and the system is enhanced from there.

---

## Q2 — Web-sourced data: write policy and lifecycle

**Question (2026-04-15):** When search goes to the **web** after the database, what should count as **“good enough” to write into TypeDB** on the first pass—e.g. **only after you explicitly confirm** in chat, **auto-ingest above a confidence threshold**, or **always draft + your approval** in a simple UI later?

**Answer (2026-04-15):**

- **Always draft + approval** in a simple UI (later).
- The instance should be **tagged as pending**.
- **Later:** a UI to **review the list** and run various **hygiene** operations.

---

## Q3 — Representing “pending” in TypeDB

**Question (2026-04-15):** For **“pending”** in TypeDB, do you want a **single shared attribute** (e.g. `approval-status` or `lifecycle-state` on everything we might ingest), a **dedicated relation** to a `provenance` / `ingestion-batch` entity, or **no preference yet** as long as queries can list “all pending drafts” in one place?

**Answer (2026-04-15):**

- **`approval-status`** (shared attribute).
- **Plus** provenance / **ingestion-batch** (not either-or; use both).

---

## Q4 — First web sources after a DB miss

**Question (2026-04-15):** For the **first** web pass after DB miss, which **sources** do you want in scope (pick any that apply, or name others): **Wikipedia**, **MusicBrainz / Cover Art Archive**, **Discogs**, **official artist / label sites**, **YouTube / Bandcamp descriptions**, **forums / Reddit**—and are any **explicitly out** for v1 (e.g. login-only, aggressive ToS)?

**Answer (2026-04-15):**

- **In scope:** Wikipedia; MusicBrainz / Cover Art Archive; Discogs; official artist / label sites; YouTube / Bandcamp descriptions; forums / Reddit — **all look good**.
- **Also:** a **simple web search** (general web), which may surface magazines and similar (e.g. *Guitar Player*).
- **Explicit exclusions for v1:** *Not specified in this answer.*

---

## Q5 — API vs HTML when both exist

**Question (2026-04-15):** When a source offers both an **API** and **HTML pages** (e.g. MusicBrainz, Discogs), should v2 **always prefer the API** for structured facts and use scraping/HTML mainly for **gap-filling and long-tail** (magazines, blogs, official sites), or do you want **HTML-first** anywhere for a specific reason?

**Answer (2026-04-15):**

- **Yes — prefer the API** for structured facts where available; use scraping/HTML for **gap-filling and long-tail**.
- **Note:** Wikipedia also has an **API** (use it where appropriate, alongside general web patterns).

---

## Q6 — First fetch layer: HTTP vs browser automation

**Question (2026-04-15):** For the **first** fetch layer, do you want to standardize on **HTTP + APIs + readability-style HTML extraction** only (faster, cheaper, simpler ops), or plan for **headless browser (e.g. Playwright)** from the start for sites that need JavaScript—**even if** we barely use it in v1?

**Answer (2026-04-15):**

- **Start with the simplest:** HTTP, APIs, and readability-style HTML extraction.
- **Leave the option open** to enhance later with **Playwright** (or similar) where needed.

---

## Q7 — Where fetch + normalize + draft writes run

**Question (2026-04-15):** Should **fetch + normalize + “draft pending” writes** live **inside the same v2 app** (e.g. Next server routes / server actions) for now, or do you want a **small separate worker/service** from day one so scraping and TypeDB writes are isolated from the web UI process?

**Discussion — implications (2026-04-15):**

| Topic | Same v2 app (e.g. Next server) | Separate worker/service |
|--------|-------------------------------|---------------------------|
| **Moving parts** | Fewer deployables; one repo/process model to start. | More deployables (app + worker); need queue or RPC, shared env/secrets. |
| **Timeouts & scale** | Serverless/route timeouts can cut off slow fetches or big TypeDB batches; concurrent user traffic shares CPU with ingest. | Worker can run **long jobs**, retries, backoff, rate limits **without** blocking UI requests. |
| **Failure blast radius** | A bad fetch or TypeDB spike can **degrade or crash** the same process handling search/UI. | UI stays responsive; ingest failures are **contained** and observable on the worker. |
| **Secrets & trust** | API keys for search/Discogs/MB live in the app env (familiar for solo dev). | Same, but boundary is explicit: only worker needs “dangerous” outbound + write credentials if you want least-privilege later. |
| **Dogfooding / CLI** | Easy: one codebase, call the same modules from API routes and a `tsx` script. | CLI and app both need a path to the worker (HTTP, queue, or shared package **imported** by CLI while worker runs separately). |
| **Evolution to Playwright** | Heavier browsers inside the web server process are **awkward** on many hosts (memory, cold start); often you defer or use an external browser service. | Natural home for **Playwright** later: dedicated container with Chrome, job queue, screenshots. |
| **Observability** | Logs mixed with page/API logs. | Per-service logs, metrics, dead-letter queue for failed ingests. |

**Answer (2026-04-15):**

- **Middle path:** one repo, **shared ingest library** (fetch / normalize / draft writes), wired into the **v2 app first** (e.g. Next server routes or a single Node process), with a **clean module boundary** so the same package can move behind a **dedicated worker** later without a rewrite.

---

## Q8 — “Simple web search” provider

**Question (2026-04-15):** For **“simple web search”** (surfacing magazines, blogs, etc.), do you already have a **preferred provider** (e.g. **Brave Search API**, **Bing**, **Google Custom Search**, **SerpAPI**, **SearXNG** self-hosted), or should v1 treat this as **pluggable** behind an interface with **one** concrete adapter you will supply API keys for?

**Answer (2026-04-15):**

- **Pluggable** behind an interface; v1 can ship with **one** concrete adapter.
- **Brave Search** is set up; API credentials are in **local** `.env` (not copied into this log).

---

## Q9 — TypeDB deployment for early v2

**Question (2026-04-15):** For **TypeDB in early v2**, is your default **local TypeDB** (Community Edition / Docker on your machine), **TypeDB Cloud**, or **both** (local for daily work, cloud for something shared later)?

**Answer (2026-04-15):**

- **TypeDB Cloud** is what the product owner wants.

---

## Q10 — Entity-service (NER) deployment for early v2

**Question (2026-04-15):** For **entity-service** (`POST /extract`), should v2 assume it runs **locally on your machine** during early dogfooding (same as `NER_SERVICE_URL` to `localhost`), or do you want a **hosted** NER endpoint soon as well?

**Answer (2026-04-15):**

- **Assume local** for the moment (e.g. `NER_SERVICE_URL` → localhost).
- **Migrate** to a hosted endpoint **once** requirements and ops are clearer.

---

## Q11 — MO-aligned TypeQL: relationship to GrooveGraph-next greenfield

**Question (2026-04-15):** For the **MO-aligned TypeQL schema**, should we **start from the existing greenfield vocabulary** in GrooveGraph-next (`groovegraph-mo-greenfield-schema.tql` as a reference) and **re-home + extend it in GrooveGraph**, or treat that file as **inspiration only** and **re-author** the schema in GrooveGraph from MO + your pending/provenance needs?

**Answer (2026-04-15):**

- **Inspiration only** — do not treat the v1 greenfield file as the source of truth to copy forward.
- Schema will be **figured out while digging into the ontology**; the old approach was **not** modeling MO correctly.

---

## Q12 — Grounding TypeDB in MO: working order

**Question (2026-04-15):** When we ground the new TypeDB model in the Music Ontology, should we work **MO-first** (curated subset of MO classes/relations in a matrix, then implement TypeQL to match), or **TypeQL-first** (model what the product needs, then attach MO IRIs for traceability where they fit)?

**Explanation (2026-04-15) — what the two phrases mean:**

- **MO-first:** You start from the **ontology as the boss**. You pick MO classes and properties (e.g. from the MO spec / docs), list what you will support, note gaps, **then** write TypeQL entities and relations so each piece **lines up with** an MO class or property (or you document a deliberate extension). Discovery is: “What does MO say music data is?”
- **TypeQL-first:** You start from **queries and UX** (“I need artists, releases, gear, and a way to link session musicians to studios”). You design TypeDB types that **work for the app**, then **map backward** to MO: add `mo-class-iri` / `mo-property-iri` literals, adjust names, or mark places where MO has no clean equivalent. Discovery is: “What does the product need?” then “How does MO label that?”

Neither skips MO; the difference is **which document leads** when two goals conflict (fidelity to MO vs speed of shipping graph features).

**Answer (2026-04-15):**

- **MO-first** — lead with a curated understanding of MO, then implement TypeQL to match.

---

## Q13 — MO-first: coverage matrix vs TypeQL timing

**Question (2026-04-15):** For the **MO-first** track, do you want the **first concrete deliverable** to be a **written coverage matrix** in-repo (MO class / property → “in MVP / later / out of scope” + notes), with **TypeQL only after** that is stable enough to review—or are you okay starting **TypeQL in parallel** as soon as the matrix is a rough first pass?

**Answer (2026-04-15):**

- **In parallel:** evolve the coverage matrix and TypeQL together; do not block TypeQL on a “finished” matrix.
- **Search / ingest path:** user does a search → system returns a **parsed** representation; parsing should follow an **MO-first** approach so **incoming data already has the right shape** relative to MO.
- **API — “return raw”:** need a **Return Raw** route that exposes **all raw data** so operators can **inspect payloads**, verify whether the **appropriate types** exist, **add missing types** if needed, then **request the formatted** representation.
- **Extraction / resolution service:** the service that drives ontology awareness for extraction is **driven by whatever types exist in the database**, so the vocabulary stays **up to date** with the live TypeDB schema (no manual drift).

---

## Q14 — “Return Raw” API: environments and access

**Question (2026-04-15):** Should the **Return Raw** API be **dev-only** (localhost / non-production), or **available in every environment** behind **strong auth** (e.g. admin-only token) so you can debug production safely?

**Answer (2026-04-15):**

- **In every environment** — not limited to dev.
- Access control is **already implemented in the service** that exposes this behavior; callers can **invoke that service** to verify the route or capability is present.

**Canonical reference (updated in entity-service docs, mirrored here):** [`USER_AND_AGENT_GUIDE.md`](USER_AND_AGENT_GUIDE.md) — optional TypeDB-backed **schema pipeline** on the Python server: **`POST /schema-pipeline/raw`** → **`/schema-pipeline/validate`** → **`/schema-pipeline/formatted`** (raw define text + samples, validate assumptions, then `{ entityTypes, knownEntities }` for **`POST /extract`**). See that guide for request/response detail.

---

## Q15 — First milestone: Next.js vs CLI-first

**Question (2026-04-15):** For the **first milestone** in GrooveGraph, do you want a **Next.js web app** in-repo from day one (even if the UI is minimal), or is **CLI + shared libraries + TypeDB Cloud** enough until the first browser UI slice?

**Answer (2026-04-15):**

- Prioritize a **CLI** in GrooveGraph so the **agent and operator** can run search / ingest / inspection flows **easily** from the terminal without depending on a browser shell.
- A **Next.js** (or other) web UI can follow; not required as the first surface.

---

## Q16 — CLI implementation language

**Question (2026-04-15):** Should the GrooveGraph **CLI** be **TypeScript** (Node, `@typedb/driver-http`, `fetch` to entity-service + Brave), **Python**, or **no preference** as long as it is one primary stack you can run with a single command?

**Answer (2026-04-15):**

- **Python** is fine (and preferred here): use **Pydantic** for request/response models and validation on the CLI side.

---

## Q17 — Python CLI location in the GrooveGraph repo

**Question (2026-04-15):** For repo layout, should the Python CLI be **`cli/` at the GrooveGraph root** with its own **`pyproject.toml`**, or under **`python/cli/`** (or another name) so we can add more Python packages later without crowding the root?

**Answer (2026-04-15):**

- **`cli/` at the repository root** (with its own `pyproject.toml`).

---

## Q18 — Python toolchain for `cli/`

**Question (2026-04-15):** For the root **`cli/`** package, do you want **`uv`** as the standard runner (`uv run …`), classic **`pip` + `venv`**, or **Poetry**?

**Answer (2026-04-15):**

- **`uv` always** — standardize on `uv` for the CLI (and Python tooling in this repo unless something else is agreed later).

---

## Q19 — Loading environment variables for the CLI

**Question (2026-04-15):** Should the **`cli/`** tool **auto-load** the GrooveGraph repo-root **`.env`** (so `TYPEDB_*`, Brave, `NER_SERVICE_URL`, etc. work without exporting vars manually), using something like **`python-dotenv`** or **`uv run` with `--env-file`**—or do you prefer **explicit** `--env-file path` on every run?

**Answer (2026-04-15):**

- **Auto-load** repo-root `.env` by default so variables do not need manual export.
- Use **`python-dotenv`** (or equivalent) inside the CLI entrypoint.

---

## Q20 — TypeDB access from the Python CLI

**Question (2026-04-15):** For **direct TypeDB Cloud access** from the root **`cli/`** (queries, inserts, schema apply), should we add the **official TypeDB Python HTTP client** as a first-class dependency, or keep the CLI **HTTP-only to entity-service + Brave** until the MO-first TypeQL schema is drafted?

**Answer (2026-04-15):**

- Add the **official TypeDB Python HTTP client** as a **first-class dependency** of `cli/` (alongside calls to entity-service, Brave, etc., as needed).

---

## Q21 — CLI console script name

**Question (2026-04-15):** What should the **installed CLI command name** be (for `uv run` / `[project.scripts]`): **`groovegraph`**, **`gg`**, **`groove`**, or **no console script** for now (only `uv run python -m …`)?

**Answer (2026-04-15):**

- **`gg`** — the console entry point should be invocable as `gg` (via `uv run gg …` or an installed script, depending on packaging).

---

## Q22 — `.env` vs committed examples; cloud secrets

**Question (2026-04-15):** Should we treat **`.env` as git-ignored** and commit a **`.env.example`** at the repo root listing **variable names only** (no secrets), as the standard for GrooveGraph + `cli/`?

**Answer (2026-04-15):**

- **Yes:** keep **`.env` out of git**; maintain **`.env.example`** at the repo root with **names and placeholders only**.
- **Cloud / non-local runs:** inject configuration via the **Azure** environment (e.g. App Service / container host environment variables), not by copying `.env` into the image or repo.

---

## Q23 — Tests for `cli/` from the start

**Question (2026-04-15):** Should **`cli/`** include **`pytest` + a minimal smoke suite** from the first PR (e.g. “loads `.env.example` keys”, “mocked Brave response parses”), or **defer tests** until the first real command is implemented?

**Answer (2026-04-15):**

- **Yes** — include **pytest** and a **minimal smoke suite** from the first meaningful `cli/` change.

---

## Q24 — GitHub Actions CI for `cli/`

**Question (2026-04-15):** Should we add **GitHub Actions** now to run **`uv sync` + `pytest`** on every **push / PR** (Linux job), or keep CI **out** until the repo is wired to GitHub the way you want?

**Answer (2026-04-15):**

- **Keep CI out** until the project is ready to wire continuous integration (timing TBD).

---

## Q25 — Python version for `cli/`

**Question (2026-04-15):** Which **Python version** should `cli/` target as the minimum (**3.11**, **3.12**, or **3.13**)?

**Answer (2026-04-15):**

- **No preference** from the product owner; pick a **single supported modern** `requires-python` when scaffolding (e.g. **3.12+**), document it in `cli/pyproject.toml`, and align `uv` / local dev to that pin.

---

## Q26 — CLI framework (`gg` UX)

**Question (2026-04-15):** For the **`gg`** CLI UX (subcommands, `--help`), do you want **Typer**, **Click**, or **stdlib `argparse`** only (fewer dependencies)?

**Explanation (2026-04-15):** Those names are **libraries for building CLIs**. `argparse` is built into Python but verbose. **Click** and **Typer** (Typer is built on Click) give subcommands and help text with less boilerplate.

**Answer (2026-04-15):**

- Product owner defers the library choice; requirement is **simple and ergonomic**.
- **Default choice for implementers:** **Typer** — small dependency surface, typed command functions, excellent `--help` and subcommand structure with little code.

---

## Q27 — First real `gg` subcommand after scaffolding

**Question (2026-04-15):** What should the **first real `gg` subcommand** be after scaffolding: **`gg search …`** (DB then web), **`gg typedb ping`**, **`gg schema raw`** (call entity-service `/schema-pipeline/raw`), or something else you name?

**Answer (2026-04-15):**

- Product owner asked the implementer to choose.
- **Chosen default:** **`gg doctor`** (optional alias `gg status` later) — **read-only** readiness: load `.env`, verify **TypeDB Cloud** connectivity (minimal driver/HTTP check), **`GET /health`** on **entity-service**, and report whether **Brave** (and other) env vars are **present** (without necessarily calling paid APIs). Rationale: one ergonomic command for the agent/operator before building **`gg search`** and ingest flows.

---

## Q28 — `gg doctor` and Brave: env-only vs live probe

**Question (2026-04-15):** For **`gg doctor`**, should a **Brave** check mean **only “API key variable is set”**, or should **`doctor --probe`** (opt-in) run a **single real Brave Search request** so you know quotas and networking work?

**Answer (2026-04-15):**

- **Both:** default **`gg doctor`** should verify the **Brave credential is configured** (and other static checks) **without** burning quota.
- Add an **opt-in one-shot live probe** (e.g. **`gg doctor --probe`** or a dedicated smoke flag) that performs a **single real Brave Search request** for **smoke testing** and connectivity/quota validation.

---

## Q29 — Default output format for `gg`

**Question (2026-04-15):** For **`gg`** command output, should the **default** be **human-readable** text (tables/labels) with **`--json`** for scripts, or **JSON by default** (better for agents) with **`--pretty`** for humans?

**Answer (2026-04-15):**

- **JSON by default** (optimized for agents and piping).
- **`--pretty`** (or equivalent) for **human-readable** formatted output.

---

## Q30 — MO-first coverage matrix: file location

**Question (2026-04-15):** Where should the **MO-first coverage matrix** (classes / properties → MVP / later / out) live: **`docs/`** (e.g. `docs/mo-coverage-matrix.md`) or **`ontology/`** next to `ontology-location.mc`?

**Answer (2026-04-15):**

- Under **`ontology/`** (same area as `ontology-location.mc`). Exact filename can follow a clear convention when created (e.g. `ontology/mo-coverage-matrix.md`).

---

## Q31 — Canonical TypeQL on disk

**Question (2026-04-15):** For **TypeQL that will be applied to TypeDB Cloud**, should the canonical `.tql` file(s) live under **`ontology/`** (next to the MO matrix), under **`cli/`** (co-located with apply scripts), or a dedicated **`typedb/`** or **`schema/`** folder at the repo root?

**Answer (2026-04-15):**

- **`typedb/`** at the **repository root** — canonical `.tql` (and related TypeDB artifacts) live there.

---

## Q32 — Applying TypeQL: `gg` vs manual

**Question (2026-04-15):** Should **`gg typedb apply`** (or similar) become the **supported** way to push `typedb/*.tql` to **TypeDB Cloud**, or do you want **manual** apply only at first (documented `uv run` one-liner) and add **`gg`** integration **after** the schema stabilizes?

**Answer (2026-04-15):**

- Choose the **more conservative** path that **preserves room for enhancements**.
- **Interpretation:** start with **documented manual apply** (explicit `uv run` / driver one-liner or small script) so schema changes stay **deliberate**; add **`gg typedb apply`** (or migrations) **once** the MO-first schema and review process are stable enough to automate safely.

---

## Q33 — `typedb/` layout: single file vs numbered migrations

**Question (2026-04-15):** Inside **`typedb/`**, should we start with **one** canonical schema file (e.g. `groovegraph-schema.tql`) and split later, or adopt **numbered migration** files from day one (`001_…`, `002_…`)?

**Answer (2026-04-15):**

- **Product owner:** deferred to implementer judgment (“enough info”; trust defaults).
- **Chosen default:** start with **one canonical** `.tql` under `typedb/` (e.g. `typedb/groovegraph-schema.tql`). Move to **numbered migrations** (or split files + ordered apply) only when **incremental change** and **review** make a single file unwieldy—consistent with **conservative** schema apply (Q32) and room for **`gg typedb apply`** later.

---

## Synthesized defaults (implementer judgment, 2026-04-15)

**Canonical document:** [`v2-implementer-defaults.md`](v2-implementer-defaults.md) — full table, Q33 decision text, and **first implementation slice** checklist. Update that file when defaults change; this log keeps a **pointer** so the Q&A record stays the narrative source of truth.

---

## End of round 1 (2026-04-15)

Discovery Q&A through **Q33** plus implementer defaults (documented separately). Next work: see **“First implementation slice”** in [`v2-implementer-defaults.md`](v2-implementer-defaults.md).
