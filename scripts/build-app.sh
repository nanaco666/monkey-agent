#!/bin/bash
# Build and install Monkey macOS app
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="/Applications/Monkey.app"

echo "🔨 Building CLI..."
cd "$SCRIPT_DIR"
npm run build

echo "🔨 Building Swift app..."
cd MonkeyApp
swift build -c release 2>&1 | tail -3

echo "📦 Installing app bundle..."
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

cp .build/release/MonkeyApp "$APP_DIR/Contents/MacOS/MonkeyApp"

# Copy Info.plist if not exists
if [ ! -f "$APP_DIR/Contents/Info.plist" ]; then
  cp ../scripts/app/Info.plist "$APP_DIR/Contents/Info.plist"
fi

# Copy icon if not exists
if [ ! -f "$APP_DIR/Contents/Resources/AppIcon.icns" ]; then
  echo "⚠️  No icon file found. Run scripts/app/make_icon.sh first."
fi

echo "✅ Monkey app installed at $APP_DIR"
echo "   Launch with: open $APP_DIR"
