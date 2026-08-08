#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

ARCH="${1:-arm64}"
case "$ARCH" in
  arm64|x64) ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 2
    ;;
esac

node desktop/release-signing-preflight.js
npm run test:desktop
npm run test:packages

./node_modules/.bin/electron-builder \
  --config desktop/electron-builder.release.cjs \
  --mac pkg zip \
  "--$ARCH"

if [[ "$ARCH" == "arm64" ]]; then
  APP_DIR="dist/mac-arm64"
else
  APP_DIR="dist/mac"
fi
APP_PATH="$APP_DIR/DocFlow Local.app"
PKG_PATH="dist/DocFlow-Local-$(node -p "require('./package.json').version")-macOS-$ARCH.pkg"

"$APP_PATH/Contents/MacOS/DocFlow Local" --docflow-release-smoke
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
spctl --assess --type execute --verbose=2 "$APP_PATH"
pkgutil --check-signature "$PKG_PATH"
xcrun stapler validate "$PKG_PATH"
node scripts/generate-release-metadata.js --channel public --platform macOS --arch "$ARCH"
