// The rejection message react-native-iap hands JS on Android: openiap's JSON on
// the first line, then the Java cause and stack.

// Captured whole from JS on an Android phone with no Google account.
export const PLAY_NOT_CONNECTED_ON_DEVICE = [
  '{"code":"service-disconnected","message":"Play Store service is not connected","debugMessage":"Service connection is disconnected.","subResponseCodeAndroid":"no-applicable-sub-response-code"}',
  'Caused by: ServiceDisconnected(debugMessage=Service connection is disconnected.)',
  '\tat dev.hyo.openiap.OpenIapErrorExtensionsKt.fromBillingResponseCode(OpenIapErrorExtensions.kt:35)',
  '\tat dev.hyo.openiap.OpenIapErrorExtensionsKt.toOpenIapError(OpenIapErrorExtensions.kt:43)',
  '\tat dev.hyo.openiap.helpers.HelpersKt.queryPurchases$lambda$2$lambda$1(Helpers.kt:68)',
  '\tat dev.hyo.openiap.helpers.HelpersKt$$ExternalSyntheticLambda4.onQueryPurchasesResponse(D8$$SyntheticClass:0)',
  '\tat com.android.billingclient.api.zzbp.call(com.android.billingclient:billing@@9.1.0:5)',
  '\tat java.util.concurrent.FutureTask.run(FutureTask.java:317)',
  '\tat java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1156)',
  '\tat java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:651)',
  '\tat java.lang.Thread.run(Thread.java:1119)',
  '',
].join('\n');

// Built from openiap-google 3.5.2's classes on a desktop JVM, since a phone
// can't produce these codes on demand; stacks trimmed to openiap's frames.

export const NETWORK_ERROR = [
  '{"code":"network-error","message":"Network connection error","debugMessage":"Network error."}',
  'Caused by: NetworkFailure(debugMessage=Network error.)',
  '\tat dev.hyo.openiap.OpenIapErrorExtensionsKt.fromBillingResponseCode(OpenIapErrorExtensions.kt:26)',
  '\tat dev.hyo.openiap.OpenIapErrorExtensionsKt.fromBillingResponseCode(OpenIapErrorExtensions.kt:18)',
].join('\n');

export const BILLING_UNAVAILABLE = [
  '{"code":"billing-unavailable","message":"Billing API version is not supported","debugMessage":"Billing service unavailable on device."}',
  'Caused by: BillingUnavailable(debugMessage=Billing service unavailable on device.)',
  '\tat dev.hyo.openiap.OpenIapErrorExtensionsKt.fromBillingResponseCode(OpenIapErrorExtensions.kt:29)',
  '\tat dev.hyo.openiap.OpenIapErrorExtensionsKt.fromBillingResponseCode(OpenIapErrorExtensions.kt:18)',
].join('\n');

export const SERVICE_ERROR = [
  '{"code":"service-error","message":"Billing service is unavailable","debugMessage":"Timeout communicating with service."}',
  'Caused by: ServiceUnavailable(debugMessage=Timeout communicating with service.)',
  '\tat dev.hyo.openiap.OpenIapErrorExtensionsKt.fromBillingResponseCode(OpenIapErrorExtensions.kt:28)',
  '\tat dev.hyo.openiap.OpenIapErrorExtensionsKt.fromBillingResponseCode(OpenIapErrorExtensions.kt:18)',
].join('\n');

export const SERVICE_TIMEOUT = [
  '{"code":"service-timeout","message":"The request has reached the maximum timeout before billing service responds","debugMessage":"Timeout."}',
  'Caused by: ServiceTimeout(debugMessage=Timeout.)',
  '\tat dev.hyo.openiap.OpenIapErrorExtensionsKt.fromBillingResponseCode(OpenIapErrorExtensions.kt:37)',
  '\tat dev.hyo.openiap.OpenIapErrorExtensionsKt.fromBillingResponseCode(OpenIapErrorExtensions.kt:18)',
].join('\n');

export const SERVICE_ERROR_ECHOING_DISCONNECTED = [
  '{"code":"service-error","message":"Billing error","debugMessage":"{\\"code\\":\\"service-disconnected\\"}"}',
  'Caused by: BillingError(debugMessage={"code":"service-disconnected"})',
  '\tat dev.hyo.openiap.OpenIapErrorExtensionsKt.fromBillingResponseCode(OpenIapErrorExtensions.kt:32)',
  '\tat dev.hyo.openiap.OpenIapErrorExtensionsKt.fromBillingResponseCode(OpenIapErrorExtensions.kt:18)',
].join('\n');
