# Long-term To-Do

Parked items for later; not scheduled.

---

## Next.js upgrade (security)

- **Context:** `npm audit` reports 1 high severity vulnerability in `next` (versions 10.0.0–15.5.9).
- **Advisories:**
  - [GHSA-9g9p-9gw9-jx7f](https://github.com/advisories/GHSA-9g9p-9gw9-jx7f) — DoS via Image Optimizer `remotePatterns` (self-hosted apps).
  - [GHSA-h25m-26qc-wcjf](https://github.com/advisories/GHSA-h25m-26qc-wcjf) — DoS via HTTP request deserialization when using React Server Components insecurely.
- **Fix:** Upgrade to Next 16.x (e.g. `next@16.1.6`). This is a **major** upgrade from current 14.x; expect breaking changes (APIs, config, behavior).
- **Action:** Plan a dedicated upgrade pass: review Next 16 changelog and migration notes, update `next.config` and code, then `npm install next@16` and re-test. Do not use `npm audit fix --force` without planning.
