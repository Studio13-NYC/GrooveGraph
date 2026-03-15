# Browser Validation Agent Prompt

Use this prompt when you want an agent to run observable UI automation and validate behavior with screenshot evidence.

## Copy/paste prompt

```md
Follow `.cursor/rules/ui-debug-testing.mdc` strictly.

Requirements:
1) Run browser automation in a visible tab so I can watch.
2) Perform exactly one browser-tool preflight check (no MCP server-name probing).
3) If preflight fails, stop immediately and report:
   - tool attempted
   - exact error text
   - why UI testing is blocked
   - required environment action to unblock
4) If preflight passes, execute the full UI flow:
   - enter data
   - click relevant controls
   - wait for completion indicators
5) Capture full-page screenshots:
   - baseline before interaction
   - after each critical step
   - final state
6) For each screenshot, report:
   - action performed
   - expected visible result
   - observed visible result
   - pass/fail
7) If any step fails, include:
   - visible discrepancy
   - suspected cause
   - next corrective action
8) Keep concise progress updates during attempts (attempt, outcome, next step).
```

## Usage notes

- This prompt is intended for feature, enhancement, and debugging workflows with UI impact.
- The governing rule is `alwaysApply: true`, but including the prompt text still improves consistency across agents.
