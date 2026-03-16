# Subagent Assignments

This document tracks active responsibilities for project subagents.

## Frontend subagent (`.cursor/agents/frontend.md`)

Primary objective:
- Deliver an ontology-driven query-builder UI that talks to live backend APIs.

Assigned tasks:
1. Create row-based query composition flow in `frontend/app/`.
2. Wire form state to backend API contracts (no local-only fake data path).
3. Add human-readable query summary + Cypher preview panel.
4. Validate complete user flow in browser/Playwright against live backend.

Quality gate:
- No mocks for completion testing.
- UI is only considered done when a live end-to-end workflow passes.

## Backend subagent (`.cursor/agents/backend.md`)

Primary objective:
- Build fuzzy-first backend foundations with headless live validation.

Assigned tasks:
1. Keep ontology runtime-driven from `data/ontology/schema.json`.
2. Implement headless query-builder core in `backend/src/`.
3. Build fuzzy orchestration loop: pre-run insights -> strategy -> execution -> post-run analysis.
4. Emit structured logs and trace IDs across API, LLM, and Neo4j paths.

Quality gate:
- No mock-only validation.
- Backend changes must be validated headlessly with real Neo4j and live configured model provider.
