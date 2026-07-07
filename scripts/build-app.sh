#!/bin/bash
# Build and install Monkey macOS app
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="/Applications/Monkey.app"

echo "🔨 Building CLI..."
cd "$ROOT_DIR"
npm run build

echo "🔨 Building Swift app..."
cd "$ROOT_DIR/MonkeyApp"
swift build -c release 2>&1 | tail -3

echo "📦 Installing app bundle..."
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

cp .build/release/MonkeyApp "$APP_DIR/Contents/MacOS/MonkeyApp"

# Copy Info.plist if not exists
if [ ! -f "$APP_DIR/Contents/Info.plist" ]; then
  cp "$SCRIPT_DIR/app/Info.plist" "$APP_DIR/Contents/Info.plist"
fi

# Copy Resources (icon, avatar, etc.)
cp Resources/* "$APP_DIR/Contents/Resources/"

# Copy SPM resource bundle (needed for bundle: .module)
SPM_BUNDLE=".build/release/MonkeyApp_MonkeyApp.bundle"
if [ -d "$SPM_BUNDLE" ]; then
    cp -R "$SPM_BUNDLE" "$APP_DIR/Contents/Resources/"
    echo "📦 Copied SPM resource bundle"
fi

echo "✅ Monkey app installed at $APP_DIR"
echo "   Launch with: open $APP_DIR"
