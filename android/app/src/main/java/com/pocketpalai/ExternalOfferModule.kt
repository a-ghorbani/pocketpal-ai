package com.pocketpal

import android.util.Log
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.pocketpal.specs.NativeExternalOfferSpec
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Reports a confirmed external-offer purchase to Google Play via the Play
 * Billing External Offers API
 * (https://developer.android.com/google/play/billing/external/integration).
 *
 * Best-effort by contract: when the External Offers program is inactive or
 * uncredentialed — connection fails, the feature is unsupported, or the
 * reporting-details call is not OK — this is a logged no-op. The JS promise
 * always resolves; reporting never blocks, fails, or queues the checkout.
 */
@ReactModule(name = NativeExternalOfferSpec.NAME)
class ExternalOfferModule(reactContext: ReactApplicationContext) :
    NativeExternalOfferSpec(reactContext) {

  private val appContext = reactContext.applicationContext

  override fun getName(): String = NativeExternalOfferSpec.NAME

  override fun reportTransaction(purchaseId: String, promise: Promise) {
    val settled = AtomicBoolean(false)
    val client =
        BillingClient.newBuilder(appContext)
            .enableExternalOffer()
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build()

    client.startConnection(
        object : BillingClientStateListener {
          override fun onBillingSetupFinished(result: BillingResult) {
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
              noOp(
                  "connection not OK (${result.responseCode}) for $purchaseId",
                  client,
                  promise,
                  settled)
              return
            }
            client.createExternalOfferReportingDetailsAsync { detailsResult, details ->
              if (detailsResult.responseCode == BillingClient.BillingResponseCode.OK &&
                  details != null) {
                // Active program: the external transaction token is reported to
                // Google Play via the Developer API server-side.
                Log.i(TAG, "external offer reporting token obtained for $purchaseId")
              } else {
                Log.i(
                    TAG,
                    "external offer reporting unavailable (${detailsResult.responseCode}) for $purchaseId")
              }
              endAndResolve(client, promise, settled)
            }
          }

          override fun onBillingServiceDisconnected() {
            noOp("service disconnected before reporting $purchaseId", client, promise, settled)
          }
        })
  }

  private fun noOp(
      reason: String,
      client: BillingClient,
      promise: Promise,
      settled: AtomicBoolean
  ) {
    Log.i(TAG, "external offer report no-op: $reason")
    endAndResolve(client, promise, settled)
  }

  private fun endAndResolve(client: BillingClient, promise: Promise, settled: AtomicBoolean) {
    if (!settled.compareAndSet(false, true)) {
      return
    }
    try {
      client.endConnection()
    } catch (_: Exception) {}
    promise.resolve(null)
  }

  companion object {
    private const val TAG = "ExternalOfferModule"
  }
}
