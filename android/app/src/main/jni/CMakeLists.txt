# PocketPal application CMake.
#
# Why this file exists at all: dropping `externalNativeBuild.cmake.path`
# in build.gradle disables the React Native plugin's auto-injection of
# its default-app-setup CMakeLists, so we own the `appmodules` library
# from here on. The `include(...)` below is what keeps autolinking,
# TurboModule registration, and prefab linkage to libreactnative.so
# working — i.e. it's what makes the app boot.
#
# Why our extra source lives in a subdirectory: RN's template at
# default-app-setup/ReactNative-application.cmake does
# `file(GLOB *.cpp)` non-recursively in this directory, treating the
# presence of any *.cpp here as "user owns OnLoad.cpp too." Keeping
# `hardware_info.cpp` under src/ leaves that glob empty so the upstream
# default-app-setup/OnLoad.cpp (PlatformConstants + autolinked
# TurboModules + Fabric registry) keeps being picked up. We then add
# our source explicitly via `target_sources` after the include.
# Net effect: no vendored Meta code, nothing to resync on RN bumps.

cmake_minimum_required(VERSION 3.13)

# Library name expected by RN; do not rename — SoLoader maps it at startup.
project(appmodules)

include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

target_sources(${CMAKE_PROJECT_NAME} PRIVATE src/hardware_info.cpp)

find_library(log-lib log)
target_link_libraries(${CMAKE_PROJECT_NAME} ${log-lib})
