# Agent onboarding — GrooveGraph v2 and GrooveGraph-next (v1 reference)

Use this document when you are new to the workspace and need to know how **GrooveGraph** (v2) relates to **GrooveGraph-next** (v1). All implementation work for the new product belongs in **GrooveGraph**; v1 is **read-only reference** unless explicitly asked to change that repo.

## Goal

Wire your **GrooveGraph** repo so **GrooveGraph-next** stays a **read-only reference** (remote + tag + docs + side-by-side workspace).

## What was set up

### GrooveGraph (new repo)

- Added remote **`groovegraph-next-v1`** → `https://github.com/Studio13-NYC/GrooveGraph-next.git` (canonical URL; GitHub previously redirected from `nickknyc`).
- Run **`git fetch groovegraph-next-v1`** so your clone has branches and tags from v1 locally.

### GrooveGraph-next (legacy)

- Created annotated tag **`v1-reference-for-v2`** on **`main`** at commit **`8b1128b`** (“session hygiene…” — last `main` before the in-repo `twodotzero/` scaffold).
- **`v1-reference-for-v2`** was pushed to GitHub.
- **`origin`** on active developer clones of GrooveGraph-next should point at **`https://github.com/Studio13-NYC/GrooveGraph-next.git`** (canonical). If you still see “repository moved” on push/fetch, run:

  ```bash
  cd /path/to/GrooveGraph-next
  git remote set-url origin https://github.com/Studio13-NYC/GrooveGraph-next.git
  ```

### GrooveGraph repository contents (reference)

- **`README.md`** — remotes, tag, `git show` / `git grep`, sibling clone, “reference only” rules, and links to **v2 product** docs.
- **[`docs/v2-product-qa-log.md`](v2-product-qa-log.md)** — discovery Q&A (permanent record).
- **[`docs/v2-implementer-defaults.md`](v2-implementer-defaults.md)** — canonical implementer defaults and first implementation slice.
- **[`docs/USER_AND_AGENT_GUIDE.md`](USER_AND_AGENT_GUIDE.md)** — entity-service API (including optional TypeDB schema pipeline); mirrored for GrooveGraph agents.
- **`ontology/`** — MO pointers and [`ontology/mo-coverage-matrix.md`](../ontology/mo-coverage-matrix.md) (coverage matrix stub).
- **`typedb/`** — canonical TypeQL and [`typedb/README.md`](../typedb/README.md) (manual apply policy).
- **`ner-client/`** — minimal TypeScript client types for `POST /extract` (optional for TS callers).
- **`groovegraph-dev.code-workspace`** — multi-root workspace: this repo + `../GrooveGraph-next`.
- Default branch **`main`** on `https://github.com/Studio13-NYC/GrooveGraph.git` holds the bootstrap commits.

## Prerequisites for side-by-side editing

You need:

1. A **GrooveGraph** clone (this repo).
2. A **GrooveGraph-next** clone in a **sibling directory** (same parent folder as GrooveGraph).

Example layout (adjust drive and parent folder for your machine). The workspace file expects **`../GrooveGraph-next`** relative to the GrooveGraph root.

| Repo             | Example path (Windows)                  |
| ---------------- | --------------------------------------- |
| GrooveGraph      | `D:\Studio13\Lab\Code\GrooveGraph`      |
| GrooveGraph-next | `D:\Studio13\Lab\Code\GrooveGraph-next` |

## How you use it day to day

### Normal work

Clone or open **GrooveGraph** only. Commit, branch, and open PRs only against **GrooveGraph** `origin` unless the task explicitly says to patch v1.

### Inspect v1 without copying files

From the **GrooveGraph** root:

```bash
git fetch groovegraph-next-v1
git show groovegraph-next-v1/v1-reference-for-v2:README.md
git grep -n "session" groovegraph-next-v1/v1-reference-for-v2 -- product/src
```

Replace the path after the colon (`README.md`, `product/src`, etc.) with any path that exists in v1 at that tag.

### Side-by-side in Cursor / VS Code

1. Ensure **GrooveGraph-next** exists next to **GrooveGraph** (see table above).
2. Open **`groovegraph-dev.code-workspace`** from the GrooveGraph root (File → Open Workspace from File…).
3. Treat the **GrooveGraph-next** folder as **read-only reference** for search and navigation; do not land v2 features or fixes there unless the product owner directs otherwise.

## Conventions (agents)

- Prefer **`git show`** / **`git grep`** on `groovegraph-next-v1/v1-reference-for-v2` over copying large trees into GrooveGraph.
- When reusing behavior from v1, **re-implement** in GrooveGraph so ownership and dependencies stay clear.
- Do not add GrooveGraph-next as a git submodule of GrooveGraph unless the team decides that explicitly.

## Quick clone checklist (new machine)

```bash
# Parent folder, e.g. ~/Code or D:\Studio13\Lab\Code
git clone https://github.com/Studio13-NYC/GrooveGraph.git
git clone https://github.com/Studio13-NYC/GrooveGraph-next.git
cd GrooveGraph
git remote -v
git fetch groovegraph-next-v1
```

Then open **`groovegraph-dev.code-workspace`** if you want both trees in one window.
