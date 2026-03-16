# Baseline Bundle (Curated from Generalized Intent)

This folder captures the reusable baseline guidance we want to keep from the old generalized templates, without restoring the full `Generalized/` tree.

Use this as a practical starter pack for:

- documentation structure and hygiene
- testing expectations
- TypeScript standards
- workflow rules that fit the fuzzy rebuild

## Included artifacts

- `BASELINE_DOC_STRUCTURE.md` - minimal docs taxonomy for this repo shape.
- `BASELINE_EXECUTION_MODEL.md` - how we run incremental slices in a clean-slate rebuild.

## Rule counterparts

Reusable baseline rules live in `.cursor/rules/`:

- `baseline-typescript-standards.mdc`
- `baseline-documentation-flow.mdc`
- `baseline-ui-workflow-validation.mdc`

These are intentionally short, compatible with the `frontend/backend/utilities` layout, and designed to layer with `architecture-fuzzy.mdc`.
