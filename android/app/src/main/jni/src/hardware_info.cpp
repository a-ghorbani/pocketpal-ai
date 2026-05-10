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
