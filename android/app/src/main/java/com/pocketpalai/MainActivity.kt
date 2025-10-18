package com.pocketpal

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import androidx.core.view.WindowCompat   // for edge-to-edge pre API 35 
import android.os.Bundle

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "PocketPal"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
      // Prevent react-native-screens from restoring fragments after process death
      // This fixes the "Screen fragments should never be restored" crash 
      // See: https://github.com/software-mansion/react-native-screens/issues/17 
      // and https://github.com/software-mansion/react-native-screens?tab=readme-ov-file#android
      super.onCreate(null)

      WindowCompat.enableEdgeToEdge(window)  // enable E2E pre-Android 15
    // Optional: fully transparent nav bar (can reduce contrast on 3-button nav)
    // window.isNavigationBarContrastEnforced = false
  }
}
