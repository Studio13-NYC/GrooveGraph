# Browser Validation Agent Prompt

Use this prompt when you want an agent to run observable UI automation and validate behavior with screenshot evidence.

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
4) Perform exactly one browser-tool preflight check.
5) If preflight fails, stop immediately and report:
   - tool attempted
   - exact error text
   - why UI testing is blocked
   - required environment action to unblock
6) If preflight passes, execute the full UI flow:
   - enter data
   - click relevant controls
   - wait for completion indicators
7) Capture full-page screenshots:
   - baseline before interaction
   - after each critical step
   - final state
8) For each screenshot, report:
   - action performed
   - expected visible result
   - observed visible result
   - pass/fail
9) If any step fails, include:
   - visible discrepancy
   - suspected cause
   - next corrective action
10) Keep concise progress updates during attempts (attempt, outcome, next step).
```

## Usage notes

- This prompt is intended for feature, enhancement, and debugging workflows with UI impact.
- The governing rule is `alwaysApply: true`, but including the prompt text still improves consistency across agents.
