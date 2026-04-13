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

# Build @mhpdev/react-native-speech from its pinned GitHub source.
#
# The fork (installed via `github:a-ghorbani/react-native-speech#<sha>`) ships
# untranspiled source (`"source": "./src/index.tsx"`) and a `package.json`
# `main` pointing at `./lib/module/index.js` — which Metro cannot resolve in
# release bundles because the GitHub install skips `prepare`. Build `lib/`
# locally using react-native-builder-bob so Metro can find the entry.
SPEECH_PKG="node_modules/@mhpdev/react-native-speech"
# Populate the espeak-ng submodule that the fork needs for its native
# (Android CMake + iOS pod) build. Yarn installs the fork from a GitHub
# tarball which strips submodule contents — without this, the Android
# CMake task fails with `No SOURCES given to target: espeak-ng`.
#
# NOTE: this clones the espeak-ng source but does NOT regenerate
# `config.h` (which the upstream fork's CMakeLists.txt expects to already
# be present). A full working build additionally requires running
# `autoreconf -i && ./configure` inside `third-party/espeak-ng/` with
# Android/iOS cross-compile toolchains available. Until the fork
# publishes a prebuilt `config.h` or switches to a pure-CMake espeak-ng
# build, native Android/iOS Release builds of a vanilla worktree will
# fail at the espeak-ng compile step. See story Implementation Notes
# for details.
if [ -d "$SPEECH_PKG/third-party/espeak-ng" ] && [ ! -f "$SPEECH_PKG/third-party/espeak-ng/CMakeLists.txt" ]; then
    echo "Fetching espeak-ng submodule for @mhpdev/react-native-speech..."
    git clone --depth 1 https://github.com/espeak-ng/espeak-ng.git \
        "$SPEECH_PKG/third-party/espeak-ng-tmp" >/dev/null 2>&1 && \
        cp -R "$SPEECH_PKG/third-party/espeak-ng-tmp/." \
              "$SPEECH_PKG/third-party/espeak-ng/" && \
        rm -rf "$SPEECH_PKG/third-party/espeak-ng-tmp"
    echo "  done."
fi

if [ -d "$SPEECH_PKG" ] && [ ! -d "$SPEECH_PKG/lib/module" ]; then
    echo "Building @mhpdev/react-native-speech from source..."
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
    echo "@mhpdev/react-native-speech lib already present (or package not installed)."
fi
