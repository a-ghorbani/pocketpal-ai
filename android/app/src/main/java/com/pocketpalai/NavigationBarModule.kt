package com.pocketpal

import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.module.annotations.ReactModule
import com.pocketpal.specs.NativeNavigationBarSpec

@ReactModule(name = NativeNavigationBarSpec.NAME)
class NavigationBarModule(reactContext: ReactApplicationContext) :
    NativeNavigationBarSpec(reactContext), LifecycleEventListener {

  private var lastIsDark: Boolean? = null

  init {
    reactContext.addLifecycleEventListener(this)
  }

  override fun setNavigationBarDark(isDark: Boolean) {
    UiThreadUtil.runOnUiThread {
      lastIsDark = isDark
      applyToCurrentActivity()
    }
  }

  override fun onHostResume() {
    applyToCurrentActivity()
  }

  override fun onHostPause() {}

  override fun onHostDestroy() {}

  override fun invalidate() {
    super.invalidate()
    reactApplicationContext.removeLifecycleEventListener(this)
  }

  private fun applyToCurrentActivity() {
    val isDark = lastIsDark ?: return
    val window = reactApplicationContext.currentActivity?.window ?: return
    WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightNavigationBars =
        !isDark
  }
}
