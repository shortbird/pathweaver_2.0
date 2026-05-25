#!/usr/bin/env bash
# Inject a push notification into the booted iOS simulator.
#
# iOS Simulator can't receive real APNs pushes from Expo/Apple, but
# `xcrun simctl push` lets you hand-deliver an APNs-shaped payload
# locally — useful for verifying the OS banner, tap, and deep-link
# behaviour without a physical device.
#
# Usage:
#   ./scripts/test-push-ios-sim.sh                          # default test payload
#   ./scripts/test-push-ios-sim.sh "Title" "Body" /link/path # custom
#   ./scripts/test-push-ios-sim.sh -f payload.json           # raw APNs JSON file
#
# Defaults: title="Test push", body="Tap me to open the Journal",
# deep-link="/(app)/(tabs)/journal"

set -euo pipefail

BUNDLE_ID="com.optioeducation.optio"

# Find the booted iOS sim. If multiple are booted, take the first one.
DEVICE_UDID="$(xcrun simctl list devices booted -j \
  | python3 -c '
import json, sys
data = json.load(sys.stdin)
for runtime, devices in data["devices"].items():
    for d in devices:
        if d.get("state") == "Booted" and "iphonesimulator" in runtime.lower() or "iOS" in runtime:
            print(d["udid"])
            sys.exit(0)
sys.exit(1)
' || true)"

if [[ -z "${DEVICE_UDID}" ]]; then
  echo "No booted iOS simulator found." >&2
  echo "Boot one with: xcrun simctl boot 'iPhone 17 Pro'" >&2
  exit 1
fi

echo "Targeting sim: ${DEVICE_UDID}"

# Raw-file mode (-f path/to/payload.json)
if [[ "${1:-}" == "-f" ]]; then
  PAYLOAD_FILE="${2:?usage: $0 -f payload.json}"
  if [[ ! -f "${PAYLOAD_FILE}" ]]; then
    echo "Payload file not found: ${PAYLOAD_FILE}" >&2
    exit 1
  fi
  xcrun simctl push "${DEVICE_UDID}" "${BUNDLE_ID}" "${PAYLOAD_FILE}"
  echo "Pushed ${PAYLOAD_FILE} to ${BUNDLE_ID}."
  exit 0
fi

TITLE="${1:-Test push}"
BODY="${2:-Tap me to open the Journal}"
DEEP_LINK="${3:-/(app)/(tabs)/journal}"

# Inline JSON payload. Expo deep-link routing reads `data.url` or `data.link`
# in the notification — see frontend-v2/src/services/pushNotifications.ts.
TMP_PAYLOAD="$(mktemp -t optio-push.XXXXXX.json)"
trap 'rm -f "${TMP_PAYLOAD}"' EXIT

cat > "${TMP_PAYLOAD}" <<EOF
{
  "Simulator Target Bundle": "${BUNDLE_ID}",
  "aps": {
    "alert": {
      "title": "${TITLE}",
      "body": "${BODY}"
    },
    "sound": "default",
    "badge": 1
  },
  "url": "${DEEP_LINK}"
}
EOF

xcrun simctl push "${DEVICE_UDID}" "${BUNDLE_ID}" "${TMP_PAYLOAD}"
echo "Pushed '${TITLE}' → ${DEEP_LINK}"
