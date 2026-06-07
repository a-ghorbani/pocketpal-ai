package com.pocketpal

import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.browser.customtabs.CustomTabsIntent
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.pocketpal.specs.NativeAuthSessionSpec

/**
 * Opens a web checkout flow in a Chrome Custom Tab and resolves with the
 * captured custom-scheme callback URL. The callback returns as a BROWSABLE
 * VIEW intent (host=checkout) to the singleTask MainActivity, which forwards
 * it here via handleIntent. A tab dismiss with no callback resolves to a
 * silent cancel (the store maps a reject to a cancelled checkout).
 */
@ReactModule(name = NativeAuthSessionSpec.NAME)
class AuthSessionModule(reactContext: ReactApplicationContext) :
    NativeAuthSessionSpec(reactContext), LifecycleEventListener {

  private var pendingPromise: Promise? = null
  private var callbackScheme: String? = null
  private var awaitingReturn = false
  private val mainHandler = Handler(Looper.getMainLooper())

  init {
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName(): String = NativeAuthSessionSpec.NAME

  override fun openAuth(url: String, callbackScheme: String, promise: Promise) {
    if (pendingPromise != null) {
      promise.reject("auth_in_flight", "an auth session is already in flight")
      return
    }
    val activity = currentActivity
    if (activity == null) {
      promise.reject("no_activity", "no current activity to present the custom tab")
      return
    }
    val uri =
        try {
          Uri.parse(url)
        } catch (e: Exception) {
          promise.reject("invalid_url", "openAuth received an invalid URL", e)
          return
        }

    pendingPromise = promise
    this.callbackScheme = callbackScheme
    awaitingReturn = false

    activity.runOnUiThread {
      try {
        val intent = CustomTabsIntent.Builder().build()
        intent.launchUrl(activity, uri)
      } catch (e: Exception) {
        rejectPending("custom_tab_failed", "failed to launch the custom tab", e)
      }
    }
  }

  /**
   * Forwarded by MainActivity.onNewIntent for the warm-launch callback intent.
   * Resolves the in-flight promise when the intent carries a matching
   * custom-scheme URL. Returns true when consumed.
   */
  fun handleIntent(intent: Intent?): Boolean {
    val data = intent?.data ?: return false
    val scheme = callbackScheme ?: return false
    if (!scheme.equals(data.scheme, ignoreCase = true)) {
      return false
    }
    val promise = pendingPromise ?: return false
    pendingPromise = null
    callbackScheme = null
    awaitingReturn = false
    promise.resolve(data.toString())
    return true
  }

  override fun onHostResume() {
    // First resume after launching the tab arms the dismiss check; the next
    // resume (user backed out of the tab) with no callback captured is a
    // silent cancel. The callback intent resolves the promise via handleIntent
    // before this fires, so a resolved flow has no pendingPromise left.
    if (pendingPromise == null) {
      return
    }
    if (!awaitingReturn) {
      awaitingReturn = true
      return
    }
    mainHandler.post {
      if (pendingPromise != null) {
        rejectPending("auth_cancelled", "custom tab dismissed without a callback", null)
      }
    }
  }

  override fun onHostPause() {}

  override fun onHostDestroy() {
    rejectPending("auth_cancelled", "host destroyed", null)
  }

  private fun rejectPending(code: String, message: String, throwable: Throwable?) {
    val promise = pendingPromise ?: return
    pendingPromise = null
    callbackScheme = null
    awaitingReturn = false
    promise.reject(code, message, throwable)
  }
}
