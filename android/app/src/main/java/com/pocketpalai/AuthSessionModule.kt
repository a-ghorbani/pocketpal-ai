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
   * Consumes only the checkout return (matching scheme + host=checkout) for the
   * in-flight promise; any other pocketpal:// intent (e.g. host=hub) falls
   * through so MainActivity routes it to RN Linking / DeepLinkService. Returns
   * true when consumed.
   */
  fun handleIntent(intent: Intent?): Boolean {
    val data = intent?.data ?: return false
    val scheme = callbackScheme ?: return false
    if (!scheme.equals(data.scheme, ignoreCase = true)) {
      return false
    }
    if (!CALLBACK_HOST.equals(data.host, ignoreCase = true)) {
      return false
    }
    val promise = pendingPromise ?: return false
    pendingPromise = null
    callbackScheme = null
    promise.resolve(data.toString())
    return true
  }

  override fun onHostResume() {
    // The tab launch pauses the activity; a single resume here means the user
    // returned to the app. A captured callback already resolved and nulled the
    // promise via handleIntent (onNewIntent runs before onResume on a singleTask
    // warm launch), so a still-pending promise is a back-out: silent cancel. The
    // post defers the check one tick so a racing onNewIntent resolve still wins.
    if (pendingPromise == null) {
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
    promise.reject(code, message, throwable)
  }

  private companion object {
    // Host segment of the checkout callback (pocketpal://checkout/*). Other
    // pocketpal:// hosts (e.g. hub) are not the checkout return.
    const val CALLBACK_HOST = "checkout"
  }
}
