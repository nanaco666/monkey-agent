#!/bin/sh
set -e

echo ""
echo "Installing Monkey Agent..."
echo ""

# Check npm
if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required. Install Node.js 20+ from https://nodejs.org"
  exit 1
fi

# Install
npm install -g github:nanaco666/monkey-agent

# Find npm global bin dir
NPM_BIN="$(npm prefix -g)/bin"

# Check if already in PATH
if echo ":$PATH:" | grep -q ":$NPM_BIN:"; then
  echo ""
  echo "✓ monkey installed and ready."
  echo ""
  echo "  Run: monkey"
  exit 0
fi

# Detect shell config file
detect_shell_config() {
  if [ -n "$ZSH_VERSION" ] || [ "$(basename "$SHELL" 2>/dev/null)" = "zsh" ]; then
    echo "$HOME/.zshrc"
  elif [ -n "$BASH_VERSION" ] || [ "$(basename "$SHELL" 2>/dev/null)" = "bash" ]; then
    if [ -f "$HOME/.bash_profile" ]; then
      echo "$HOME/.bash_profile"
    else
      echo "$HOME/.bashrc"
    fi
  else
    echo ""
  fi
}

SHELL_CONFIG="$(detect_shell_config)"
PATH_LINE="export PATH=\"$NPM_BIN:\$PATH\""

echo ""
echo "✓ Monkey Agent installed."
echo ""

# Try to write PATH to shell config
if [ -n "$SHELL_CONFIG" ]; then
  if [ -w "$SHELL_CONFIG" ]; then
    # Avoid duplicate entries
    if ! grep -qF "$NPM_BIN" "$SHELL_CONFIG" 2>/dev/null; then
      echo "" >> "$SHELL_CONFIG"
      echo "# Added by monkey-agent installer" >> "$SHELL_CONFIG"
      echo "$PATH_LINE" >> "$SHELL_CONFIG"
    fi
    export PATH="$NPM_BIN:$PATH"
    echo "✓ Added to PATH ($SHELL_CONFIG)"
    echo ""
    echo "  Run: monkey"
    echo "  (Or open a new terminal tab)"
  else
    echo "⚠ Could not update $SHELL_CONFIG (permission denied)."
    echo ""
    echo "  Add this line manually to $SHELL_CONFIG:"
    echo "    $PATH_LINE"
    echo ""
    echo "  Or run now (this session only):"
    echo "    export PATH=\"$NPM_BIN:\$PATH\""
  fi
else
  echo "  Add this to your shell config:"
  echo "    $PATH_LINE"
fi

echo ""
