#!/usr/bin/env bash
#
# Run Maestro E2E tests locally on Mac Mini.
# Starts backend + frontend, runs tests, then cleans up.
#
# Usage:
#   ./scripts/run-e2e-local.sh              # Run smoke suite
#   ./scripts/run-e2e-local.sh smoke        # Run smoke suite
#   ./scripts/run-e2e-local.sh core         # Run core suite
#   ./scripts/run-e2e-local.sh invitations  # Run invitation flows
#   ./scripts/run-e2e-local.sh full-web     # Run all web flows
#   ./scripts/run-e2e-local.sh full-mobile  # Run all mobile flows (needs simulator)
#   ./scripts/run-e2e-local.sh flows/auth/  # Run specific directory
#   ./scripts/run-e2e-local.sh flows/auth/login-as-student.yaml  # Run one flow
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MAESTRO_DIR="$PROJECT_DIR/frontend-v2/maestro"
SUITE="${1:-smoke}"

export PATH="$PATH:$HOME/.maestro/bin"

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Load env
ENV_FILE="$PROJECT_DIR/.env.ci"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

# Also load maestro-specific env
MAESTRO_ENV="$MAESTRO_DIR/.env.maestro"
if [ -f "$MAESTRO_ENV" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$MAESTRO_ENV"
  set +a
fi

# ── Cleanup function ──
BACKEND_PID=""
FRONTEND_PID=""
cleanup() {
  echo ""
  echo "[e2e] Cleaning up..."
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  # Kill anything on the ports
  lsof -ti:5001 | xargs kill -9 2>/dev/null || true
  lsof -ti:8081 | xargs kill -9 2>/dev/null || true
}
trap cleanup EXIT

# ── Start backend ──
echo "[e2e] Starting backend on :5001..."
cd "$PROJECT_DIR"
source "$PROJECT_DIR/venv/bin/activate" 2>/dev/null || true
python backend/app.py > /tmp/optio-backend.log 2>&1 &
BACKEND_PID=$!

# ── Start frontend (web) ──
echo "[e2e] Starting frontend-v2 web on :8081..."
cd "$PROJECT_DIR/frontend-v2"
npx expo start --web --port 8081 --non-interactive > /tmp/optio-frontend.log 2>&1 &
FRONTEND_PID=$!

# ── Wait for servers ──
echo "[e2e] Waiting for servers..."
for i in $(seq 1 30); do
  if curl -s http://localhost:5001/api/health > /dev/null 2>&1; then
    echo "[e2e] Backend ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[e2e] ERROR: Backend failed to start. Check /tmp/optio-backend.log"
    cat /tmp/optio-backend.log | tail -20
    exit 1
  fi
  sleep 2
done

for i in $(seq 1 30); do
  if curl -s http://localhost:8081 > /dev/null 2>&1; then
    echo "[e2e] Frontend ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[e2e] ERROR: Frontend failed to start. Check /tmp/optio-frontend.log"
    cat /tmp/optio-frontend.log | tail -20
    exit 1
  fi
  sleep 2
done

echo "[e2e] Both servers running"

# ── Determine what to run ──
cd "$PROJECT_DIR"

resolve_flows() {
  local suite="$1"
  case "$suite" in
    smoke)
      echo "$MAESTRO_DIR/suites/smoke.yaml"
      ;;
    core)
      echo "$MAESTRO_DIR/suites/core.yaml"
      ;;
    invitations)
      echo "$MAESTRO_DIR/suites/invitations.yaml"
      ;;
    full-web)
      echo "$MAESTRO_DIR/suites/full-web.yaml"
      ;;
    full-mobile)
      echo "$MAESTRO_DIR/suites/full-mobile.yaml"
      ;;
    flows/*)
      # Direct path to a flow file or directory
      echo "$MAESTRO_DIR/$suite"
      ;;
    *)
      # Try as a directory under flows/
      if [ -d "$MAESTRO_DIR/flows/$suite" ]; then
        echo "$MAESTRO_DIR/flows/$suite/"
      elif [ -f "$MAESTRO_DIR/flows/$suite" ]; then
        echo "$MAESTRO_DIR/flows/$suite"
      elif [ -f "$MAESTRO_DIR/suites/$suite.yaml" ]; then
        echo "$MAESTRO_DIR/suites/$suite.yaml"
      else
        echo "[e2e] ERROR: Unknown suite or path: $suite" >&2
        exit 1
      fi
      ;;
  esac
}

FLOW_PATH=$(resolve_flows "$SUITE")

if [ ! -e "$FLOW_PATH" ]; then
  echo "[e2e] Suite file not found: $FLOW_PATH"
  echo "[e2e] Available suites: smoke, core, invitations, full-web, full-mobile"
  echo "[e2e] Or pass a path like: flows/auth/ or flows/auth/login-as-student.yaml"
  exit 1
fi

# ── Run Maestro ──
echo ""
echo "[e2e] Running: $SUITE"
echo "[e2e] Target: $FLOW_PATH"
echo ""

maestro test \
  "$FLOW_PATH" \
  --format junit \
  --output "$PROJECT_DIR/maestro-report.xml" \
  --env E2E_STUDENT_EMAIL="${E2E_STUDENT_EMAIL:-}" \
  --env E2E_STUDENT_PASSWORD="${E2E_STUDENT_PASSWORD:-}" \
  --env E2E_PARENT_EMAIL="${E2E_PARENT_EMAIL:-}" \
  --env E2E_PARENT_PASSWORD="${E2E_PARENT_PASSWORD:-}" \
  --env E2E_OBSERVER_EMAIL="${E2E_OBSERVER_EMAIL:-}" \
  --env E2E_OBSERVER_PASSWORD="${E2E_OBSERVER_PASSWORD:-}" \
  --env E2E_ADVISOR_EMAIL="${E2E_ADVISOR_EMAIL:-}" \
  --env E2E_ADVISOR_PASSWORD="${E2E_ADVISOR_PASSWORD:-}" \
  --env E2E_ORGADMIN_EMAIL="${E2E_ORGADMIN_EMAIL:-}" \
  --env E2E_ORGADMIN_PASSWORD="${E2E_ORGADMIN_PASSWORD:-}" \
  --env E2E_SUPERADMIN_EMAIL="${E2E_SUPERADMIN_EMAIL:-}" \
  --env E2E_SUPERADMIN_PASSWORD="${E2E_SUPERADMIN_PASSWORD:-}"

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "[e2e] ALL TESTS PASSED"
else
  echo "[e2e] SOME TESTS FAILED (exit code: $EXIT_CODE)"
  echo "[e2e] Report: $PROJECT_DIR/maestro-report.xml"
fi

exit $EXIT_CODE
