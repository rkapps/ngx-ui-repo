#!/usr/bin/env bash
set -euo pipefail

echo "Building rustic-ai-ng (production)..."
ng build rustic-ai-ng --configuration production

echo "Deploying to Firebase Hosting..."
firebase deploy --only hosting:rustic-ai-rkapps

echo "Deploy complete."
