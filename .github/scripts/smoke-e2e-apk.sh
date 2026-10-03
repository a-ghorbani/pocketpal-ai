#!/usr/bin/env bash

set -euo pipefail

APK="$GITHUB_WORKSPACE/apk/app-e2e-releaseE2e.apk"
PKG="com.pocketpalai.e2e"
COMP="$PKG/com.pocketpal.MainActivity"

test -s "$APK"
adb wait-for-device
adb shell input keyevent 82 || true
adb uninstall "$PKG" >/dev/null 2>&1 || true
timeout 300 adb install -t "$APK"

PACKAGE_PATH="$(adb shell pm path "$PKG" | tr -d '\r')"
if [[ "$PACKAGE_PATH" != package:* ]]; then
  echo "Package was not installed: $PACKAGE_PATH"
  exit 1
fi

adb logcat -c
adb shell am force-stop "$PKG"
START="$(
  timeout 90 adb shell am start -W \
    -a android.intent.action.MAIN \
    -c android.intent.category.LAUNCHER \
    -n "$COMP" | tr -d '\r'
)"
printf '%s\n' "$START"
grep -q '^Status: ok$' <<<"$START"

sleep 10
PID="$(adb shell pidof "$PKG" 2>/dev/null | tr -d '\r' || true)"
RESUMED="$(
  adb shell dumpsys activity activities |
    tr -d '\r' |
    grep -E 'topResumedActivity|mResumedActivity|ResumedActivity' ||
    true
)"
printf 'PACKAGE_PATH=%s\nPID=%s\nRESUMED=%s\n' \
  "$PACKAGE_PATH" "$PID" "$RESUMED"

if [[ -z "$PID" ]] || ! grep -Fq "$COMP" <<<"$RESUMED"; then
  adb shell dumpsys activity top || true
  adb logcat -d -t 300 '*:E' || true
  exit 1
fi

export E2E_DEVICE_NAME="github-actions-api-35"
export E2E_PLATFORM_VERSION="15"
export E2E_DEVICE_UDID="emulator-5554"
export E2E_APP_PATH="$APK"
export E2E_NO_RESET="false"
export E2E_FULL_RESET="true"

yarn --cwd "$GITHUB_WORKSPACE/e2e" test:remote-responses-fixture
yarn --cwd "$GITHUB_WORKSPACE/e2e" typecheck:remote-responses
yarn --cwd "$GITHUB_WORKSPACE/e2e" e2e:remote-responses:android
