# GrooveGraph App Reset

This repo now includes an app-first monorepo scaffold alongside the legacy CLI.

## New entry points

- App backend: `npm run dev`
- Python extraction service: `python services/entity-service/app.py`
- Reset DB init: `cli\.venv\Scripts\python.exe services/graph-bridge/init_reset_db.py`

The app runs on `http://127.0.0.1:3100` by default.
The local extraction service runs on `http://127.0.0.1:8200` by default.

## What works now

- `POST /runs`
- `GET /runs/:run_id`
- `GET /runs/:run_id/graph`
- `GET /runs/:run_id/artifacts/:stage`
- `GET /health`
- D3 graph UI
- human-readable `ES Output` inspector panel
- observable run artifacts under `artifacts/runs/<run_id>/`

## Extraction status

The in-repo entity-service now returns broader graph-shaped output from the collected evidence bundle:

- entities
- relations
- properties

This extraction layer is broader than the current reset TypeDB persistence slice. The app can inspect the broader ES result now, while persistence remains intentionally narrower until the supported graph schema catches up.

## Current bridge status

The Python graph bridge now targets a dedicated reset TypeDB database using `GG_RESET_TYPEDB_DATABASE`.
Initialize that database before the first real run so the reset schema in `typedb/groovegraph-reset-schema.tql` is applied.
