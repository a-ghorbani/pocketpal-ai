import {Platform} from 'react-native';

import {
  PERMISSIONS,
  RESULTS,
  check,
  request,
  openSettings,
} from 'react-native-permissions';

/**
 * Outcome of a microphone-permission request, mapped to the three states the
 * push-to-talk capture flow cares about:
 * - `granted`  → start capture
 * - `denied`   → user declined this time; can be re-prompted
 * - `blocked`  → permanently denied (don't-ask-again); must open Settings
 */
export type MicPermissionResult = 'granted' | 'denied' | 'blocked';

const MIC_PERMISSION =
  Platform.OS === 'ios'
    ? PERMISSIONS.IOS.MICROPHONE
    : PERMISSIONS.ANDROID.RECORD_AUDIO;

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
    const result = await request(MIC_PERMISSION);
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
