#!/bin/bash

# Run patch-package first
npx patch-package

# Clone OpenCL headers for llama.rn source builds
LLAMA_RN_DIR="node_modules/llama.rn"
THIRD_PARTY_DIR="$LLAMA_RN_DIR/third_party"
OPENCL_HEADERS_DIR="$THIRD_PARTY_DIR/OpenCL-Headers"
OPENCL_ICD_DIR="$THIRD_PARTY_DIR/OpenCL-ICD-Loader"

if [ ! -d "$OPENCL_HEADERS_DIR" ] || [ -z "$(ls -A "$OPENCL_HEADERS_DIR" 2>/dev/null)" ]; then
    echo "Cloning OpenCL headers for llama.rn build from source..."
    rm -rf "$OPENCL_HEADERS_DIR"
    mkdir -p "$THIRD_PARTY_DIR"
    git clone --depth 1 https://github.com/KhronosGroup/OpenCL-Headers.git "$OPENCL_HEADERS_DIR"
    echo "OpenCL headers cloned successfully."
else
    echo "OpenCL headers already present."
fi

if [ ! -d "$OPENCL_ICD_DIR" ] || [ -z "$(ls -A "$OPENCL_ICD_DIR" 2>/dev/null)" ]; then
    echo "Cloning OpenCL ICD Loader for llama.rn build from source..."
    rm -rf "$OPENCL_ICD_DIR"
    mkdir -p "$THIRD_PARTY_DIR"
    git clone --depth 1 https://github.com/KhronosGroup/OpenCL-ICD-Loader.git "$OPENCL_ICD_DIR"
    echo "OpenCL ICD Loader cloned successfully."
else
    echo "OpenCL ICD Loader already present."
fi

# Build OpenCL stubs if building from source and stubs are missing
if [ -f "$LLAMA_RN_DIR/scripts/build-opencl.sh" ] && [ ! -d "$LLAMA_RN_DIR/bin/arm64-v8a" ]; then
    echo "Building OpenCL stubs for llama.rn source build..."
    (cd "$LLAMA_RN_DIR" && bash scripts/build-opencl.sh)
    echo "OpenCL stubs built successfully."
else
    echo "OpenCL stubs already present or not needed."
fi
