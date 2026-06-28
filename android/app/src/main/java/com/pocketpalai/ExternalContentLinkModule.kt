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
    connectAndCheckAvailability(
        onAvailability = { client, result ->
          if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            Log.w(
                TAG,
                "program unavailable: code=${result.responseCode} msg=${result.debugMessage}")
            endAndResolve(client, promise, settled, OUTCOME_INELIGIBLE)
          } else {
            mintToken(client, activity, linkUri, promise, settled)
          }
        },
        onConnectionError = { client ->
          endAndResolve(client, promise, settled, OUTCOME_ERROR)
        })
  }

  /**
   * Side-effect-free render-time eligibility probe. Connects, queries
   * EXTERNAL_CONTENT_LINK availability, resolves the boolean, and disconnects.
   * It never mints a token, launches a link-out, or shows a disclosure (that
   * stays exclusively in prepareExternalLink), and takes no currentActivity —
   * there is nothing to launch, so there is no Activity to gate on. Any setup
   * failure / disconnect / unavailable result resolves false (fail-closed).
   */
  override fun isExternalContentLinkAvailable(promise: Promise) {
    val settled = AtomicBoolean(false)
    connectAndCheckAvailability(
        onAvailability = { client, result ->
          val available = result.responseCode == BillingClient.BillingResponseCode.OK
          if (!available) {
            Log.w(
                TAG,
                "availability probe: program unavailable code=${result.responseCode} msg=${result.debugMessage}")
          }
          endAndResolveBoolean(client, promise, settled, available)
        },
        onConnectionError = { client ->
          endAndResolveBoolean(client, promise, settled, false)
        })
  }

  /**
   * Shared connect + availability query for the prep link-out and the render-time
   * probe. Builds a BillingClient with EXTERNAL_CONTENT_LINK enabled, starts the
   * connection, gates on a successful setup, then runs
   * isBillingProgramAvailableAsync and hands the result (with the still-open
   * client) to [onAvailability]. A failed setup or a disconnect routes to
   * [onConnectionError]. Callers own closing the connection (via endAndResolve*).
   */
  private fun connectAndCheckAvailability(
      onAvailability: (client: BillingClient, result: BillingResult) -> Unit,
      onConnectionError: (client: BillingClient) -> Unit
  ) {
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
              onConnectionError(client)
              return
            }
            client.isBillingProgramAvailableAsync(BillingProgram.EXTERNAL_CONTENT_LINK) {
                availabilityResult,
                _ ->
              onAvailability(client, availabilityResult)
            }
          }

          override fun onBillingServiceDisconnected() {
            Log.w(TAG, "billing service disconnected during setup")
            onConnectionError(client)
          }
        })
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

  private fun endAndResolveBoolean(
      client: BillingClient,
      promise: Promise,
      settled: AtomicBoolean,
      available: Boolean
  ) {
    if (!settled.compareAndSet(false, true)) {
      return
    }
    try {
      client.endConnection()
    } catch (_: Exception) {}
    promise.resolve(available)
  }

  companion object {
    private const val TAG = "ExternalContentLinkModule"
    private const val OUTCOME_LAUNCHED = "launched"
    private const val OUTCOME_USER_CANCELED = "user_canceled"
    private const val OUTCOME_INELIGIBLE = "ineligible"
    private const val OUTCOME_ERROR = "error"
  }
}
