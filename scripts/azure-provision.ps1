# Provision Azure resource group and Static Web App (free tier) for GrooveGraph.
# Prerequisites: Azure CLI installed and logged in (az login).
# Usage: .\scripts\azure-provision.ps1

$ErrorActionPreference = "Stop"
$ResourceGroup = "rg-groovegraph"
$StaticWebAppName = "swa-groovegraph"
$Location = "eastus2"

Write-Host "Creating resource group: $ResourceGroup in $Location"
az group create --name $ResourceGroup --location $Location

Write-Host "Creating Static Web App (free tier): $StaticWebAppName"
az staticwebapp create `
  --name $StaticWebAppName `
  --resource-group $ResourceGroup `
  --location $Location `
  --sku Free

Write-Host "Getting default hostname..."
$Hostname = az staticwebapp show --name $StaticWebAppName --resource-group $ResourceGroup --query "defaultHostname" -o tsv
Write-Host "Static Web App URL: https://$Hostname"

Write-Host ""
Write-Host "To get the deployment token (for swa deploy), run:"
Write-Host "  az staticwebapp secrets list --name $StaticWebAppName --resource-group $ResourceGroup --query `"properties.apiKey`" -o tsv"
Write-Host ""
Write-Host "Then deploy the static export (use --env production to deploy to Production, not Preview):"
Write-Host "  npm run build:static"
Write-Host "  npx @azure/static-web-apps-cli deploy ./out --deployment-token <TOKEN> --env production"
