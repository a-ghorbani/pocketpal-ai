/**
 * @format
 */

// Import URL polyfill for React Native/Hermes compatibility
import 'react-native-url-polyfill/auto';

import {AppRegistry, LogBox} from 'react-native';

// The in-app warning toast covers chat-bottom controls and other UI
// elements that Appium needs to interact with. Silence LogBox at module
// init — no-op in true release builds where LogBox is already inactive.
LogBox.ignoreAllLogs(true);

import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
