# GrooveGraph Reset App

This is the active app-first reset surface for GrooveGraph.

It replaces the earlier exploratory reset pipeline with one **single, human-steered path**:

1. `plan`
2. `evidence`
3. `extract`
4. `persistence proposal`
5. `commit`

Every stage is visible and requires approval before the next stage runs.

## Entry points

- App backend/UI: `npm start`
- Entity-service: `python services/entity-service/app.py`
- Reset DB init: `cli\.venv\Scripts\python.exe services/graph-bridge/init_reset_db.py`

Default local URLs:

- App: `http://127.0.0.1:3100`
- Entity-service: `http://127.0.0.1:8200`

## What the reset app does

- reads graph context from the reset TypeDB database
- plans source-specific lookups
- collects evidence from Wikipedia, MusicBrainz, Discogs, and browser-rendered web pages
- runs a real spaCy-based extraction pass using the installed English model
- shows entities, relations, and properties for operator review
- proposes a draft persistence batch
- writes only approved connected draft graph data

## What it explicitly does not do

- no hidden autonomous end-to-end run
- no heuristic fragment entity creation
- no Brave-snippet extraction
- no legacy CLI-style orchestration flags
- no multiple pipeline variants

## Core docs

- Reset onboarding: `docs/RESET_AGENT_ONBOARDING.md`
- Reset schema: `typedb/groovegraph-reset-schema.tql`
