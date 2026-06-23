#!/usr/bin/env bash
set -euo pipefail

echo "Deploying bset-ai-ng → bset-ai-ijn"

echo "Building ngx-twang-ui..."
ng build ngx-twang-ui

echo "Building bset-ai-ng..."
ng build bset-ai-ng --configuration production

echo "Deploying to Firebase (bset-ai-ijn / hosting:bset-ai-ijn)..."
npx firebase deploy --project bset-ai-ijn --only hosting:bset-ai-ijn

echo "Deploy complete → bset-ai-ijn"
