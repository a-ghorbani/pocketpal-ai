#!/bin/bash
# Run by the "Compile llama.rn Metal libraries" script phase (ios/Podfile).
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

sdk_version=$(xcrun -sdk "$PLATFORM_NAME" --show-sdk-version)
if [ "${sdk_version%%.*}" -lt 26 ]; then
  echo "error: $PLATFORM_NAME SDK $sdk_version is older than 26; rnllama-tensor.metallib needs the iOS 26 SDK" >&2
  exit 1
fi

target_suffix=""
if [ "$PLATFORM_NAME" = iphonesimulator ]; then
  target_suffix="-simulator"
fi

air_dir="$DERIVED_FILE_DIR/rnllama-metal"
mkdir -p "$air_dir"

compile() {
  local source=$1 air=$2
  shift 2
  xcrun -sdk "$PLATFORM_NAME" metal "$@" -I "$ggml_metal" -I "$ggml_src" \
    -c "$ggml_metal/kernels/$source.metal" -o "$air_dir/$air.air"
}

airs=()
for kernel in "$@"; do
  compile "$kernel" "$kernel" -O3 "-mtargetos=ios18.0$target_suffix" -DGGML_METAL_HAS_BF16
  airs+=("$air_dir/$kernel.air")
done

for kernel in mul_mm fa_f16; do
  compile "$kernel" "${kernel}_tensor" -O3 "-mtargetos=ios26.0$target_suffix" \
    -DGGML_METAL_HAS_TENSOR -DGGML_METAL_HAS_BF16
done

xcrun -sdk "$PLATFORM_NAME" metallib "${airs[@]}" -o "$DERIVED_FILE_DIR/rnllama.metallib"
xcrun -sdk "$PLATFORM_NAME" metallib "$air_dir/mul_mm_tensor.air" "$air_dir/fa_f16_tensor.air" \
  -o "$DERIVED_FILE_DIR/rnllama-tensor.metallib"

dest="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
mkdir -p "$dest"
mv "$DERIVED_FILE_DIR/rnllama.metallib" "$DERIVED_FILE_DIR/rnllama-tensor.metallib" "$dest/"
