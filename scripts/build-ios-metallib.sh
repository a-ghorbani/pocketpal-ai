#!/bin/bash
# Run by the "Build llama.rn Metal kernels" and "Build whisper.rn Metal kernels"
# script phases (ios/Podfile).
set -euo pipefail

mode=llama
macro_prefix=GGML
air_name=rnllama-metal
library=rnllama.metallib
if [ "${1:-}" = --whisper ]; then
  shift
  mode=whisper
  macro_prefix=WSP_GGML
  air_name=whisper-metal
  library=default.metallib
fi

if [ "$#" -lt 2 ]; then
  echo "usage: $0 [--whisper] <ggml/src dir> <kernel>..." >&2
  exit 64
fi

ggml_src=$1
shift
ggml_metal="$ggml_src/ggml-metal"

if ! xcrun -sdk "$PLATFORM_NAME" metal -v >/dev/null 2>&1; then
  echo "error: no Metal compiler for $PLATFORM_NAME; install it with: xcodebuild -downloadComponent MetalToolchain" >&2
  exit 1
fi

target_suffix=""
if [ "$PLATFORM_NAME" = iphonesimulator ]; then
  target_suffix="-simulator"
fi

air_dir="$DERIVED_FILE_DIR/$air_name"
rm -rf "$air_dir"
mkdir -p "$air_dir/tensor"

airs=("$@")
if [ "$mode" = llama ]; then
  # On tensor-API GPUs, ggml loads these from ggml-tensor.metallib over rnllama.metallib's.
  tensor_airs=(tensor/mul_mm tensor/fa_f16)
  airs+=("${tensor_airs[@]}")
fi

# Paths go in as positional arguments: BSD xargs -I substitutes only into
# arguments of up to 255 bytes, which archive paths exceed.
ncpu=$(sysctl -n hw.ncpu 2>/dev/null || echo 4)
compiled=0
printf '%s\n' "${airs[@]}" | xargs -n 1 -P "$ncpu" sh -c '
  case $7 in
    tensor/*) target="-mtargetos=ios26.0$2 -DGGML_METAL_HAS_TENSOR" ;;
    *) target="-mtargetos=ios18.0$2" ;;
  esac
  xcrun -sdk "$1" metal -O3 $target "-D${6}_METAL_HAS_BF16" \
    -I "$3" -I "$4" -c "$3/kernels/${7#tensor/}.metal" -o "$5/$7.air"
' _ "$PLATFORM_NAME" "$target_suffix" "$ggml_metal" "$ggml_src" "$air_dir" "$macro_prefix" || compiled=$?

for air in "${airs[@]}"; do
  if [ ! -f "$air_dir/$air.air" ]; then
    echo "error: compiling ${air#tensor/}.metal produced no $air_dir/$air.air" >&2
    if [ "$air" != "${air#tensor/}" ]; then
      echo "error: the tensor API kernels need Xcode 26.6 or later" >&2
    fi
    exit 1
  fi
done
[ "$compiled" -eq 0 ] || exit "$compiled"

link() {
  local lib=$1 air airs=()
  shift
  for air in "$@"; do
    airs+=("$air_dir/$air.air")
  done
  xcrun -sdk "$PLATFORM_NAME" metallib "${airs[@]}" -o "$DERIVED_FILE_DIR/$lib"
}
libraries=("$library")
link "$library" "$@"
if [ "$mode" = llama ]; then
  link ggml-tensor.metallib "${tensor_airs[@]}"
  libraries+=(ggml-tensor.metallib)
fi

dest="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
mkdir -p "$dest"
mv "${libraries[@]/#/$DERIVED_FILE_DIR/}" "$dest/"
