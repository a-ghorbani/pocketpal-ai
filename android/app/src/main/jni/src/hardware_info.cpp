// JNI shim exposing bionic's mallopt(M_PURGE_ALL) to React Native.
//
// Why: on Android, scudo retains free'd pages in its arena rather
// than returning them to the kernel. After a sequence of large
// allocations and frees (e.g. loading and releasing model weights),
// the process's RSS stays high even though we hold no live data —
// enough that lowmemorykiller can reap us before the next allocation
// completes. M_PURGE_ALL madvise(MADV_DONTNEED)s fully-free pages,
// converting "freed by us, hoarded by scudo" into "returned to OS".
//
// Why dlsym: minSdkVersion is 24, but `mallopt` itself lands at
// API 26, M_PURGE at API 28, and M_PURGE_ALL at API 34. Linking
// against `mallopt` directly would break the loader on API 24/25,
// so we resolve the symbol at runtime and silently no-op on devices
// that don't expose it. We pull the option constants from
// <malloc.h> rather than hand-rolling them — the values have changed
// across NDK releases (M_PURGE_ALL was -102 in early bionic) and
// drifting from the canonical header silently degrades the call.

#include <android/log.h>
#include <dlfcn.h>
#include <jni.h>
#include <malloc.h>

typedef int (*mallopt_fn_t)(int, int);

// The `appmodules` target compile flags include -DLOG_TAG="ReactNative",
// which would clash if we redefined plain `LOG_TAG` here. Distinct name
// to avoid -Wmacro-redefined.
#define HW_INFO_LOG_TAG "PocketPalHardwareInfo"
#define HW_INFO_LOGI(...) \
    __android_log_print(ANDROID_LOG_INFO, HW_INFO_LOG_TAG, __VA_ARGS__)

extern "C" JNIEXPORT jboolean JNICALL
Java_com_pocketpal_HardwareInfoModule_nativePurgeAll(JNIEnv* /* env */, jobject /* this */) {
    static mallopt_fn_t mallopt_fn =
        reinterpret_cast<mallopt_fn_t>(dlsym(RTLD_DEFAULT, "mallopt"));
    if (mallopt_fn == nullptr) {
        HW_INFO_LOGI("mallopt unavailable on this device");
        return JNI_FALSE;
    }
    // Bionic mallopt returns 1 on success, 0 on unknown option.
    // Try the aggressive variant first; fall back to M_PURGE on
    // devices that ship the symbol but not the M_PURGE_ALL option.
    int rc = mallopt_fn(M_PURGE_ALL, 0);
    if (rc == 0) {
        rc = mallopt_fn(M_PURGE, 0);
        HW_INFO_LOGI("M_PURGE_ALL unsupported, fell back to M_PURGE rc=%d", rc);
    } else {
        HW_INFO_LOGI("M_PURGE_ALL rc=%d", rc);
    }
    return rc == 1 ? JNI_TRUE : JNI_FALSE;
}

// Spike: memory probe. Maps and writes anonymous memory in chunks up to a
// target, reading the app's own swap and MemAvailable after every chunk, and
// stops at the first sign of pressure. Everything is unmapped before return,
// so the pages go straight back to the kernel (no allocator hoarding).
#include <sys/mman.h>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cstdint>
#include <vector>
#include <algorithm>

static long probeReadKb(const char* path, const char* key) {
    FILE* f = fopen(path, "r");
    if (!f) return -1;
    char line[256];
    size_t keyLen = strlen(key);
    long value = -1;
    while (fgets(line, sizeof(line), f)) {
        if (strncmp(line, key, keyLen) == 0 && line[keyLen] == ':') {
            value = strtol(line + keyLen + 1, nullptr, 10);
            break;
        }
    }
    fclose(f);
    return value;
}

extern "C" JNIEXPORT jlongArray JNICALL
Java_com_pocketpal_HardwareInfoModule_nativeProbeMemory(JNIEnv* env, jobject /* this */,
                                                        jlong targetKb, jlong chunkKb,
                                                        jlong swapLimitKb, jlong availFloorKb,
                                                        jlong stallX10) {
    auto t0 = std::chrono::steady_clock::now();
    const size_t chunk = (size_t)chunkKb * 1024;
    std::vector<void*> chunks;
    long swapBase = probeReadKb("/proc/self/status", "VmSwap");
    long reachedKb = 0, stopReason = 0, swapGrowth = 0;
    long availKb = probeReadKb("/proc/meminfo", "MemAvailable");
    long minAvail = availKb;
    uint64_t x = 0x9E3779B97F4A7C15ULL;
    // Stall stop: once the kernel has to reclaim to give us pages, writing a
    // chunk takes several times longer than it did at the start of this probe.
    std::vector<long> chunkUs;
    long baseUs = 0, slowRun = 0, n = 0;
    while (reachedKb < targetKb) {
        auto c0 = std::chrono::steady_clock::now();
        void* p = mmap(nullptr, chunk, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        if (p == MAP_FAILED) { stopReason = 3; break; }
        chunks.push_back(p);
        // Incompressible fill (xorshift), so zram can't hide the pages the way
        // it hides zero pages; model weights don't compress either.
        uint64_t* w = (uint64_t*)p;
        for (size_t i = 0; i < chunk / 8; i++) {
            x ^= x << 13; x ^= x >> 7; x ^= x << 17;
            w[i] = x;
        }
        reachedKb += chunkKb;
        long us = (long)std::chrono::duration_cast<std::chrono::microseconds>(
            std::chrono::steady_clock::now() - c0).count();
        chunkUs.push_back(us);
        n++;
        if (n == 5) {
            std::vector<long> first(chunkUs.begin() + 1, chunkUs.begin() + 5);
            std::sort(first.begin(), first.end());
            baseUs = (first[1] + first[2]) / 2;
        }
        long swap = probeReadKb("/proc/self/status", "VmSwap");
        availKb = probeReadKb("/proc/meminfo", "MemAvailable");
        HW_INFO_LOGI("probe chunk n=%ld us=%ld base_us=%ld avail_kb=%ld swap_kb=%ld", n, us, baseUs, availKb, swap - swapBase);
        if (stallX10 > 0 && baseUs > 0 && us * 10 > baseUs * stallX10) {
            if (++slowRun >= 2) { stopReason = 4; break; }
        } else {
            slowRun = 0;
        }
        if (availKb >= 0 && availKb < minAvail) minAvail = availKb;
        swapGrowth = swap - swapBase;
        if (swapLimitKb > 0 && swapGrowth > swapLimitKb) { stopReason = 1; break; }
        if (availFloorKb > 0 && availKb >= 0 && availKb < availFloorKb) { stopReason = 2; break; }
    }
    for (void* p : chunks) munmap(p, chunk);
    long ms = (long)std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - t0).count();
    HW_INFO_LOGI("probe reached_kb=%ld stop=%ld swap_growth_kb=%ld mem_avail_kb=%ld min_avail_kb=%ld ms=%ld base_us=%ld",
                 reachedKb, stopReason, swapGrowth, availKb, minAvail, ms, baseUs);
    jlong out[6] = {reachedKb, stopReason, swapGrowth, availKb, minAvail, ms};
    jlongArray arr = env->NewLongArray(6);
    env->SetLongArrayRegion(arr, 0, 6, out);
    return arr;
}
