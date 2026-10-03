package com.pocketpal

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.pocketpal.specs.NativeVoiceChatLauncherSpec

object VoiceChatLauncher {
  fun setEnabled(context: Context, enabled: Boolean) {
    val state = if (enabled) {
      PackageManager.COMPONENT_ENABLED_STATE_ENABLED
    } else {
      PackageManager.COMPONENT_ENABLED_STATE_DISABLED
    }
    context.packageManager.setComponentEnabledSetting(
      ComponentName(context.packageName, "${context.packageName}.VoiceChatActivity"),
      state,
      PackageManager.DONT_KILL_APP
    )
  }
}

@ReactModule(name = NativeVoiceChatLauncherSpec.NAME)
class VoiceChatLauncherModule(
  reactContext: ReactApplicationContext
) : NativeVoiceChatLauncherSpec(reactContext) {
  override fun setEnabled(enabled: Boolean, promise: Promise) {
    try {
      VoiceChatLauncher.setEnabled(reactApplicationContext, enabled)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject(
        "VOICE_CHAT_LAUNCHER_UPDATE_FAILED",
        "Could not update the voice chat launcher",
        error
      )
    }
  }
}
