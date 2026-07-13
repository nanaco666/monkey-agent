#!/bin/bash
# Build and install Monkey macOS app
# Syncs to ALL copies found on disk (Dock, Desktop, /Applications, etc.)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PRIMARY_APP_DIR="/Applications/Monkey.app"

echo "🔨 Building CLI..."
cd "$ROOT_DIR"
npm run build

echo "🔨 Building Swift app..."
cd "$ROOT_DIR/MonkeyApp"
swift build -c release 2>&1 | tail -3

# -- Helper: install built artifacts into a given app bundle --
install_to_bundle() {
  local bundle="$1"
  mkdir -p "$bundle/Contents/MacOS"
  mkdir -p "$bundle/Contents/Resources"

  cp .build/release/MonkeyApp "$bundle/Contents/MacOS/MonkeyApp"

  # Copy Info.plist if not exists
  if [ ! -f "$bundle/Contents/Info.plist" ]; then
    cp "$SCRIPT_DIR/app/Info.plist" "$bundle/Contents/Info.plist"
  fi

  # Copy Resources (icon, avatar, etc.)
  cp Resources/* "$bundle/Contents/Resources/"

  # Copy SPM resource bundle (needed for bundle: .module)
  SPM_BUNDLE=".build/release/MonkeyApp_MonkeyApp.bundle"
  if [ -d "$SPM_BUNDLE" ]; then
    cp -R "$SPM_BUNDLE" "$bundle/Contents/Resources/"
  fi
}

# -- Install to primary location --
echo "📦 Installing app bundle to $PRIMARY_APP_DIR..."
install_to_bundle "$PRIMARY_APP_DIR"

# -- Find and sync ALL other copies on disk --
echo "🔍 Scanning for other Monkey.app copies..."
# mdfind is fast and finds bundles by name
OTHER_COPIES=$(mdfind "kMDItemFSName == 'Monkey.app'" 2>/dev/null | grep -v "^$PRIMARY_APP_DIR$" | sort -u || true)

if [ -n "$OTHER_COPIES" ]; then
  echo "$OTHER_COPIES" | while read -r copy; do
    if [ -d "$copy/Contents/MacOS" ]; then
      echo "📦 Syncing → $copy"
      install_to_bundle "$copy"
    fi
  done
else
  echo "   No other copies found."
fi

# -- Touch all bundles so macOS re-reads the binary --
find / -name "Monkey.app" -type d -maxdepth 5 2>/dev/null | while read -r bundle; do
  touch "$bundle" 2>/dev/null || true
done

echo "✅ Monkey app installed & synced"
echo "   Primary: $PRIMARY_APP_DIR"
