# GrooveGraph

Greenfield **v2** application and tooling. This repository replaces [GrooveGraph-next](https://github.com/Studio13-NYC/GrooveGraph-next) over time; until cutover, treat that codebase as **read-only reference**, not a dependency you edit from here.

**New agent?** Open **[`AGENTS.md`](AGENTS.md)** — onboarding index, **coding and workflow rules**, and links to deeper docs (use as **Cursor / system context**). Then [docs/AGENT_ONBOARDING.md](docs/AGENT_ONBOARDING.md) for v1 remotes and **“Implementing v2 — first session”**.

## Product decisions and build defaults

- **[`docs/v2-product-qa-log.md`](docs/v2-product-qa-log.md)** — discovery **Q&A** (users, search, TypeDB, CLI, env, and so on).
- **[`docs/v2-implementer-defaults.md`](docs/v2-implementer-defaults.md)** — **canonical implementer defaults** (synthesized from Q&A + Q33 TypeQL layout) and the **first implementation slice** checklist.

Entity-service integration (including schema pipeline: raw → validate → formatted) is described in [`docs/USER_AND_AGENT_GUIDE.md`](docs/USER_AND_AGENT_GUIDE.md).

TypeQL layout and **manual apply** policy: [`typedb/README.md`](typedb/README.md). Copy [`.env.example`](.env.example) to `.env` (gitignored) for local keys.

## CLI (`gg`)

Python CLI and **`gg`** commands live under **[`cli/`](cli/README.md)** (`uv sync`, `gg doctor`, `gg schema`, pytest). **Release tag for this slice:** [`v0.0.3`](https://github.com/Studio13-NYC/GrooveGraph/releases/tag/v0.0.3) (after push).

## Read-only reference to v1 (GrooveGraph-next)

A **pinned tag** on the legacy repo marks the agreed v1 snapshot:

- **Repository:** `https://github.com/Studio13-NYC/GrooveGraph-next`
- **Tag:** `v1-reference-for-v2` (points at `main` at the time the tag was created)

### Git remote in this repo (already configured)

This clone includes a second remote so you can inspect v1 **without** copying it into the tree:

| Remote                 | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `origin`               | This repo (GrooveGraph)                      |
| `groovegraph-next-v1`  | Read-only fetch of legacy GrooveGraph-next   |

After `git fetch groovegraph-next-v1`, browse paths at that tag:

```bash
git fetch groovegraph-next-v1
git show groovegraph-next-v1/v1-reference-for-v2:README.md
git grep -n "session" groovegraph-next-v1/v1-reference-for-v2 -- product/src
```

Replace the path after the colon with any file path you need from the old layout (for example `product/app/main/page.tsx`).

### Local sibling clone (optional)

If you keep a working copy next to this repo (same parent folder), you can open both folders in the editor for full-text search and navigation:

- `../GrooveGraph-next` — legacy app (do not commit v2 work there)

### Multi-root workspace

Open `groovegraph-dev.code-workspace` in Cursor/VS Code to load **GrooveGraph** and **GrooveGraph-next** side by side. Use the v1 folder for reference only; all new work belongs in this repository.

## Conventions

- Prefer linking to the v1 tag or using `git show` over vendoring large copies of old code.
- When reusing an idea or algorithm, re-implement in this repo so ownership and licensing stay clear.
