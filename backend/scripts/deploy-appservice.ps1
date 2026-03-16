# Deploy GrooveGraph to Azure App Service (full Next.js app; use free F1 tier).
# Prerequisites: Azure CLI logged in (az login), app created (see docs/DEPLOY.md Option C).
# Usage: From repo root after "npm run build" and "npm run build:web":
#   .\scripts\deploy-appservice.ps1
# Optional: .\scripts\deploy-appservice.ps1 -ResourceGroup rg-groovegraph -WebAppName app-groovegraph

param(
  [string]$ResourceGroup = "rg-groovegraph",
  [string]$WebAppName = "app-groovegraph"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".next")) {
  Write-Error "No .next/ folder. Run: npm run build && npm run build:web"
  exit 1
}

$zipPath = Join-Path $env:TEMP "groovegraph-deploy-$(Get-Date -Format 'yyyyMMddHHmmss').zip"
Write-Host "Creating deployment package..." -ForegroundColor Cyan
# Zip contents at root (no parent folder in zip). Include node_modules so Azure does not need to run npm install.
$toZip = @("package.json", "package-lock.json", ".next", "public", "node_modules")
Compress-Archive -Path $toZip -DestinationPath $zipPath -Force

try {
  Write-Host "Deploying to $WebAppName (resource group $ResourceGroup)..." -ForegroundColor Cyan
  az webapp deploy --name $WebAppName --resource-group $ResourceGroup --src-path $zipPath --type zip
  Write-Host "Done. Open: https://$WebAppName.azurewebsites.net" -ForegroundColor Green
} finally {
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
}
