#!/bin/bash
# Checks that an iOS .app carries both of llama.rn's Metal delivery paths where
# ggml looks them up (rnllama.metallib, and the kernel sources tensor GPUs
# compile), and no .metallib that whisper.rn would load in their place.
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

repo_root=$(cd "$(dirname "$0")/.." && pwd)
ggml_src=$(cd "$repo_root" && node -p \
  'require("path").join(require("path").dirname(require.resolve("llama.rn/package.json")), "vendor/llama.cpp/ggml/src")' \
  2>/dev/null) || ggml_src=""
ggml_metal="$ggml_src/ggml-metal"

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

llama_rn_sources_found() {
  [ -n "$ggml_src" ] && [ -d "$ggml_metal/kernels" ]
}

kernel_sources_match() {
  llama_rn_sources_found && [ -d "$app/kernels" ] && diff -rq "$ggml_metal/kernels" "$app/kernels" >&2
}

root_copy_matches() {
  llama_rn_sources_found && cmp -s "$1" "$app/$(basename "$1")"
}

only_rnllama_metallib() {
  local lib extra=0
  for lib in "$app"/*.metallib; do
    [ -e "$lib" ] || continue
    if [ "$(basename "$lib")" != rnllama.metallib ]; then
      echo "  unexpected $(basename "$lib")" >&2
      extra=1
    fi
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
check "llama.rn kernel sources found in node_modules" llama_rn_sources_found
check "rnllama.metallib at the .app root" test -f "$app/rnllama.metallib"
check "kernels/ matches llama.rn's ggml-metal/kernels" kernel_sources_match
check "ggml-metal-impl.h at the .app root" root_copy_matches "$ggml_metal/ggml-metal-impl.h"
check "ggml-common.h at the .app root" root_copy_matches "$ggml_src/ggml-common.h"
check "no .metallib other than rnllama.metallib at the .app root" only_rnllama_metallib
check "no __ggml_metallib section in the executable" no_embedded_library
if $require_marker; then
  check "core patch marker _rnllama_patch_abort_v3 in the executable" has_core_marker
fi

exit $failed
