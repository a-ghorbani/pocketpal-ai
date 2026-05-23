/**
 * @format
 */

// Import URL polyfill for React Native/Hermes compatibility
import 'react-native-url-polyfill/auto';

import {AppRegistry, LogBox} from 'react-native';

// The e2e flavor ships a debuggable release build (so `adb shell
// run-as` works for the automation bridge), which keeps LogBox active.
// The in-app warning toast covers UI elements (most visibly the
// Models-screen FAB) and breaks Appium selectors. Silence LogBox only
// in e2e builds so day-to-day dev sessions keep seeing warnings.
if (__E2E__) {
  LogBox.ignoreAllLogs(true);
}

import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
