#!/bin/bash
# Run by the "Build llama.rn Metal kernels" script phase (ios/Podfile).
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <ggml/src dir> <kernel>..." >&2
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

air_dir="$DERIVED_FILE_DIR/rnllama-metal"
rm -rf "$air_dir"
mkdir -p "$air_dir/tensor"

# On tensor-API GPUs, ggml loads these from ggml-tensor.metallib over rnllama.metallib's.
tensor_kernels=(mul_mm fa_f16)
tensor_airs=("${tensor_kernels[@]/#/tensor/}")

# Paths go in as positional arguments: BSD xargs -I substitutes only into
# arguments of up to 255 bytes, which archive paths exceed.
ncpu=$(sysctl -n hw.ncpu 2>/dev/null || echo 4)
compiled=0
printf '%s\n' "$@" "${tensor_airs[@]}" | xargs -n 1 -P "$ncpu" sh -c '
  case $6 in
    tensor/*) target="-mtargetos=ios26.0$2 -DGGML_METAL_HAS_TENSOR" ;;
    *) target="-mtargetos=ios18.0$2" ;;
  esac
  xcrun -sdk "$1" metal -O3 $target -DGGML_METAL_HAS_BF16 \
    -I "$3" -I "$4" -c "$3/kernels/${6#tensor/}.metal" -o "$5/$6.air"
' _ "$PLATFORM_NAME" "$target_suffix" "$ggml_metal" "$ggml_src" "$air_dir" || compiled=$?

for air in "$@" "${tensor_airs[@]}"; do
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
link rnllama.metallib "$@"
link ggml-tensor.metallib "${tensor_airs[@]}"

dest="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
mv "$DERIVED_FILE_DIR/rnllama.metallib" "$DERIVED_FILE_DIR/ggml-tensor.metallib" "$dest/"
