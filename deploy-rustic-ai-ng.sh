#!/usr/bin/env bash
set -euo pipefail

INSTANCE="${1:-instance1}"

case "$INSTANCE" in
  instance1)
    BUILD_CONFIG="production"
    FIREBASE_PROJECT="instance1"
    HOSTING_TARGET="rustic-ai-rkapps"
    ;;
  instance2)
    BUILD_CONFIG="production-instance2"
    FIREBASE_PROJECT="instance2"
    HOSTING_TARGET="instance2"
    ;;
  *)
    echo "Usage: $0 [instance1|instance2]"
    exit 1
    ;;
esac

echo "Deploying rustic-ai-ng → $INSTANCE (config: $BUILD_CONFIG)"

echo "Building ngx-twang-ui..."
ng build ngx-twang-ui

echo "Building rustic-ai-ng..."
ng build rustic-ai-ng --configuration "$BUILD_CONFIG"

echo "Deploying to Firebase ($FIREBASE_PROJECT / hosting:$HOSTING_TARGET)..."
npx firebase deploy --project "$FIREBASE_PROJECT" --only "hosting:$HOSTING_TARGET"

echo "Deploy complete → $INSTANCE"
