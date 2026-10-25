#!/bin/bash
# Checks that an iOS .app carries llama.rn's and whisper.rn's precompiled Metal
# libraries where their ggml copies look them up, no other .metallib, and no
# rnwhisper.framework.
set -uo pipefail

usage() {
  echo "usage: $0 <path/PocketPal.app> [--require-marker]" >&2
  exit 64
}

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || usage
app=${1%/}
require_marker=false
if [ "$#" -eq 2 ]; then
  [ "$2" = --require-marker ] || usage
  require_marker=true
fi
exe="$app/$(basename "$app" .app)"

failed=0
check() {
  local name=$1
  shift
  if "$@"; then
    echo "ok   $name"
  else
    echo "FAIL $name"
    failed=1
  fi
}

only_known_metallibs() {
  local lib extra=0
  for lib in "$app"/*.metallib; do
    [ -e "$lib" ] || continue
    case $(basename "$lib") in
      rnllama.metallib | ggml-tensor.metallib | default.metallib) ;;
      *)
        echo "  unexpected $(basename "$lib")" >&2
        extra=1
        ;;
    esac
  done
  [ "$extra" -eq 0 ]
}

no_embedded_library() {
  local load_commands
  [ -f "$exe" ] || return 1
  load_commands=$(otool -l "$exe") || return 1
  ! awk '$1 == "sectname" && $2 == "__ggml_metallib" { found = 1 } END { exit !found }' <<<"$load_commands"
}

has_core_marker() {
  local symbols
  [ -f "$exe" ] || return 1
  symbols=$(nm -U "$exe") || return 1
  awk '$NF == "_rnllama_patch_abort_v3" { found = 1 } END { exit !found }' <<<"$symbols"
}

check "app bundle $app" test -d "$app"
check "executable $exe" test -f "$exe"
check "rnllama.metallib at the .app root" test -f "$app/rnllama.metallib"
check "ggml-tensor.metallib at the .app root" test -f "$app/ggml-tensor.metallib"
check "default.metallib at the .app root" test -f "$app/default.metallib"
check "no .metallib other than those three at the .app root" only_known_metallibs
check "no Frameworks/rnwhisper.framework in the .app" test ! -e "$app/Frameworks/rnwhisper.framework"
check "no __ggml_metallib section in the executable" no_embedded_library
if $require_marker; then
  check "core patch marker _rnllama_patch_abort_v3 in the executable" has_core_marker
fi

exit $failed
