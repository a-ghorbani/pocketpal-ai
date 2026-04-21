package com.pocketpal

import android.app.Application
import android.system.Os
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader
import com.pocketpal.KeepAwakePackage
import com.pocketpal.HardwareInfoPackage
import com.pocketpal.StorefrontPackage
import com.pocketpal.download.DownloadPackage

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
              add(KeepAwakePackage())
              add(HardwareInfoPackage())
              add(StorefrontPackage())
              add(DownloadPackage())
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    // Enable Adreno large buffer support on Qualcomm A7X/A8X GPUs.
    // The OpenCL backend in llama.rn self-gates on GPU family and the
    // cl_qcom_large_buffer extension — this is a no-op on non-Adreno devices.
    // Must be set before SoLoader.init so the native library picks it up.
    // See: https://github.com/ggml-org/llama.cpp/pull/20997
    Os.setenv("LM_GGML_OPENCL_ADRENO_USE_LARGE_BUFFER", "1", true)
    SoLoader.init(this, OpenSourceMergedSoMapping)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
  }
}
