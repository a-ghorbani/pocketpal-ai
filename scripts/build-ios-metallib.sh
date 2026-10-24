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
mkdir -p "$air_dir"

ncpu=$(sysctl -n hw.ncpu 2>/dev/null || echo 4)
printf '%s\n' "$@" | xargs -P "$ncpu" -I {} \
  xcrun -sdk "$PLATFORM_NAME" metal -O3 "-mtargetos=ios18.0$target_suffix" -DGGML_METAL_HAS_BF16 \
  -I "$ggml_metal" -I "$ggml_src" -c "$ggml_metal/kernels/{}.metal" -o "$air_dir/{}.air"

airs=()
for kernel in "$@"; do
  airs+=("$air_dir/$kernel.air")
done
xcrun -sdk "$PLATFORM_NAME" metallib "${airs[@]}" -o "$DERIVED_FILE_DIR/rnllama.metallib"

# Tensor GPUs skip rnllama.metallib and compile these sources at runtime.
dest="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
rm -rf "$dest/kernels"
mkdir -p "$dest/kernels"
cp "$ggml_metal"/kernels/* "$dest/kernels/"
cp "$ggml_metal/ggml-metal-impl.h" "$ggml_src/ggml-common.h" "$dest/"
mv "$DERIVED_FILE_DIR/rnllama.metallib" "$dest/"
