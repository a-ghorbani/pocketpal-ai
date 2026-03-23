#!/usr/bin/env bash
#
# Memory Profiling Pipeline
#
# Orchestrates build, E2E memory profiling, and optional comparison.
#
# Usage:
#   ./scripts/memory-profile.sh --platform ios
#   ./scripts/memory-profile.sh --platform android --skip-build
#   ./scripts/memory-profile.sh --platform ios --baseline baselines/prev.json
#   ./scripts/memory-profile.sh --platform ios --model smollm2-135m
#
# Exit codes:
#   0 = success (or comparison passed)
#   1 = regression detected
#   2 = build/test error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Defaults
PLATFORM=""
SKIP_BUILD=false
BASELINE=""
MODEL=""
SPEC="specs/memory-profile.spec.ts"

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --platform ios|android   Target platform (required)
  --skip-build             Skip the build step
  --baseline <path>        Baseline report to compare against
  --model <id>             Model ID to test (default: smollm2-135m)
  -h, --help               Show this help

Examples:
  $(basename "$0") --platform ios
  $(basename "$0") --platform android --skip-build --baseline baselines/prev.json
EOF
  exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --baseline)
      BASELINE="$2"
      shift 2
      ;;
    --model)
      MODEL="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown option: $1"
      usage
      ;;
  esac
done

if [[ -z "$PLATFORM" ]]; then
  echo "Error: --platform is required"
  usage
fi

if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" ]]; then
  echo "Error: --platform must be 'ios' or 'android'"
  exit 2
fi

echo "=== Memory Profiling Pipeline ==="
echo "Platform: $PLATFORM"
echo "Skip build: $SKIP_BUILD"
echo "Baseline: ${BASELINE:-none}"
echo "Model: ${MODEL:-default}"
echo ""

cd "$PROJECT_DIR"

# Step 1: Build (unless skipped)
if [[ "$SKIP_BUILD" == "false" ]]; then
  echo "--- Building E2E app ---"
  if [[ "$PLATFORM" == "ios" ]]; then
    yarn ios:build:e2e
  else
    yarn android:build:e2e
  fi
  echo ""
fi

# Step 2: Run memory profile E2E spec
echo "--- Running memory profile spec ---"
E2E_ARGS="--spec $SPEC"

if [[ -n "$MODEL" ]]; then
  export TEST_MODELS="$MODEL"
fi

cd e2e
if [[ "$PLATFORM" == "ios" ]]; then
  npx wdio run wdio.ios.local.conf.ts $E2E_ARGS
else
  npx wdio run wdio.android.local.conf.ts $E2E_ARGS
fi
cd "$PROJECT_DIR"

# Step 3: Compare with baseline (if provided)
REPORT_PATH="e2e/debug-output/memory-profile.json"

if [[ ! -f "$REPORT_PATH" ]]; then
  echo "Error: Memory profile report not found at $REPORT_PATH"
  exit 2
fi

echo ""
echo "--- Memory profile report written to: $REPORT_PATH ---"

if [[ -n "$BASELINE" ]]; then
  echo ""
  echo "--- Comparing with baseline ---"
  npx ts-node scripts/memory-compare.ts "$BASELINE" "$REPORT_PATH"
  COMPARE_EXIT=$?

  if [[ $COMPARE_EXIT -eq 0 ]]; then
    echo "Comparison: PASS"
  elif [[ $COMPARE_EXIT -eq 1 ]]; then
    echo "Comparison: FAIL (regression detected)"
    exit 1
  else
    echo "Comparison: ERROR"
    exit 2
  fi
fi

echo ""
echo "=== Memory profiling complete ==="
