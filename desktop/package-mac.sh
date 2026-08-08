#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARCH="${1:-arm64}"
VERSION="$(node -p "require('./package.json').version")"
if [[ "$ARCH" == "arm64" ]]; then
  APP_DIR="dist/mac-arm64"
elif [[ "$ARCH" == "x64" ]]; then
  APP_DIR="dist/mac"
else
  echo "Unsupported macOS architecture: $ARCH" >&2
  exit 2
fi
APP_PATH="${APP_DIR}/DocFlow Local.app"

node_modules/.bin/electron-builder --mac dir "--${ARCH}"
codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"
"$APP_PATH/Contents/MacOS/DocFlow Local" --docflow-release-smoke

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
