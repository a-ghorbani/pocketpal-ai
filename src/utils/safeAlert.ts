import {Alert, Platform, AlertButton, AlertOptions} from 'react-native';

/**
 * A safe wrapper around Alert.alert that handles Android Activity lifecycle issues.
 * On Android, Alert.alert can fail with "Tried to show an alert while not attached to an Activity"
 * if called before the Activity is ready. This wrapper uses setTimeout to defer the alert
 * until the next tick, ensuring the Activity is ready.
 *
 * @param title - The dialog's title
 * @param message - An optional message that appears below the title
 * @param buttons - An optional array of buttons
 * @param options - An optional Alert configuration
 */
export const safeAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
): void => {
  if (Platform.OS === 'android') {
    // On Android, defer the alert to the next tick to ensure Activity is ready
    setTimeout(() => {
      Alert.alert(title, message, buttons, options);
    }, 100);
  } else {
    // On iOS, show immediately
    Alert.alert(title, message, buttons, options);
  }
};
