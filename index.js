/**
 * @format
 */

// Hermes/React Native ship neither URL nor TextDecoder; both must exist before
// the app graph loads.
import 'react-native-url-polyfill/auto';
import './src/utils/textDecoder';

import {AppRegistry, LogBox} from 'react-native';

// Silence LogBox in E2E builds so the in-app warning toast doesn't cover
// chat-bottom controls Appium needs. Left active otherwise so warnings
// surface during development.
if (__E2E__) {
  LogBox.ignoreAllLogs(true);
}

import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
