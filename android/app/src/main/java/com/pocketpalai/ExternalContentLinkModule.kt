package com.pocketpal

import android.net.Uri
import android.util.Log
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClient.BillingProgram
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingProgramReportingDetailsParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.LaunchExternalLinkParams
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.pocketpal.specs.NativeExternalContentLinkSpec
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Drives the Google Play External Content Links link-out
 * (https://developer.android.com/google/play/billing/externalcontentlinks/integration)
 * on Billing 8.2.1+.
 *
 * prepareExternalLink runs eligibility -> fresh transaction token ->
 * launchExternalLink (Play renders its own disclosure) and returns the verdict
 * to JS; on 'launched' the JS store opens checkoutUrl in the existing Custom
 * Tab. The token is minted fresh per link-out and never cached.
 *
 * reportExternalContentLink is best-effort and a logged no-op today (US
 * reporting enforcement is off): it always resolves and never blocks checkout.
 */
@ReactModule(name = NativeExternalContentLinkSpec.NAME)
class ExternalContentLinkModule(reactContext: ReactApplicationContext) :
    NativeExternalContentLinkSpec(reactContext) {

  private val appContext = reactContext.applicationContext

  override fun getName(): String = NativeExternalContentLinkSpec.NAME

  override fun prepareExternalLink(checkoutUrl: String, promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      Log.w(TAG, "prepareExternalLink: no current activity")
      resolveOutcome(promise, OUTCOME_ERROR)
      return
    }
    val linkUri =
        try {
          Uri.parse(checkoutUrl)
        } catch (e: Exception) {
          Log.w(TAG, "prepareExternalLink: failed to parse checkout url", e)
          resolveOutcome(promise, OUTCOME_ERROR)
          return
        }

    val settled = AtomicBoolean(false)
    val client =
        BillingClient.newBuilder(appContext)
            .enableBillingProgram(BillingProgram.EXTERNAL_CONTENT_LINK)
            .build()

    client.startConnection(
        object : BillingClientStateListener {
          override fun onBillingSetupFinished(result: BillingResult) {
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
              Log.w(
                  TAG,
                  "billing setup failed: code=${result.responseCode} msg=${result.debugMessage}")
              endAndResolve(client, promise, settled, OUTCOME_ERROR)
              return
            }
            checkEligibility(client, activity, linkUri, promise, settled)
          }

          override fun onBillingServiceDisconnected() {
            Log.w(TAG, "billing service disconnected during setup")
            endAndResolve(client, promise, settled, OUTCOME_ERROR)
          }
        })
  }

  private fun checkEligibility(
      client: BillingClient,
      activity: android.app.Activity,
      linkUri: Uri,
      promise: Promise,
      settled: AtomicBoolean
  ) {
    client.isBillingProgramAvailableAsync(BillingProgram.EXTERNAL_CONTENT_LINK) {
        result,
        _ ->
      if (result.responseCode != BillingClient.BillingResponseCode.OK) {
        Log.w(
            TAG,
            "program unavailable: code=${result.responseCode} msg=${result.debugMessage}")
        endAndResolve(client, promise, settled, OUTCOME_INELIGIBLE)
        return@isBillingProgramAvailableAsync
      }
      mintToken(client, activity, linkUri, promise, settled)
    }
  }

  private fun mintToken(
      client: BillingClient,
      activity: android.app.Activity,
      linkUri: Uri,
      promise: Promise,
      settled: AtomicBoolean
  ) {
    val params =
        BillingProgramReportingDetailsParams.newBuilder()
            .setBillingProgram(BillingProgram.EXTERNAL_CONTENT_LINK)
            .build()
    client.createBillingProgramReportingDetailsAsync(params) { result, details ->
      if (result.responseCode != BillingClient.BillingResponseCode.OK || details == null) {
        Log.w(
            TAG,
            "reporting-details (token) failed: code=${result.responseCode} msg=${result.debugMessage} details=${details != null}")
        endAndResolve(client, promise, settled, OUTCOME_ERROR)
        return@createBillingProgramReportingDetailsAsync
      }
      // Fresh per link-out, never cached; threaded to the post-ownership report.
      val token = details.externalTransactionToken
      launchLink(client, activity, linkUri, token, promise, settled)
    }
  }

  private fun launchLink(
      client: BillingClient,
      activity: android.app.Activity,
      linkUri: Uri,
      token: String,
      promise: Promise,
      settled: AtomicBoolean
  ) {
    val params =
        LaunchExternalLinkParams.newBuilder()
            .setBillingProgram(BillingProgram.EXTERNAL_CONTENT_LINK)
            .setLinkType(LaunchExternalLinkParams.LinkType.LINK_TO_DIGITAL_CONTENT_OFFER)
            .setLaunchMode(LaunchExternalLinkParams.LaunchMode.CALLER_WILL_LAUNCH_LINK)
            .setLinkUri(linkUri)
            .build()
    // Play renders its own disclosure during this call; the app must not.
    client.launchExternalLink(activity, params) { result ->
      val outcome =
          when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> OUTCOME_LAUNCHED
            BillingClient.BillingResponseCode.USER_CANCELED -> OUTCOME_USER_CANCELED
            BillingClient.BillingResponseCode.BILLING_UNAVAILABLE -> OUTCOME_INELIGIBLE
            else -> OUTCOME_ERROR
          }
      if (outcome != OUTCOME_LAUNCHED) {
        Log.w(
            TAG,
            "launchExternalLink not launched: code=${result.responseCode} msg=${result.debugMessage} -> $outcome")
      }
      // CALLER_WILL_LAUNCH_LINK: on OK the store opens checkoutUrl in the
      // Custom Tab. The token rides back only when we are about to launch.
      val map = Arguments.createMap()
      map.putString("outcome", outcome)
      if (outcome == OUTCOME_LAUNCHED) {
        map.putString("token", token)
      }
      endAndResolveMap(client, promise, settled, map)
    }
  }

  override fun reportExternalContentLink(
      purchaseId: String,
      token: String,
      promise: Promise
  ) {
    // US reporting enforcement is off today: log and resolve. Never throws,
    // never blocks the checkout outcome.
    Log.i(TAG, "external content link report no-op for $purchaseId")
    promise.resolve(null)
  }

  private fun resolveOutcome(promise: Promise, outcome: String) {
    val map = Arguments.createMap()
    map.putString("outcome", outcome)
    promise.resolve(map)
  }

  private fun endAndResolve(
      client: BillingClient,
      promise: Promise,
      settled: AtomicBoolean,
      outcome: String
  ) {
    val map = Arguments.createMap()
    map.putString("outcome", outcome)
    endAndResolveMap(client, promise, settled, map)
  }

  private fun endAndResolveMap(
      client: BillingClient,
      promise: Promise,
      settled: AtomicBoolean,
      map: WritableMap
  ) {
    if (!settled.compareAndSet(false, true)) {
      return
    }
    try {
      client.endConnection()
    } catch (_: Exception) {}
    promise.resolve(map)
  }

  companion object {
    private const val TAG = "ExternalContentLinkModule"
    private const val OUTCOME_LAUNCHED = "launched"
    private const val OUTCOME_USER_CANCELED = "user_canceled"
    private const val OUTCOME_INELIGIBLE = "ineligible"
    private const val OUTCOME_ERROR = "error"
  }
}
