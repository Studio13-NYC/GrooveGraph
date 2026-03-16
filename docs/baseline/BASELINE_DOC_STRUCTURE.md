# Baseline Doc Structure

Recommended documentation structure for this repo:

- `docs/PRD_FUZZY.md` - product requirements for the new build.
- `docs/briefing.md` - high-level branch intent and implementation framing.
- `docs/ONTOLOGY.md` - ontology behavior and runtime usage.
- `docs/DEPLOY.md` - deployment runbook.
- `docs/UI_TESTING.md` - test execution references and workflow checks.
- `docs/RULES_AND_STANDARDS.md` - active rule catalog and coding norms.
- `docs/baseline/` - reusable baseline guidance (this folder).
- `docs/archive/` - historical/completed plans only.

## Keep docs healthy

- Update docs in the same change set as behavior changes.
- Prefer one canonical source per concern; avoid duplicate explanations.
- When replacing a process, remove stale docs instead of adding parallel instructions.
