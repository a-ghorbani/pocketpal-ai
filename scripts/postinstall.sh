#!/bin/bash

# Run patch-package first
npx patch-package

# Clone OpenCL headers if building llama.rn from source
OPENCL_HEADERS_DIR="node_modules/llama.rn/third_party/OpenCL-Headers"
if [ ! -d "$OPENCL_HEADERS_DIR" ]; then
    echo "Cloning OpenCL headers for llama.rn build from source..."
    mkdir -p "node_modules/llama.rn/third_party"
    git clone --depth 1 https://github.com/KhronosGroup/OpenCL-Headers.git "$OPENCL_HEADERS_DIR"
    echo "OpenCL headers cloned successfully."
else
    echo "OpenCL headers already present."
fi
