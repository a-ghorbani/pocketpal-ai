package com.pocketpal

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.pocketpal.specs.NativeHardwareInfoSpec

class HardwareInfoPackage : TurboReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == NativeHardwareInfoSpec.NAME) {
      HardwareInfoModule(reactContext)
    } else {
      null
    }
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      mapOf(
        NativeHardwareInfoSpec.NAME to ReactModuleInfo(
          NativeHardwareInfoSpec.NAME,
          NativeHardwareInfoSpec.NAME,
          false, // canOverrideExistingModule
          false, // needsEagerInit
          true,  // hasConstants
          false, // isCxxModule
          true   // isTurboModule
        )
      )
    }
  }
}

