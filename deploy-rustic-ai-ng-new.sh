#!/usr/bin/env bash
set -euo pipefail

# Deploys rustic-ai-ng-new to the same Firebase Hosting sites as rustic-ai-ng (replacing it there).
# Uses its own Firebase config (firebase.rustic-ai-ng-new.json: same targets, serving
# dist/rustic-ai-ng-new/browser), so firebase.json and deploy-rustic-ai-ng.sh stay as they are.

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

echo "Deploying rustic-ai-ng-new → $INSTANCE (config: $BUILD_CONFIG)"

echo "Building ngx-twang-ui..."
ng build ngx-twang-ui

echo "Building rustic-ai-ng-new..."
ng build rustic-ai-ng-new --configuration "$BUILD_CONFIG"

echo "Deploying to Firebase ($FIREBASE_PROJECT / hosting:$HOSTING_TARGET)..."
npx firebase deploy --config firebase.rustic-ai-ng-new.json --project "$FIREBASE_PROJECT" --only "hosting:$HOSTING_TARGET"

echo "Deploy complete → $INSTANCE"
