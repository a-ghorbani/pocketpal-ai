#!/bin/bash

# Run patch-package first
npx patch-package

# Clone OpenCL headers if building llama.rn from source
LLAMA_RN_DIR="node_modules/llama.rn"
OPENCL_HEADERS_DIR="$LLAMA_RN_DIR/third_party/OpenCL-Headers"
if [ ! -d "$OPENCL_HEADERS_DIR" ]; then
    echo "Cloning OpenCL headers for llama.rn build from source..."
    mkdir -p "$LLAMA_RN_DIR/third_party"
    git clone --depth 1 https://github.com/KhronosGroup/OpenCL-Headers.git "$OPENCL_HEADERS_DIR"
    echo "OpenCL headers cloned successfully."
else
    echo "OpenCL headers already present."
fi

# Build JS output if llama.rn was installed from a git ref (lib/ is .gitignored
# in the llama.rn repo, so git installs lack the compiled JS that npm includes).
if [ -d "$LLAMA_RN_DIR" ] && [ ! -d "$LLAMA_RN_DIR/lib" ]; then
    echo "llama.rn installed from git ref (lib/ missing). Building JS output..."
    (cd "$LLAMA_RN_DIR" && npx react-native-builder-bob build)
    echo "llama.rn JS output built successfully."
else
    echo "llama.rn lib/ already present (npm install or previously built)."
fi
