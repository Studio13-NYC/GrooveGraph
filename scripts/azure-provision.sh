#!/usr/bin/env bash
# Provision Azure resource group and Static Web App (free tier) for GrooveGraph.
# Prerequisites: Azure CLI installed and logged in (az login).
# Usage: ./scripts/azure-provision.sh

set -e
RESOURCE_GROUP="rg-groovegraph"
STATIC_WEB_APP_NAME="swa-groovegraph"
LOCATION="eastus2"

echo "Creating resource group: $RESOURCE_GROUP in $LOCATION"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

echo "Creating Static Web App (free tier): $STATIC_WEB_APP_NAME"
az staticwebapp create \
  --name "$STATIC_WEB_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Free

echo "Getting default hostname..."
HOSTNAME=$(az staticwebapp show --name "$STATIC_WEB_APP_NAME" --resource-group "$RESOURCE_GROUP" --query "defaultHostname" -o tsv)
echo "Static Web App URL: https://$HOSTNAME"

echo ""
echo "To get the deployment token (for swa deploy), run:"
echo "  az staticwebapp secrets list --name $STATIC_WEB_APP_NAME --resource-group $RESOURCE_GROUP --query \"properties.apiKey\" -o tsv"
echo ""
echo "Then deploy the static export (use --env production to deploy to Production, not Preview):"
echo "  npm run build:static"
echo "  npx @azure/static-web-apps-cli deploy ./out --deployment-token <TOKEN> --env production"
