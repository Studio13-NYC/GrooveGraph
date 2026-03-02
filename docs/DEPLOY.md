# Deploying GrooveGraph to Azure Static Web Apps

The app is built as a **static export** (no server at runtime). All graph data is baked into a single **graph.json** file that the client loads and queries in memory.

## 1. Provision Azure resources

Create the resource group and a free-tier Static Web App.

**PowerShell (Windows):**
```powershell
.\scripts\azure-provision.ps1
```

**Bash (macOS/Linux):**
```bash
chmod +x scripts/azure-provision.sh
./scripts/azure-provision.sh
```

Prerequisites: [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) installed and logged in (`az login`).

This creates:
- **Resource group:** `rg-groovegraph`
- **Static Web App:** `swa-groovegraph` (free tier)
- **Region:** East US 2

## 2. Build the static site with graph data

From the repo root:

```bash
npm run build:static
```

This will:
1. Compile TypeScript (`npm run build`)
2. Run the export script to generate `public/graph.json` from `data/bobdobbsnyc.csv`
3. Run `next build` with `output: 'export'` to produce the static site in `out/`

The `out/` folder contains the full site plus `graph.json`; no API or Node server is used in production.

## 3. Deploy to Azure Static Web Apps

Deploy **only to Production** using one of the options below. The SWA CLI defaults to **preview** if you omit `--env production`; do not run the raw `npx ... deploy` without that flag.

### Option A: npm script (recommended)

**PowerShell:**
```powershell
$env:SWA_CLI_DEPLOYMENT_TOKEN = (az staticwebapp secrets list --name swa-groovegraph --resource-group rg-groovegraph --query "properties.apiKey" -o tsv)
npm run deploy:swa
```

**Bash:**
```bash
export SWA_CLI_DEPLOYMENT_TOKEN=$(az staticwebapp secrets list --name swa-groovegraph --resource-group rg-groovegraph --query "properties.apiKey" -o tsv)
npm run deploy:swa
```

### Option B: Deploy scripts

**PowerShell:** `.\scripts\deploy-swa.ps1` (or pass token as first arg). **Bash:** `./scripts/deploy-swa.sh` (or pass token as first arg).

### Option C: Manual (must include --env production)

Get token: `az staticwebapp secrets list --name swa-groovegraph --resource-group rg-groovegraph --query "properties.apiKey" -o tsv`

Then: `npx @azure/static-web-apps-cli deploy ./out --deployment-token <TOKEN> --env production`

After deployment, the site is available at the Static Web App’s default hostname (shown at the end of the provision script, or via `az staticwebapp show --name swa-groovegraph --resource-group rg-groovegraph --query defaultHostname -o tsv`).

## Summary

| Step | Command |
|------|--------|
| Provision | `.\scripts\azure-provision.ps1` or `./scripts/azure-provision.sh` |
| Build static + data | `npm run build:static` |
| Deploy to **Production** | `$env:SWA_CLI_DEPLOYMENT_TOKEN = (az ... -o tsv); npm run deploy:swa` or `.\scripts\deploy-swa.ps1` |

**Security:** Do not commit the deployment token or store it in a public repo.

**Preview environment:** If you see a "preview" environment in the Azure portal, it was likely created by an earlier deploy without `--env production`. You can ignore it or delete it in the portal; use only the deploy command above so future deploys go straight to Production.
