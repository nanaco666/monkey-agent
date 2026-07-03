#!/bin/bash
# Build Monkey Electron app for Windows (cross-compile from macOS)
# Produces an NSIS installer (.exe) in MonkeyElectron/dist-electron/
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON_DIR="$SCRIPT_DIR/../MonkeyElectron"

cd "$ELECTRON_DIR"

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building CLI (if needed)..."
cd "$SCRIPT_DIR/.."
npm run build

echo "🖥️  Building Windows installer..."
cd "$ELECTRON_DIR"

# Cross-compile for Windows x64
npx electron-builder --win --x64

echo ""
echo "✅ Windows installer ready at: $ELECTRON_DIR/dist-electron/"
ls -lh dist-electron/*.exe 2>/dev/null || echo "(Check dist-electron/ for output)"
