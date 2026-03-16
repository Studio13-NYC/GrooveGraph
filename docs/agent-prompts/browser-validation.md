# Browser Validation Agent Prompt

Use this prompt when you want an agent to run observable UI automation and validate behavior with screenshot evidence.

**Preferred for regression:** Use **Playwright e2e** first (`npx playwright test`; for deployed: `--project=deployed` with `PLAYWRIGHT_BASE_URL=https://groovegraph.s13.nyc`). See `docs/UI_TESTING.md` and the **ui-testing** subagent. Use the browser prompt below when you need interactive exploration or screenshot evidence beyond what the e2e specs capture.

## Copy/paste prompt

```md
Follow `.cursor/rules/ui-debug-testing.mdc` strictly.

Requirements:
1) Prepare runtime before browser testing:
   - check whether `http://localhost:3000` is already healthy
   - if unknown/unhealthy/stale, kill listeners on ports `3000-3099`
   - start server in a visible terminal with `npm run dev`
   - wait for startup completion and confirmed response on `http://localhost:3000`
   - if it binds another port, stop it, free `3000`, and restart
2) Use the native Browser tool / `@browser` only in a visible tab I can watch.
3) Do not use MCP (`call_mcp_tool`) for browser actions and do not probe MCP server names.
4) Before navigation, verify browser actions exist in this session tool list (navigate/click/type/snapshot/screenshot equivalents).
5) If browser actions are missing, stop immediately and report blocker; required environment action must be:
   - start a new agent chat with `@browser` explicitly attached
   - confirm the target Browser Tab is selected
   - re-run the same request in that new chat
6) Perform exactly one browser-tool preflight check.
7) If preflight fails, stop immediately and report:
   - tool attempted
   - exact error text
   - why UI testing is blocked
   - required environment action to unblock
8) If preflight passes, execute the full UI flow:
   - enter data
   - click relevant controls
   - wait for completion indicators
9) Capture full-page screenshots:
   - baseline before interaction
   - after each critical step
   - final state
10) For each screenshot, report:
   - action performed
   - expected visible result
   - observed visible result
   - pass/fail
11) If any step fails, include:
   - visible discrepancy
   - suspected cause
   - next corrective action
12) Keep concise progress updates during attempts (attempt, outcome, next step).
```

## Usage notes

- This prompt is intended for feature, enhancement, and debugging workflows with UI impact.
- The governing rule is `alwaysApply: true`, but including the prompt text still improves consistency across agents.
