import {Platform, PermissionsAndroid, Alert} from 'react-native';
import {uiStore} from '../store';

export async function ensureLegacyStoragePermission() {
  // Skip everything on iOS or any Android 11+ device (API 29+)
  if (Platform.OS !== 'android' || Platform.Version >= 29) {
    return true;
  }

  // Ask for storage permission on API 23‑28 (Android 6-9)
  const needed = PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;

  // Already granted? → done
  const already = await PermissionsAndroid.check(needed);
  if (already) {
    return true;
  }

  const l10n = uiStore.l10n;

  // Optional rationale dialog
  const rationale = {
    title: l10n.components.exportUtils.permissionRequired,
    message: l10n.components.exportUtils.permissionMessage,
    buttonPositive: l10n.components.exportUtils.continue,
    buttonNegative: l10n.common.cancel,
  };

  // Show the system prompt
  const results = await PermissionsAndroid.request(needed, rationale);

  const granted = results === PermissionsAndroid.RESULTS.GRANTED;

  if (!granted) {
    Alert.alert(
      l10n.components.exportUtils.permissionDenied,
      l10n.components.exportUtils.permissionDeniedMessage,
      [{text: 'OK'}],
    );
  }
  return granted;
}

let notificationPermissionAsked: Promise<void> | undefined;

async function askNotificationPermission(): Promise<void> {
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  try {
    if (!(await PermissionsAndroid.check(permission))) {
      await PermissionsAndroid.request(permission);
    }
  } catch (error) {
    console.warn('Notification permission request failed:', error);
  }
}

/** Asks at most once per app session, so chained downloads never re-prompt. */
export function ensureNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 34) {
    return Promise.resolve();
  }
  notificationPermissionAsked ??= askNotificationPermission();
  return notificationPermissionAsked;
}
