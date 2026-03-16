# Deploying GrooveGraph

The app runs as a **dynamic** Node.js/Next.js application. All graph data lives in **Neo4j Aura**; API routes (for example `/api/graph`, `/api/query-artist`, `/api/enrich/review-session`, `/api/enrich/apply-review-session`, `/api/enrich/explore-triplet`) query and persist to Aura at runtime.

For same-origin deployment, the site requires a server (API routes and Neo4j). For Azure you can split **web UI** (static) on Static Web Apps and **API** on App Service; the UI then calls the API via `NEXT_PUBLIC_API_BASE_URL`.

---

## 1. Prerequisites

- **Neo4j Aura** instance. Create one at [console.neo4j.io](https://console.neo4j.io). See [neo4j.md](neo4j.md) for setup.
- **Environment variables** (or `.env.local`): `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`
- **Graph data loaded** into Aura: run `npm run load:neo4j` before or after deploy (see [data/README.md](../data/README.md)).

---

## 2. Build

From the repo root:

```bash
npm install
npm run build
npm run build:web
```

This compiles TypeScript and produces a production Next.js build. The `out/` folder is not used; `next start` serves the app dynamically.

---

## 3. Deploy options

### Option A: Vercel (recommended for Next.js)

1. Connect the repo to Vercel.
2. Add environment variables in the Vercel dashboard:
   - `NEO4J_URI`
   - `NEO4J_USERNAME`
   - `NEO4J_PASSWORD`
   - `NEO4J_DATABASE`
3. Deploy. Vercel will run `next build` and serve the app with API routes.

### Option B: Node.js host (VPS, Railway, Render, Fly.io)

1. Build: `npm run build && npm run build:web`
2. Start: `npm run start` (runs `next start` on port 3000)
3. Set `NEO4J_*` environment variables on the host.
4. Ensure the process stays running (PM2, systemd, or platform process manager).

### Option C: Azure split — UI on SWA, API on App Service (recommended for groovegraph.s13.nyc)

- **Web UI** → **swa-groovegraph** (Static Web App, custom domain groovegraph.s13.nyc). Application Insights is linked to this SWA.
- **API** → **as-groovegraph-api** (App Service, free F1 tier). Runs the Next.js API routes and Neo4j; Application Insights is configured and active. CORS allows requests from the SWA origin. The API uses the **built-in Node.js runtime** (`NODE|20-lts`), not a custom Docker image; startup command is `npm start` (Next.js). Linux App Service runs the stack in a platform-managed environment; to avoid Linux/containers entirely you would use a Windows App Service plan instead.

**1. Deploy the API (App Service)** — full Next.js app so `/api/*` and server run there:

```powershell
npm run build
npm run build:web
.\backend\scripts\deploy-appservice.ps1 -WebAppName as-groovegraph-api
```

Ensure **as-groovegraph-api** has app settings: `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`, `OPENAI_API_KEY`, `ENRICHMENT_PIPELINE`, and Application Insights (`APPLICATIONINSIGHTS_CONNECTION_STRING`). Admin auth is UI-only (header `X-Admin-User: nickknyc`); no cookie secret required.

**Avoiding 404 on `/api/*` after static build:** When you run `npm run build:static:swa`, the script removes `app/api` and then restores it from the backup. If the process is interrupted or the backup path is wrong, `app/api` can stay missing. Before building for App Service, ensure `app/api` is present (e.g. run `git restore app/api` if it’s missing), then build and deploy as above. After deploy, `https://as-groovegraph-api.azurewebsites.net/api/graph?entityType=Artist&random=1` should respond with 200.

**2. Deploy the UI (SWA)** — static export with API base URL pointing at App Service:

```powershell
$env:SWA_CLI_DEPLOYMENT_TOKEN = (az staticwebapp secrets list --name swa-groovegraph --resource-group rg-groovegraph --query "properties.apiKey" -o tsv)
.\frontend\scripts\deploy-swa.ps1
```

The script runs `npm run build:static:swa` (builds with `NEXT_PUBLIC_API_BASE_URL=https://as-groovegraph-api.azurewebsites.net`) if `out/` is missing, then deploys `out/` to **swa-groovegraph**. Users hit groovegraph.s13.nyc for the UI; the UI calls the API at as-groovegraph-api.

**Testing after deploy:** Run Playwright e2e against the deployed site to confirm login, nav, and graph load. See [UI_TESTING.md](UI_TESTING.md) and the **ui-testing** subagent. Example:

```powershell
$env:PLAYWRIGHT_BASE_URL = "https://groovegraph.s13.nyc"
npx playwright test -c frontend/playwright.config.ts frontend/tests/e2e/login-and-graph.spec.ts --project=deployed
```

---

### Option D: Azure App Service only (full app, single host)

You can run the **full** Next.js app (including API routes and Neo4j) on [Azure App Service](https://learn.microsoft.com/en-us/azure/app-service/) free tier (**F1**). Limits: 1 GB storage, **60 minutes compute per day** (app sleeps when idle; cold starts when traffic resumes). Good for demos and light use.

**1. Create the app (Azure CLI, one-time):**

```powershell
# Use existing rg-groovegraph or create one
az appservice plan create --name plan-groovegraph --resource-group rg-groovegraph --sku F1 --is-linux
az webapp create --name app-groovegraph --resource-group rg-groovegraph --plan plan-groovegraph --runtime "NODE:20-lts"
```

**2. Set environment variables** (Neo4j and any API keys):

```powershell
az webapp config appsettings set --name app-groovegraph --resource-group rg-groovegraph --settings `
  NEO4J_URI="<your-aura-uri>" `
  NEO4J_USERNAME="neo4j" `
  NEO4J_PASSWORD="<password>" `
  NEO4J_DATABASE="neo4j"
```

**3. Build and deploy:**

Build locally, then run the deploy script (zips `.next`, `node_modules`, `package.json`, `public` and runs `az webapp deploy`). App Service runs `npm start`; it sets `PORT` and Next.js uses it.

```powershell
npm run build
npm run build:web
.\backend\scripts\deploy-appservice.ps1
```

Optional parameters: `-ResourceGroup` and `-WebAppName`. For the GrooveGraph API host: `.\backend\scripts\deploy-appservice.ps1 -WebAppName as-groovegraph-api`.

---

### Option E: Azure Static Web Apps (UI only)

Deploy only the **static web UI** to **swa-groovegraph** (e.g. for groovegraph.s13.nyc). The UI must call an API elsewhere; use **build:static:swa** so `NEXT_PUBLIC_API_BASE_URL` points at **as-groovegraph-api**. See Option C for the full split (UI on SWA + API on App Service).

1. **Get deployment token** (Azure CLI logged in):
   ```powershell
   $env:SWA_CLI_DEPLOYMENT_TOKEN = (az staticwebapp secrets list --name swa-groovegraph --resource-group rg-groovegraph --query "properties.apiKey" -o tsv)
   ```
2. **Deploy** (builds with API base URL if `out/` is missing):
   ```powershell
   .\frontend\scripts\deploy-swa.ps1
   ```

**Automatic deploy on push (GitHub Actions):** A workflow in `.github/workflows/deploy-swa.yml` builds the static UI and deploys to **swa-groovegraph** on every push to `main`. Add the SWA deployment token as a GitHub repository secret:

1. In the repo: **Settings → Secrets and variables → Actions**.
2. **New repository secret**: name `AZURE_STATIC_WEB_APPS_API_TOKEN`, value = output of:
   ```powershell
   az staticwebapp secrets list --name swa-groovegraph --resource-group rg-groovegraph --query "properties.apiKey" -o tsv
   ```
3. Push to `main` (or run the workflow manually from the Actions tab). The workflow runs `npm run build:static:swa` then deploys `out/` to Production.

---

### Option F: Docker

Example Dockerfile:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:web

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "run", "start"]
```

Pass `NEO4J_*` as build args or runtime env.

---

## 4. Post-deploy: load graph data

If the Aura instance is empty, run the import from a machine with repo access and `.env.local` configured:

```bash
npm run load:neo4j
```

This imports from `data/bobdobbsnyc.csv` (or `data/graph-store.json` if present).

---

## 5. Summary

| Step | Command |
|------|---------|
| Configure Aura | Add `NEO4J_*` to `.env.local` or host env (see [neo4j.md](neo4j.md)) |
| Build | `npm run build && npm run build:web` |
| Run locally | `npm run start` |
| Load graph (if needed) | `npm run load:neo4j` |
| Deploy | Vercel, Node host, or Azure: Option C (UI→SWA, API→App Service), Option D (App Service only), Option E (SWA UI only) |
