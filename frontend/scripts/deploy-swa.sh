#!/usr/bin/env bash
# Deploy GrooveGraph static site to Azure Static Web Apps **Production** (not preview).
# Usage: Set token then run, e.g.:
#   export SWA_CLI_DEPLOYMENT_TOKEN=$(az staticwebapp secrets list --name swa-groovegraph --resource-group rg-groovegraph --query "properties.apiKey" -o tsv)
#   ./scripts/deploy-swa.sh
# Or pass token as first arg:
#   ./scripts/deploy-swa.sh <YOUR_TOKEN>

set -e

if [ -n "$1" ]; then
  export SWA_CLI_DEPLOYMENT_TOKEN="$1"
fi

if [ -z "$SWA_CLI_DEPLOYMENT_TOKEN" ]; then
  echo "Error: Set SWA_CLI_DEPLOYMENT_TOKEN or pass token as first argument."
  echo "Get it with: az staticwebapp secrets list --name swa-groovegraph --resource-group rg-groovegraph --query \"properties.apiKey\" -o tsv"
  exit 1
fi

if [ ! -d "out" ]; then
  echo "Error: No out/ folder. Run: npm run build:static"
  exit 1
fi

echo "Deploying to Production (--env production)..."
npx @azure/static-web-apps-cli deploy ./out --env production
