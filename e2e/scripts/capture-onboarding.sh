#!/usr/bin/env bash
# Drive the three onboarding capture passes (light, dark, rtl-he) against
# the booted iPhone 17 Pro simulator. Idempotent: each pass uninstalls
# the app first, sets the OS appearance / locale, then runs the spec.
#
# Run from the worktree root.

set -euo pipefail

UDID="${E2E_DEVICE_UDID:-E91D608C-FC2D-4660-9C73-0DB732C84626}"
BUNDLE="ai.pocketpal"

reset_app() {
  xcrun simctl uninstall "$UDID" "$BUNDLE" >/dev/null 2>&1 || true
  # Clear any per-app NSUserDefaults that might survive the uninstall.
  xcrun simctl spawn "$UDID" defaults delete "$BUNDLE" >/dev/null 2>&1 || true
}

set_appearance() {
  xcrun simctl ui "$UDID" appearance "$1"
}

set_locale() {
  # Device-wide locale; takes effect on next app launch.
  local lang="$1"
  xcrun simctl spawn "$UDID" defaults write -g AppleLanguages -array "$lang" "en"
  case "$lang" in
    he) xcrun simctl spawn "$UDID" defaults write -g AppleLocale -string "he_IL" ;;
    en) xcrun simctl spawn "$UDID" defaults write -g AppleLocale -string "en_US" ;;
  esac
}

run_pass() {
  local label="$1"
  echo "=== capture pass: $label ==="
  reset_app
  VISUAL_CAPTURE_LABEL="$label" \
    npx ts-node e2e/scripts/run-e2e.ts --platform ios \
      --spec visual-capture/TASK-20260526-1731 \
      --devices iphone-17-pro-sim --skip-build
}

# Pass 1: light + en
set_appearance light
set_locale en
run_pass light

# Pass 2: dark + en
set_appearance dark
set_locale en
run_pass dark

# Pass 3: light + he (RTL)
set_appearance light
set_locale he
run_pass rtl-he

# Restore defaults
set_appearance light
set_locale en

echo "captures done — see e2e/debug-output/screenshots/visual-captures/TASK-20260526-1731/"
