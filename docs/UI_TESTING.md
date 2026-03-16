# UI testing

GrooveGraph uses **Playwright** for end-to-end UI tests. Tests run against local and deployed environments.

## Quick reference

| Target | Command |
|--------|--------|
| Local (dev server on 3000) | `npx playwright test -c frontend/playwright.config.ts` |
| Deployed (groovegraph.s13.nyc) | `$env:PLAYWRIGHT_BASE_URL = "https://groovegraph.s13.nyc"; npx playwright test -c frontend/playwright.config.ts --project=deployed` |
| Single spec (deployed) | `$env:PLAYWRIGHT_BASE_URL = "https://groovegraph.s13.nyc"; npx playwright test -c frontend/playwright.config.ts frontend/tests/e2e/login-and-graph.spec.ts --project=deployed` |

## Setup

- **Playwright** is a dev dependency (`@playwright/test`). Browsers are installed with `npx playwright install` (or on first run).
- Config: `frontend/playwright.config.ts`. Base URL is `http://localhost:3000` by default; override with `PLAYWRIGHT_BASE_URL` for deployed runs.
- Projects: **local** (starts/reuses dev server) and **deployed** (no server; uses `https://groovegraph.s13.nyc`).

## When to run which

- **After local UI changes:** `npx playwright test -c frontend/playwright.config.ts` (local project).
- **After deployment or CORS/API changes:** Always run the **deployed** project; local tests can miss cross-origin or credentials issues.
- **New workflows:** Add specs under `frontend/tests/e2e/*.spec.ts` and run both local and deployed.

## Current specs

- **frontend/tests/e2e/login-and-graph.spec.ts:** Login with nickknyc → nav shows Explore/Enrichment/Sign out → graph view loads without "Failed to fetch".

## Runtime hygiene (before local tests)

Ensure port **3000** is free and only one dev server is running so Playwright’s local project can hit `http://localhost:3000`:

- Use **`npm run dev`** to start (project port guard runs first).
- If port 3000 is occupied: `netstat -ano | Select-String ":3000"` → `Stop-Process -Id <pid> -Force` → `npm run dev`.
- Rule: `.cursor/rules/port-3000-runtime-hygiene.mdc`. Subagent: **runtime-hygiene** (`.cursor/agents/runtime-hygiene.md`) for port check, stopping stale processes, and clean terminal sessions.

## Rules and subagents

- **.cursor/rules/ui-debug-testing.mdc** — Requires autonomous UI validation; Playwright preferred; run deployed project for deployment-related work.
- **.cursor/agents/ui-testing.md** — Subagent for running and extending UI tests.
- **.cursor/agents/runtime-hygiene.md** — Subagent for port 3000 and dev server hygiene before local tests.
