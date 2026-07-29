#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARCH="$(node -p 'process.arch')"
case "$ARCH" in
  arm64)
    APP_PATH="dist/mac-arm64/DocFlow Local.app"
    ;;
  x64)
    APP_PATH="dist/mac/DocFlow Local.app"
    ;;
  *)
    echo "Unsupported macOS host architecture: $ARCH" >&2
    exit 2
    ;;
esac

node_modules/.bin/electron-builder --mac dir "--${ARCH}"
codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"
"$APP_PATH/Contents/MacOS/DocFlow Local" --docflow-release-smoke
