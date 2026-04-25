package com.pocketpal

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.uimanager.DisplayMetricsHolder
import androidx.core.view.WindowCompat   // for edge-to-edge pre API 35
import android.content.res.Configuration
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

      fixExternalDisplayDensity()

      WindowCompat.enableEdgeToEdge(window)  // enable E2E pre-Android 15
    // Optional: fully transparent nav bar (can reduce contrast on 3-button nav)
    // window.isNavigationBarContrastEnforced = false
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
      super.onConfigurationChanged(newConfig)
      fixExternalDisplayDensity()
  }

  /**
   * Fix display density for external displays (Samsung DeX, Pixel Desktop Mode).
   *
   * RN's DisplayMetricsHolder.initDisplayMetrics() sets screenDisplayMetrics via
   * wm.defaultDisplay.getRealMetrics(), which always reads from the phone display
   * (e.g. 420dpi). PixelUtil uses screenDisplayMetrics for all dp-to-px conversions,
   * causing everything to render ~4x too large on a lower-density external monitor.
   *
   * windowDisplayMetrics (from Application context) has the correct density, so we
   * copy it over. This runs in onCreate and onConfigurationChanged because RN
   * re-initializes metrics on orientation/resize changes.
   */
  private fun fixExternalDisplayDensity() {
      try {
          val screenMetrics = DisplayMetricsHolder.getScreenDisplayMetrics()
          val windowMetrics = DisplayMetricsHolder.getWindowDisplayMetrics()
          if (screenMetrics.densityDpi != windowMetrics.densityDpi) {
              screenMetrics.densityDpi = windowMetrics.densityDpi
              screenMetrics.density = windowMetrics.density
              screenMetrics.scaledDensity = windowMetrics.scaledDensity
          }
      } catch (_: Exception) {
          // DisplayMetricsHolder not yet initialized — normal on phone display
      }
  }
}
