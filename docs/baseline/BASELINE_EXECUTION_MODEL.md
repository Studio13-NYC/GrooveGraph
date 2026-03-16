# Baseline Execution Model

Use this model for clean-slate feature rebuilding:

1. Define the smallest user-visible slice.
2. Implement only the contracts needed for that slice.
3. Validate the slice from a UI/user path.
4. Capture logs and outcomes.
5. Move to the next slice.

## Current repository layout assumptions

- Frontend app and tests under `frontend/`.
- Backend runtime and core logic under `backend/`.
- Shared operational/provisioning scripts under `utilities/`.

## Practical operating rules

- Favor modular boundaries over global rewrites.
- Keep ontology-driven behavior centralized.
- Keep logging first-class and traceable across frontend -> API -> LLM -> Neo4j.
- Prefer deleting stale layers quickly in this branch instead of preserving compatibility shims.
