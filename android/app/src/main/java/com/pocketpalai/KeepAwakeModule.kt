package com.pocketpal

import android.view.WindowManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.pocketpal.specs.NativeKeepAwakeSpec

@ReactModule(name = NativeKeepAwakeSpec.NAME)
class KeepAwakeModule(reactContext: ReactApplicationContext) :
    NativeKeepAwakeSpec(reactContext) {

  override fun activate() {
    val activity = currentActivity ?: return
    activity.runOnUiThread {
      activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
  }

  override fun deactivate() {
    val activity = currentActivity ?: return
    activity.runOnUiThread {
      activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
  }
}

