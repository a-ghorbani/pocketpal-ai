import {AppState, Platform} from 'react-native';

import {
  PERMISSIONS,
  RESULTS,
  check,
  request,
  openSettings,
  type PermissionStatus,
} from 'react-native-permissions';

/**
 * Outcome of a microphone-permission request, mapped to the three states the
 * voice capture flow cares about:
 * - `granted`  → start capture
 * - `denied`   → user declined this time; can be re-prompted
 * - `blocked`  → permanently denied (don't-ask-again); must open Settings
 */
export type MicPermissionResult = 'granted' | 'denied' | 'blocked';

const MIC_PERMISSION =
  Platform.OS === 'ios'
    ? PERMISSIONS.IOS.MICROPHONE
    : PERMISSIONS.ANDROID.RECORD_AUDIO;

const ANDROID_NO_DIALOG_MS = 1500;

// Android 16 answers a request for a user-fixed permission without showing a
// dialog, and React Native delivers permission results only on the next
// onResume, so request() would stay pending until the app is backgrounded.
// A real dialog takes the app out of 'active'; if that never happens, no
// dialog was shown and the permission is blocked.
function requestAndroid(): Promise<PermissionStatus> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        clearTimeout(timer);
      }
    });
    const settle = (finish: () => void) => {
      clearTimeout(timer);
      subscription.remove();
      finish();
    };
    timer = setTimeout(
      () => settle(() => resolve(RESULTS.BLOCKED)),
      ANDROID_NO_DIALOG_MS,
    );
    request(MIC_PERMISSION).then(
      status => settle(() => resolve(status)),
      err => settle(() => reject(err)),
    );
  });
}

/**
 * Ensure RECORD_AUDIO (Android) / NSMicrophoneUsageDescription (iOS) is
 * granted, requesting it if needed. Returns the mapped result so the caller
 * can route a `blocked` outcome to an open-Settings affordance.
 */
export async function ensureMicPermission(): Promise<MicPermissionResult> {
  try {
    const current = await check(MIC_PERMISSION);
    if (current === RESULTS.GRANTED || current === RESULTS.LIMITED) {
      return 'granted';
    }
    if (current === RESULTS.BLOCKED || current === RESULTS.UNAVAILABLE) {
      return 'blocked';
    }
    const result =
      Platform.OS === 'android'
        ? await requestAndroid()
        : await request(MIC_PERMISSION);
    if (result === RESULTS.GRANTED || result === RESULTS.LIMITED) {
      return 'granted';
    }
    if (result === RESULTS.BLOCKED || result === RESULTS.UNAVAILABLE) {
      return 'blocked';
    }
    return 'denied';
  } catch (err) {
    console.warn('[asrMicPermission] permission request failed:', err);
    return 'denied';
  }
}

/** Open the OS app-settings page so the user can grant a blocked permission. */
export async function openMicSettings(): Promise<void> {
  try {
    await openSettings();
  } catch (err) {
    console.warn('[asrMicPermission] openSettings failed:', err);
  }
}
