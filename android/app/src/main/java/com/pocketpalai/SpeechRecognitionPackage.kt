package com.pocketpal

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.pocketpal.specs.NativeSpeechRecognitionSpec

class SpeechRecognitionPackage : TurboReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == NativeSpeechRecognitionSpec.NAME) {
      SpeechRecognitionModule(reactContext)
    } else {
      null
    }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider {
      mapOf(
        NativeSpeechRecognitionSpec.NAME to ReactModuleInfo(
          NativeSpeechRecognitionSpec.NAME,
          NativeSpeechRecognitionSpec.NAME,
          false,
          false,
          false,
          false,
          true
        )
      )
    }
}
