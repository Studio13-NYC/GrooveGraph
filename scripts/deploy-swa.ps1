# Deploy GrooveGraph static site to Azure Static Web Apps **Production** (not preview).
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
  Write-Error "No out/ folder. Run: npm run build:static"
  exit 1
}

Write-Host "Deploying to Production (--env production)..." -ForegroundColor Cyan
npx @azure/static-web-apps-cli deploy ./out --env production
