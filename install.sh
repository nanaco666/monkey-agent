#!/bin/sh
set -e

REPO="https://github.com/nanaco666/monkey-agent.git"
INSTALL_DIR="$HOME/.monkey-agent-src"

echo ""
echo "Installing Monkey Agent..."
echo ""

# Check dependencies
if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required. Install Node.js 20+ from https://nodejs.org"
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is required."
  exit 1
fi

# Clone or update
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating existing installation..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  git clone "$REPO" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
npm install --silent
npm run build --silent
npm install -g . --silent

# Find npm global bin
NPM_BIN="$(npm prefix -g)/bin"

echo ""
echo "✓ Monkey Agent installed."
echo ""

# Check PATH
if echo ":$PATH:" | grep -q ":$NPM_BIN:"; then
  echo "  Run: monkey"
  exit 0
fi

# Detect shell config
if [ "$(basename "$SHELL")" = "zsh" ]; then
  SHELL_CONFIG="$HOME/.zshrc"
elif [ "$(basename "$SHELL")" = "bash" ]; then
  SHELL_CONFIG="${HOME}/.bash_profile"
  [ ! -f "$SHELL_CONFIG" ] && SHELL_CONFIG="$HOME/.bashrc"
else
  SHELL_CONFIG=""
fi

PATH_LINE="export PATH=\"$NPM_BIN:\$PATH\""

if [ -n "$SHELL_CONFIG" ] && [ -w "$SHELL_CONFIG" ]; then
  if ! grep -qF "$NPM_BIN" "$SHELL_CONFIG" 2>/dev/null; then
    echo "" >> "$SHELL_CONFIG"
    echo "# Added by monkey-agent installer" >> "$SHELL_CONFIG"
    echo "$PATH_LINE" >> "$SHELL_CONFIG"
  fi
  export PATH="$NPM_BIN:$PATH"
  echo "  Run: monkey"
  echo "  (Restart terminal to make permanent)"
elif [ -n "$SHELL_CONFIG" ]; then
  echo "  Add to $SHELL_CONFIG:"
  echo "    $PATH_LINE"
  echo "  Then run: source $SHELL_CONFIG && monkey"
else
  echo "  Add to your shell config: $PATH_LINE"
fi

echo ""
