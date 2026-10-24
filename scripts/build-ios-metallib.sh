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
mkdir -p "$air_dir"

# Paths go in as positional arguments: BSD xargs -I substitutes only into
# arguments of up to 255 bytes, which archive paths exceed.
ncpu=$(sysctl -n hw.ncpu 2>/dev/null || echo 4)
printf '%s\n' "$@" | xargs -n 1 -P "$ncpu" sh -c '
  xcrun -sdk "$1" metal -O3 "-mtargetos=ios18.0$2" -DGGML_METAL_HAS_BF16 \
    -I "$3" -I "$4" -c "$3/kernels/$6.metal" -o "$5/$6.air"
' _ "$PLATFORM_NAME" "$target_suffix" "$ggml_metal" "$ggml_src" "$air_dir"

airs=()
for kernel in "$@"; do
  if [ ! -f "$air_dir/$kernel.air" ]; then
    echo "error: compiling $kernel.metal produced no $air_dir/$kernel.air" >&2
    exit 1
  fi
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
