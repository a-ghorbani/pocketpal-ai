import {PermissionsAndroid, Platform} from 'react-native';
import NativeForegroundService from '../specs/NativeForegroundService';

/**
 * Drives the Android foreground service that keeps a model run alive
 * while the app is backgrounded (see AgentRunService.kt). Every call is
 * failure-tolerant: if the native module is missing or the platform is
 * not Android, the run simply proceeds without the service - chat
 * behavior must never depend on notification plumbing.
 */

// Tri-state memory of the POST_NOTIFICATIONS answer (Android 13+).
// Never re-ask after a denial; the user can grant it from system
// settings later.
let notificationPermission: 'granted' | 'denied' | null = null;

async function ensureNotificationPermission(
  rationaleTitle: string,
  rationaleMessage: string,
  rationaleButton: string,
): Promise<void> {
  if (
    Platform.OS !== 'android' ||
    typeof Platform.Version !== 'number' ||
    Platform.Version < 33 ||
    notificationPermission !== null
  ) {
    return;
  }
  try {
    const res = await PermissionsAndroid.request(
      'android.permission.POST_NOTIFICATIONS',
      {
        title: rationaleTitle,
        message: rationaleMessage,
        buttonPositive: rationaleButton,
      },
    );
    notificationPermission =
      res === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
  } catch {
    notificationPermission = 'denied';
  }
}

/**
 * Start the run-in-progress foreground service. Resolves when the
 * notification permission has been settled (first run only); never
 * rejects. Denial does not skip the service - Android 13+ hides the
 * notification but the service still keeps the process alive.
 */
export const startForegroundRun = (
  title: string,
  text: string,
  rationale: {title: string; message: string; button: string},
): void => {
  ensureNotificationPermission(
    rationale.title,
    rationale.message,
    rationale.button,
  )
    .then(() => {
      NativeForegroundService.start(title, text);
    })
    .catch(() => {
      // Unreachable (ensureNotificationPermission never rejects), kept
      // for defensive completeness.
    });
};

/**
 * Update the run notification's body text. No-op when the service is
 * not running (e.g. a stray update after stop()).
 */
export const updateForegroundRun = (text: string): void => {
  try {
    NativeForegroundService.update(text);
  } catch (error) {
    console.warn('[foregroundService] update failed:', error);
  }
};

/**
 * Stop the run-in-progress foreground service and remove its
 * notification. Safe to call when not running.
 */
export const stopForegroundRun = (): void => {
  try {
    NativeForegroundService.stop();
  } catch (error) {
    console.warn('[foregroundService] stop failed:', error);
  }
};
