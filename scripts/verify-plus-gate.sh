#!/bin/bash
# Checks the JS bundle of an .apk, .aab, .ipa or .app for the PLUS_STORE_GATE
# marker: --gated requires it, --ungated requires its absence.
set -uo pipefail

MARKER=PLUS_STORE_GATE_ON

usage() {
  echo "usage: $0 <artifact.apk|.aab|.ipa|.app> --gated|--ungated" >&2
  exit 64
}

[ "$#" -eq 2 ] || usage
artifact=${1%/}
mode=$2
case $mode in
  --gated | --ungated) ;;
  *) usage ;;
esac

fail() {
  echo "FAIL $mode $artifact: $1" >&2
  if [ "$mode" = --gated ]; then
    echo "The store gate is off: bundle with PLUS_STORE_GATE=true." >&2
  else
    echo "The store gate is on: bundle without PLUS_STORE_GATE." >&2
  fi
  exit 1
}

work=$(mktemp -d) || fail "cannot create a temp directory"
trap 'rm -rf "$work"' EXIT
bundle="$work/bundle"

extract_zip_entry() {
  local entry=$1
  [ -f "$artifact" ] || fail "artifact not found"
  unzip -Z1 "$artifact" >"$work/listing" 2>/dev/null || fail "cannot list the archive"
  grep -qxF "$entry" "$work/listing" || fail "bundle $entry not found"
  unzip -p "$artifact" "$entry" >"$bundle" 2>/dev/null || fail "cannot extract $entry"
  bundle_path=$entry
}

case $artifact in
  *.apk) extract_zip_entry assets/index.android.bundle ;;
  *.aab) extract_zip_entry base/assets/index.android.bundle ;;
  *.ipa)
    [ -f "$artifact" ] || fail "artifact not found"
    unzip -Z1 "$artifact" >"$work/listing" 2>/dev/null || fail "cannot list the archive"
    entry=$(grep -m1 -E '^Payload/[^/]+\.app/main\.jsbundle$' "$work/listing")
    [ -n "$entry" ] || fail "bundle Payload/*.app/main.jsbundle not found"
    extract_zip_entry "$entry"
    ;;
  *.app)
    bundle_path="$artifact/main.jsbundle"
    [ -f "$bundle_path" ] || fail "bundle $bundle_path not found"
    cp "$bundle_path" "$bundle" || fail "cannot read $bundle_path"
    ;;
  *) fail "unknown artifact type, expected .apk, .aab, .ipa or .app" ;;
esac

[ -s "$bundle" ] || fail "bundle $bundle_path is empty"

if LC_ALL=C grep -aqF "$MARKER" "$bundle"; then
  found=true
else
  found=false
fi

if [ "$mode" = --gated ] && ! $found; then
  fail "marker $MARKER not in $bundle_path"
fi
if [ "$mode" = --ungated ] && $found; then
  fail "marker $MARKER found in $bundle_path"
fi

echo "ok   $mode $artifact ($bundle_path)"
