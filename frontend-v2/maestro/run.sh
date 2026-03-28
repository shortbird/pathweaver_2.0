#!/usr/bin/env bash
#
# Run Maestro E2E flows for frontend-v2.
#
# Usage:
#   ./maestro/run.sh                           # Run all flows
#   ./maestro/run.sh dashboard                 # Run all dashboard flows
#   ./maestro/run.sh dashboard/full-dashboard-smoke.yaml  # Run one flow
#
# Prerequisites:
#   1. Maestro CLI installed: $HOME/.maestro/bin/maestro --version
#   2. Java available (Android Studio JBR or standalone JDK)
#   3. Passwords filled in maestro/.env.maestro
#   4. Emulator running OR physical device connected (adb devices)
#   5. Backend running on :5001
#   6. Expo dev server running: npx expo start --dev-client
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Add Maestro to PATH
export PATH="$PATH:$HOME/.maestro/bin"

# Use Android Studio bundled Java if system Java is missing
if ! command -v java &>/dev/null; then
  STUDIO_JBR="/c/Program Files/Android/Android Studio/jbr"
  if [ -d "$STUDIO_JBR" ]; then
    export JAVA_HOME="$STUDIO_JBR"
    export PATH="$JAVA_HOME/bin:$PATH"
    echo "[maestro] Using Android Studio JBR: $(java -version 2>&1 | head -1)"
  else
    echo "[maestro] ERROR: Java not found. Install JDK or Android Studio."
    exit 1
  fi
fi

# Load test credentials
ENV_FILE="$SCRIPT_DIR/.env.maestro"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  echo "[maestro] Loaded credentials from .env.maestro"
else
  echo "[maestro] WARNING: $ENV_FILE not found. Env vars must be set manually."
fi

# Check required vars
for var in E2E_STUDENT_EMAIL E2E_STUDENT_PASSWORD; do
  if [ -z "${!var:-}" ]; then
    echo "[maestro] ERROR: $var is not set. Fill in maestro/.env.maestro"
    exit 1
  fi
done

# Check device/emulator
if ! adb devices 2>/dev/null | grep -q "device$"; then
  echo "[maestro] WARNING: No Android device/emulator detected. Run:"
  echo "           emulator @maestro-test"
  echo "         or connect a physical device via USB."
fi

# Determine what to run
FLOW_TARGET="${1:-}"
if [ -z "$FLOW_TARGET" ]; then
  FLOW_PATH="$SCRIPT_DIR/flows/"
elif [ -d "$SCRIPT_DIR/flows/$FLOW_TARGET" ]; then
  FLOW_PATH="$SCRIPT_DIR/flows/$FLOW_TARGET/"
elif [ -f "$SCRIPT_DIR/flows/$FLOW_TARGET" ]; then
  FLOW_PATH="$SCRIPT_DIR/flows/$FLOW_TARGET"
else
  echo "[maestro] ERROR: Not found: flows/$FLOW_TARGET"
  exit 1
fi

echo "[maestro] Running: $FLOW_PATH"
echo ""

maestro test "$FLOW_PATH"
