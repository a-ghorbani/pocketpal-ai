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

# Build @pocketpalai/react-native-speech from its pinned GitHub source.
#
# The fork (installed via `github:a-ghorbani/react-native-speech#<sha>`) ships
# untranspiled source (`"source": "./src/index.tsx"`) and a `package.json`
# `main` pointing at `./lib/module/index.js` — which Metro cannot resolve in
# release bundles because the GitHub install skips `prepare`. Build `lib/`
# locally using react-native-builder-bob so Metro can find the entry.
SPEECH_PKG="node_modules/@pocketpalai/react-native-speech"
if [ -d "$SPEECH_PKG" ] && [ ! -d "$SPEECH_PKG/lib/module" ]; then
    echo "Building @pocketpalai/react-native-speech from source..."
    (
        cd "$SPEECH_PKG"
        if [ ! -d "node_modules/react-native-builder-bob" ]; then
            npm install --no-save --silent react-native-builder-bob del-cli >/dev/null 2>&1 || true
        fi
        ./node_modules/.bin/bob build --target module >/dev/null 2>&1 || {
            echo "  warning: bob build --target module failed" >&2
        }
    )
    echo "  done."
else
    echo "@pocketpalai/react-native-speech lib already present (or package not installed)."
fi
