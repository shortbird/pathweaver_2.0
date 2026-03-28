#!/usr/bin/env bash
#
# Mac Mini development setup for Optio Platform.
# Run this on a fresh Mac:
#   curl -O <url-to-this-file> && chmod +x mac-setup.sh && ./mac-setup.sh
#
# Or after cloning the repo:
#   chmod +x mac-setup.sh && ./mac-setup.sh
#
# What this installs:
#   - Xcode Command Line Tools (git, compilers)
#   - Homebrew (macOS package manager)
#   - VS Code (editor)
#   - Claude Code (AI CLI)
#   - Node.js 22 via nvm
#   - Python 3.13
#   - Android Studio (emulator + SDK)
#   - Maestro (E2E testing)
#   - Clones the repo & installs all dependencies
#
set -euo pipefail

REPO_URL="https://github.com/shortbird/pathweaver_2.0.git"
PROJECT_DIR="$HOME/Desktop/pw_v2"

echo ""
echo "============================================"
echo "  Optio Platform - Mac Mini Dev Setup"
echo "============================================"
echo ""

# ──────────────────────────────────────────────
# 1. Xcode Command Line Tools (provides git)
# ──────────────────────────────────────────────
echo "[1/9] Xcode Command Line Tools..."
if xcode-select -p &>/dev/null; then
  echo "  Already installed."
else
  echo "  Installing (this opens a system dialog -- click Install)..."
  xcode-select --install
  echo "  Waiting for installation to finish..."
  until xcode-select -p &>/dev/null; do sleep 5; done
  echo "  Done."
fi
echo ""

# ──────────────────────────────────────────────
# 2. Homebrew
# ──────────────────────────────────────────────
echo "[2/9] Homebrew..."
if command -v brew &>/dev/null; then
  echo "  Already installed: $(brew --version | head -1)"
else
  echo "  Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add to PATH for this session (Apple Silicon path)
  eval "$(/opt/homebrew/bin/brew shellenv)"
  # Add to shell profile permanently
  echo '' >> "$HOME/.zprofile"
  echo '# Homebrew' >> "$HOME/.zprofile"
  echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
  echo "  Done."
fi
# Ensure brew is in PATH for rest of script
eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || true
echo ""

# ──────────────────────────────────────────────
# 3. VS Code
# ──────────────────────────────────────────────
echo "[3/9] VS Code..."
if command -v code &>/dev/null; then
  echo "  Already installed."
elif [ -d "/Applications/Visual Studio Code.app" ]; then
  echo "  App exists, adding 'code' to PATH..."
  cat >> "$HOME/.zprofile" << 'VSCODE'

# VS Code
export PATH="$PATH:/Applications/Visual Studio Code.app/Contents/Resources/app/bin"
VSCODE
  export PATH="$PATH:/Applications/Visual Studio Code.app/Contents/Resources/app/bin"
else
  echo "  Installing via Homebrew..."
  brew install --cask visual-studio-code
  echo "  Done."
fi
echo ""

# ──────────────────────────────────────────────
# 4. Node.js via nvm
# ──────────────────────────────────────────────
echo "[4/9] Node.js via nvm..."
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  echo "  nvm already installed."
  source "$NVM_DIR/nvm.sh"
else
  echo "  Installing nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  source "$NVM_DIR/nvm.sh"
  echo "  Done."
fi

# Install project Node version
echo "  Installing Node 22.12.0 (from .nvmrc)..."
nvm install 22.12.0
nvm use 22.12.0
nvm alias default 22.12.0
echo "  Node $(node -v), npm $(npm -v)"
echo ""

# ──────────────────────────────────────────────
# 5. Python 3.13
# ──────────────────────────────────────────────
echo "[5/9] Python 3.13..."
if python3 --version 2>/dev/null | grep -q "3.13"; then
  echo "  Already installed: $(python3 --version)"
else
  echo "  Installing via Homebrew..."
  brew install python@3.13
  echo "  Done: $(python3 --version)"
fi
echo ""

# ──────────────────────────────────────────────
# 6. Android Studio
# ──────────────────────────────────────────────
echo "[6/9] Android Studio..."
if [ -d "/Applications/Android Studio.app" ]; then
  echo "  Already installed."
else
  echo "  Installing via Homebrew (this downloads ~1GB)..."
  brew install --cask android-studio
  echo "  Done."
  echo ""
  echo "  >>> IMPORTANT: Open Android Studio once to complete first-run setup."
  echo "  >>> It will install the SDK, emulator, and platform tools."
  echo "  >>> Then close it and re-run this script to continue."
  echo ""
fi

# Set ANDROID_HOME
export ANDROID_HOME="$HOME/Library/Android/sdk"
if [ -d "$ANDROID_HOME" ]; then
  # Add to profile if not already there
  if ! grep -q "ANDROID_HOME" "$HOME/.zprofile" 2>/dev/null; then
    cat >> "$HOME/.zprofile" << 'ANDROID'

# Android SDK
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
ANDROID
  fi
  export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
  echo "  ANDROID_HOME=$ANDROID_HOME"
else
  echo "  WARNING: SDK not found. Open Android Studio to complete setup, then re-run."
fi
echo ""

# ──────────────────────────────────────────────
# 7. Claude Code CLI
# ──────────────────────────────────────────────
echo "[7/9] Claude Code..."
if command -v claude &>/dev/null; then
  echo "  Already installed: $(claude --version 2>/dev/null || echo 'installed')"
else
  echo "  Installing via npm..."
  npm install -g @anthropic-ai/claude-code
  echo "  Done."
fi
echo ""

# ──────────────────────────────────────────────
# 8. Maestro CLI
# ──────────────────────────────────────────────
echo "[8/9] Maestro..."
if command -v maestro &>/dev/null; then
  echo "  Already installed: $(maestro --version 2>/dev/null | tail -1)"
else
  echo "  Installing..."
  curl -Ls "https://get.maestro.mobile.dev" | bash
  export PATH="$PATH:$HOME/.maestro/bin"
  echo "  Done."
fi
echo ""

# ──────────────────────────────────────────────
# 9. Clone repo & install dependencies
# ──────────────────────────────────────────────
echo "[9/9] Project setup..."

if [ -d "$PROJECT_DIR/.git" ]; then
  echo "  Repo already cloned at $PROJECT_DIR"
  cd "$PROJECT_DIR"
  git pull origin develop || true
else
  echo "  Cloning repo..."
  git clone "$REPO_URL" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
  git checkout develop
fi

# Backend venv + deps
echo "  Setting up Python backend..."
if [ ! -d "$PROJECT_DIR/venv" ]; then
  python3 -m venv "$PROJECT_DIR/venv"
fi
source "$PROJECT_DIR/venv/bin/activate"
pip install -q --upgrade pip
pip install -q -r "$PROJECT_DIR/requirements.txt"
deactivate
echo "  Backend deps installed."

# Frontend v2 deps
echo "  Installing frontend-v2 npm packages..."
cd "$PROJECT_DIR/frontend-v2"
npm install
echo "  Frontend deps installed."

# Frontend v1 deps (for running tests)
echo "  Installing frontend v1 npm packages..."
cd "$PROJECT_DIR/frontend"
npm install
echo "  Frontend v1 deps installed."

cd "$PROJECT_DIR"

echo ""
echo "============================================"
echo "  Setup complete!"
echo "============================================"
echo ""
echo "Project location: $PROJECT_DIR"
echo ""
echo "Quick start:"
echo "  cd $PROJECT_DIR"
echo "  code .                  # Open in VS Code"
echo "  claude                  # Open Claude Code"
echo ""
echo "Run backend:"
echo "  source venv/bin/activate"
echo "  python backend/app.py"
echo ""
echo "Run frontend v2 (web):"
echo "  cd frontend-v2 && npx expo start --web"
echo ""
echo "Run frontend v2 (mobile dev client):"
echo "  cd frontend-v2 && npx expo start --dev-client"
echo ""
echo "Remaining manual steps:"
echo "  1. Copy backend/.env from Windows machine (has API keys)"
echo "  2. Open Android Studio once for first-run SDK setup"
echo "  3. Run: cd frontend-v2 && ./maestro/setup-mac.sh"
echo "  4. Fill in passwords in frontend-v2/maestro/.env.maestro"
echo ""
echo "GitHub auth (first push/pull will prompt):"
echo "  Git Credential Manager handles this automatically."
echo "  If prompted, sign in via browser."
echo ""
