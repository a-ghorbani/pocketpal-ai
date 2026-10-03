package com.pocketpal

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.pocketpal.specs.NativeVoiceChatLauncherSpec

class VoiceChatLauncherPackage : TurboReactPackage() {
  override fun getModule(
    name: String,
    reactContext: ReactApplicationContext
  ): NativeModule? =
    if (name == NativeVoiceChatLauncherSpec.NAME) {
      VoiceChatLauncherModule(reactContext)
    } else {
      null
    }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider {
      mapOf(
        NativeVoiceChatLauncherSpec.NAME to ReactModuleInfo(
          NativeVoiceChatLauncherSpec.NAME,
          NativeVoiceChatLauncherSpec.NAME,
          false,
          false,
          false,
          false,
          true
        )
      )
    }
}
