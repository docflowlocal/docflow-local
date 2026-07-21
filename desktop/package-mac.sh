#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARCH="${1:-arm64}"
VERSION="$(node -p "require('./package.json').version")"
APP_DIR="dist/mac-${ARCH}"
APP_PATH="${APP_DIR}/DocFlow Local.app"

node_modules/.bin/electron-builder --mac dir "--${ARCH}"
codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"

ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "dist/DocFlow-Local-${VERSION}-macOS-${ARCH}.zip"
pkgbuild \
  --component "$APP_PATH" \
  --install-location "/Applications" \
  --identifier "com.docflow.local" \
  --version "$VERSION" \
  "dist/DocFlow-Local-${VERSION}-macOS-${ARCH}.pkg"

echo "Created:"
echo "  dist/DocFlow-Local-${VERSION}-macOS-${ARCH}.zip"
echo "  dist/DocFlow-Local-${VERSION}-macOS-${ARCH}.pkg"
