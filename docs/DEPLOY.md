# Deploying GrooveGraph

The app runs as a **dynamic** Node.js/Next.js application. All graph data lives in **Neo4j Aura**; API routes (`/api/graph`, `/api/query-artist`, `/api/enrich`) query and persist to Aura at runtime.

There is no static export. The site requires a server to handle API routes and Neo4j connectivity.

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

### Option C: Docker

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
| Deploy | Push to Vercel, or run `next start` on Node host with env vars set |
