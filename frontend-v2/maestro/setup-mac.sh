#!/usr/bin/env bash
#
# One-time setup for Maestro E2E on Mac Mini (Apple Silicon).
# Run from the frontend-v2 directory:
#   chmod +x maestro/setup-mac.sh && ./maestro/setup-mac.sh
#
set -euo pipefail

echo "=== Maestro E2E Setup for macOS (Apple Silicon) ==="
echo ""

# 1. Install Maestro CLI
if command -v maestro &>/dev/null; then
  echo "[1/5] Maestro already installed: $(maestro --version 2>/dev/null | tail -1)"
else
  echo "[1/5] Installing Maestro CLI..."
  curl -Ls "https://get.maestro.mobile.dev" | bash
  export PATH="$PATH:$HOME/.maestro/bin"
  echo "  Installed: $(maestro --version 2>/dev/null | tail -1)"
fi
echo ""

# 2. Check for Android Studio / SDK
ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [ ! -d "$ANDROID_HOME" ]; then
  echo "[2/5] ERROR: Android Studio SDK not found at $ANDROID_HOME"
  echo "  Install Android Studio from: https://developer.android.com/studio"
  echo "  Then re-run this script."
  exit 1
fi
echo "[2/5] Android SDK found: $ANDROID_HOME"
echo ""

# 3. Install system image (ARM64 for Apple Silicon)
SYSIMG="system-images;android-34;google_apis;arm64-v8a"
SYSIMG_DIR="$ANDROID_HOME/system-images/android-34/google_apis/arm64-v8a"
if [ -d "$SYSIMG_DIR" ]; then
  echo "[3/5] System image already installed"
else
  echo "[3/5] Installing Android 34 ARM64 system image..."
  yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "$SYSIMG" 2>&1 || {
    echo "  sdkmanager failed. Install via Android Studio:"
    echo "  Settings > Android SDK > SDK Platforms > Android 14 > Google APIs ARM 64 System Image"
    exit 1
  }
fi
echo ""

# 4. Create AVD
if "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" list avd 2>/dev/null | grep -q "maestro-test"; then
  echo "[4/5] AVD 'maestro-test' already exists"
else
  echo "[4/5] Creating AVD 'maestro-test'..."
  echo "no" | "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd \
    -n maestro-test \
    -k "$SYSIMG" \
    -d pixel_7 \
    --force
  echo "  AVD created."
fi
echo ""

# 5. Install APK on running emulator
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APK="$SCRIPT_DIR/optio-dev.apk"
if [ ! -f "$APK" ]; then
  echo "[5/5] WARNING: optio-dev.apk not found in maestro/"
  echo "  Copy it from your Windows machine or download from EAS:"
  echo "  curl -L 'https://expo.dev/artifacts/eas/uXNABbukA66W8LJMYm3CBa.apk' -o maestro/optio-dev.apk"
else
  if adb devices 2>/dev/null | grep -q "emulator.*device$"; then
    echo "[5/5] Installing APK on emulator..."
    adb install -r "$APK"
    echo "  APK installed."
  else
    echo "[5/5] No emulator running. Start it first:"
    echo "  $ANDROID_HOME/emulator/emulator @maestro-test &"
    echo "  Then run: adb install maestro/optio-dev.apk"
  fi
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "To run E2E tests:"
echo "  1. Fill in passwords in maestro/.env.maestro"
echo "  2. Start the emulator:  $ANDROID_HOME/emulator/emulator @maestro-test &"
echo "  3. Start the backend:   (on your Windows machine or locally)"
echo "  4. Start Expo dev:      npx expo start --dev-client"
echo "  5. Run flows:           ./maestro/run.sh dashboard"
echo ""
