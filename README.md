# GrooveGraph

Greenfield **v2** application and tooling. This repository replaces [GrooveGraph-next](https://github.com/nickknyc/GrooveGraph-next) over time; until cutover, treat that codebase as **read-only reference**, not a dependency you edit from here.

## Read-only reference to v1 (GrooveGraph-next)

A **pinned tag** on the legacy repo marks the agreed v1 snapshot:

- **Repository:** `https://github.com/nickknyc/GrooveGraph-next`
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

Replace `product/README.md` with any path you need from the old layout.

### Local sibling clone (optional)

If you keep a working copy next to this repo (same parent folder), you can open both folders in the editor for full-text search and navigation:

- `../GrooveGraph-next` — legacy app (do not commit v2 work there)

### Multi-root workspace

Open `groovegraph-dev.code-workspace` in Cursor/VS Code to load **GrooveGraph** and **GrooveGraph-next** side by side. Use the v1 folder for reference only; all new work belongs in this repository.

## Conventions

- Prefer linking to the v1 tag or using `git show` over vendoring large copies of old code.
- When reusing an idea or algorithm, re-implement in this repo so ownership and licensing stay clear.
