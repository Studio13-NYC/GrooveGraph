# Deploy GrooveGraph **web UI** (static) to Azure Static Web Apps **swa-groovegraph**.
# The UI calls the API at as-groovegraph-api (App Service). Build uses NEXT_PUBLIC_API_BASE_URL.
# Usage: Set token then run, e.g.:
#   $env:SWA_CLI_DEPLOYMENT_TOKEN = (az staticwebapp secrets list --name swa-groovegraph --resource-group rg-groovegraph --query "properties.apiKey" -o tsv)
#   .\scripts\deploy-swa.ps1
# Or pass token as first arg:
#   .\scripts\deploy-swa.ps1 <YOUR_TOKEN>

$ErrorActionPreference = "Stop"

if ($args.Count -ge 1) {
  $env:SWA_CLI_DEPLOYMENT_TOKEN = $args[0]
}

if (-not $env:SWA_CLI_DEPLOYMENT_TOKEN) {
  Write-Error "Set SWA_CLI_DEPLOYMENT_TOKEN or pass token as first argument. Get it with: az staticwebapp secrets list --name swa-groovegraph --resource-group rg-groovegraph --query ""properties.apiKey"" -o tsv"
  exit 1
}

if (-not (Test-Path "out")) {
  Write-Host "Building static UI for SWA (API base: as-groovegraph-api)..." -ForegroundColor Cyan
  npm run build:static:swa
}

Write-Host "Deploying UI to swa-groovegraph (Production)..." -ForegroundColor Cyan
npx @azure/static-web-apps-cli deploy ./out --env production
