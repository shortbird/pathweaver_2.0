#!/usr/bin/env bash
#
# Mac Mini Self-Hosted CI Runner - Full Bootstrap
#
# This script sets up a fresh Mac Mini as a GitHub Actions self-hosted runner
# with Maestro E2E testing for web (Chromium) and mobile (iOS Simulator).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/shortbird/pathweaver_2.0/develop/scripts/mac-mini-bootstrap.sh | bash
#   -- OR --
#   git clone https://github.com/shortbird/pathweaver_2.0.git ~/optio && cd ~/optio && bash scripts/mac-mini-bootstrap.sh
#
# What requires manual input:
#   1. Apple ID (for Xcode / iOS Simulator) -- prompted during install
#   2. GitHub runner registration token -- prompted at the end
#
# Everything else is fully automated.
#
set -euo pipefail

# ── Configuration ──
REPO_URL="https://github.com/shortbird/pathweaver_2.0.git"
REPO_DIR="$HOME/optio"
RUNNER_DIR="$HOME/actions-runner"
PYTHON_VERSION="3.12"
NODE_VERSION="22"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

step() { echo -e "\n${BLUE}[$(date +%H:%M:%S)]${NC} ${GREEN}$1${NC}"; }
warn() { echo -e "${YELLOW}  WARNING: $1${NC}"; }
fail() { echo -e "${RED}  ERROR: $1${NC}"; exit 1; }

echo ""
echo "============================================="
echo "  Optio Mac Mini CI Runner - Full Bootstrap"
echo "============================================="
echo ""
echo "This will install:"
echo "  - Homebrew"
echo "  - Node.js $NODE_VERSION (via nvm)"
echo "  - Python $PYTHON_VERSION (via Homebrew)"
echo "  - Xcode Command Line Tools"
echo "  - iOS Simulator runtime"
echo "  - Maestro CLI"
echo "  - GitHub Actions self-hosted runner"
echo ""
echo "Press Enter to continue or Ctrl+C to cancel..."
read -r

# ══════════════════════════════════════════════
# 1. Homebrew
# ══════════════════════════════════════════════
step "1/10 Installing Homebrew..."
if command -v brew &>/dev/null; then
  echo "  Already installed: $(brew --version | head -1)"
else
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add to PATH for Apple Silicon
  if [[ $(uname -m) == "arm64" ]]; then
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
fi

# ══════════════════════════════════════════════
# 2. Core dependencies via Homebrew
# ══════════════════════════════════════════════
step "2/10 Installing core dependencies..."
brew install git python@${PYTHON_VERSION} jq wget curl 2>/dev/null || true
echo "  git: $(git --version)"
echo "  python: $(python3 --version)"

# ══════════════════════════════════════════════
# 3. Node.js via nvm
# ══════════════════════════════════════════════
step "3/10 Installing Node.js $NODE_VERSION via nvm..."
export NVM_DIR="$HOME/.nvm"
if [ ! -d "$NVM_DIR" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install "$NODE_VERSION" 2>/dev/null || true
nvm use "$NODE_VERSION"
nvm alias default "$NODE_VERSION"
echo "  node: $(node --version)"
echo "  npm: $(npm --version)"

# ══════════════════════════════════════════════
# 4. Xcode Command Line Tools
# ══════════════════════════════════════════════
step "4/10 Installing Xcode Command Line Tools..."
if xcode-select -p &>/dev/null; then
  echo "  Already installed: $(xcode-select -p)"
else
  xcode-select --install
  echo ""
  echo "  A dialog will appear. Click 'Install' and wait for it to complete."
  echo "  Press Enter when the installation is done..."
  read -r
fi

# ══════════════════════════════════════════════
# 5. Xcode + iOS Simulator
# ══════════════════════════════════════════════
step "5/10 Checking Xcode + iOS Simulator..."

# Check if full Xcode is installed (needed for iOS Simulator)
if [ -d "/Applications/Xcode.app" ]; then
  echo "  Xcode found: $(xcodebuild -version 2>/dev/null | head -1)"
  sudo xcodebuild -license accept 2>/dev/null || true
else
  echo ""
  echo "  ${YELLOW}Xcode is required for iOS Simulator testing.${NC}"
  echo ""
  echo "  Option A (recommended): Install from Mac App Store"
  echo "    - Open App Store, search 'Xcode', install (~12GB)"
  echo "    - After install, run: sudo xcodebuild -license accept"
  echo ""
  echo "  Option B: Install via 'xcodes' CLI"
  echo "    brew install xcodes"
  echo "    xcodes install --latest"
  echo ""
  echo "  After installing Xcode, re-run this script."
  echo "  Press Enter to continue WITHOUT iOS testing, or Ctrl+C to install Xcode first..."
  read -r
fi

# Install iOS Simulator runtime if Xcode is present
if [ -d "/Applications/Xcode.app" ]; then
  echo "  Checking iOS Simulator runtimes..."
  if xcrun simctl list runtimes 2>/dev/null | grep -q "iOS"; then
    echo "  iOS runtimes available:"
    xcrun simctl list runtimes 2>/dev/null | grep "iOS" | head -3
  else
    echo "  Installing iOS Simulator runtime..."
    xcodebuild -downloadPlatform iOS 2>/dev/null || {
      warn "Auto-download failed. Open Xcode > Settings > Platforms > iOS to install manually."
    }
  fi

  # Create a test simulator if it doesn't exist
  if xcrun simctl list devices 2>/dev/null | grep -q "Optio-E2E"; then
    echo "  Simulator 'Optio-E2E' already exists"
  else
    echo "  Creating 'Optio-E2E' simulator (iPhone 16)..."
    # Get the latest iOS runtime
    RUNTIME=$(xcrun simctl list runtimes 2>/dev/null | grep "iOS" | tail -1 | awk -F'- ' '{print $2}' | xargs)
    if [ -n "$RUNTIME" ]; then
      xcrun simctl create "Optio-E2E" "iPhone 16" "$RUNTIME" 2>/dev/null || {
        warn "Could not create simulator. You may need to create it manually via Xcode."
      }
    fi
  fi
fi

# ══════════════════════════════════════════════
# 6. Maestro CLI
# ══════════════════════════════════════════════
step "6/10 Installing Maestro CLI..."
if command -v maestro &>/dev/null || [ -f "$HOME/.maestro/bin/maestro" ]; then
  export PATH="$PATH:$HOME/.maestro/bin"
  echo "  Already installed: $(maestro --version 2>&1 | tail -1)"
else
  curl -Ls "https://get.maestro.mobile.dev" | bash
  export PATH="$PATH:$HOME/.maestro/bin"
  echo "  Installed: $(maestro --version 2>&1 | tail -1)"
fi

# ══════════════════════════════════════════════
# 7. Clone repository
# ══════════════════════════════════════════════
step "7/10 Cloning repository..."
if [ -d "$REPO_DIR/.git" ]; then
  echo "  Already cloned at $REPO_DIR"
  cd "$REPO_DIR" && git pull origin develop 2>/dev/null || true
else
  git clone "$REPO_URL" "$REPO_DIR"
fi
cd "$REPO_DIR"

# ══════════════════════════════════════════════
# 8. Install project dependencies
# ══════════════════════════════════════════════
step "8/10 Installing project dependencies..."

# Backend
echo "  Setting up Python venv..."
python3 -m venv "$REPO_DIR/venv"
source "$REPO_DIR/venv/bin/activate"
pip install -r "$REPO_DIR/backend/requirements.txt" --quiet 2>/dev/null || {
  warn "Some backend dependencies failed. Backend testing may be limited."
}

# Frontend v2
echo "  Installing frontend-v2 npm packages..."
cd "$REPO_DIR/frontend-v2"
npm ci --legacy-peer-deps 2>/dev/null || npm install --legacy-peer-deps 2>/dev/null

cd "$REPO_DIR"

# ══════════════════════════════════════════════
# 9. Environment file for E2E tests
# ══════════════════════════════════════════════
step "9/10 Creating environment config..."

ENV_FILE="$REPO_DIR/.env.ci"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" << 'ENVEOF'
# CI Environment - Mac Mini Runner
# Fill in these values after setup

# Supabase (point at dev or a dedicated test branch)
SUPABASE_URL=https://vvfgxcykxjybtvpfzwyx.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_KEY=<your-service-key>

# E2E Test User Credentials
E2E_STUDENT_EMAIL=test-student@example.com
E2E_STUDENT_PASSWORD=TestPass123!
E2E_PARENT_EMAIL=test-parent@example.com
E2E_PARENT_PASSWORD=TestPass123!
E2E_OBSERVER_EMAIL=test-observer@example.com
E2E_OBSERVER_PASSWORD=TestPass123!
E2E_ADVISOR_EMAIL=test-advisor@example.com
E2E_ADVISOR_PASSWORD=TestPass123!
E2E_ORGADMIN_EMAIL=org-admin@test-academy.com
E2E_ORGADMIN_PASSWORD=TestPass123!
E2E_SUPERADMIN_EMAIL=test-superadmin@optioeducation.com
E2E_SUPERADMIN_PASSWORD=TestPass123!

# Backend
FLASK_ENV=testing
DATABASE_URL=<your-database-url>

# API URL for frontend (local backend on Mac Mini)
EXPO_PUBLIC_API_URL=http://localhost:5001
ENVEOF
  echo "  Created $ENV_FILE -- FILL IN THE VALUES"
else
  echo "  $ENV_FILE already exists"
fi

# ══════════════════════════════════════════════
# 10. GitHub Actions Self-Hosted Runner
# ══════════════════════════════════════════════
step "10/10 Setting up GitHub Actions runner..."

if [ -d "$RUNNER_DIR" ] && [ -f "$RUNNER_DIR/.runner" ]; then
  echo "  Runner already configured"
else
  echo ""
  echo "  Go to: https://github.com/shortbird/pathweaver_2.0/settings/actions/runners/new"
  echo "  Select: macOS / ARM64"
  echo ""
  echo "  Copy the registration token from the 'Configure' section."
  echo "  It looks like: AXXXXXXXXXXXXXXXXXXXXXXXXXX"
  echo ""
  read -rp "  Paste the registration token here: " RUNNER_TOKEN

  if [ -z "$RUNNER_TOKEN" ]; then
    warn "No token provided. You can set up the runner manually later."
  else
    # Download runner
    mkdir -p "$RUNNER_DIR" && cd "$RUNNER_DIR"
    RUNNER_VERSION="2.322.0"
    RUNNER_ARCH=$(uname -m)
    if [[ "$RUNNER_ARCH" == "arm64" ]]; then
      RUNNER_FILE="actions-runner-osx-arm64-${RUNNER_VERSION}.tar.gz"
    else
      RUNNER_FILE="actions-runner-osx-x64-${RUNNER_VERSION}.tar.gz"
    fi

    if [ ! -f "$RUNNER_DIR/config.sh" ]; then
      curl -o "$RUNNER_FILE" -L "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_FILE}"
      tar xzf "$RUNNER_FILE"
      rm -f "$RUNNER_FILE"
    fi

    # Configure
    ./config.sh \
      --url "https://github.com/shortbird/pathweaver_2.0" \
      --token "$RUNNER_TOKEN" \
      --name "mac-mini-e2e" \
      --labels "self-hosted,macOS,ARM64,maestro" \
      --work "_work" \
      --replace

    # Install as a macOS service (auto-starts on boot)
    echo "  Installing runner as a background service..."
    sudo ./svc.sh install 2>/dev/null || {
      warn "Service install failed. You may need to run: cd $RUNNER_DIR && sudo ./svc.sh install"
    }
    sudo ./svc.sh start 2>/dev/null || {
      warn "Service start failed. You may need to run: cd $RUNNER_DIR && sudo ./svc.sh start"
    }

    cd "$REPO_DIR"
  fi
fi

# ══════════════════════════════════════════════
# Shell profile additions
# ══════════════════════════════════════════════
step "Updating shell profile..."

PROFILE="$HOME/.zprofile"
ADDITIONS='
# Optio CI Runner
export PATH="$PATH:$HOME/.maestro/bin"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
'

if ! grep -q "Optio CI Runner" "$PROFILE" 2>/dev/null; then
  echo "$ADDITIONS" >> "$PROFILE"
  echo "  Added PATH entries to $PROFILE"
else
  echo "  Profile already configured"
fi

# ══════════════════════════════════════════════
# Done
# ══════════════════════════════════════════════
echo ""
echo "============================================="
echo "  ${GREEN}Bootstrap Complete${NC}"
echo "============================================="
echo ""
echo "Remaining manual steps:"
echo ""
echo "  1. Fill in credentials:"
echo "     ${YELLOW}nano $REPO_DIR/.env.ci${NC}"
echo ""
echo "  2. If you skipped Xcode:"
echo "     Install from App Store, then re-run this script"
echo ""
echo "  3. Create auth.users for test accounts in Supabase Dashboard:"
echo "     https://supabase.com/dashboard/project/vvfgxcykxjybtvpfzwyx/auth/users"
echo "     Add each test user with 'Auto Confirm' checked"
echo ""
echo "  4. Run the seed SQL to set up test data:"
echo "     ${YELLOW}psql \$DATABASE_URL -f supabase/seed.sql${NC}"
echo ""
echo "  5. Verify the runner is connected:"
echo "     https://github.com/shortbird/pathweaver_2.0/settings/actions/runners"
echo ""
echo "  6. Test locally:"
echo "     ${YELLOW}cd $REPO_DIR && bash scripts/run-e2e-local.sh smoke${NC}"
echo ""
