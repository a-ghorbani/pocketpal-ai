/**
 * WebDriverIO configuration for AWS Device Farm iOS testing
 *
 * This config reads from Device Farm environment variables:
 * - DEVICEFARM_DEVICE_UDID: Device UDID
 * - DEVICEFARM_APP_PATH: Path to the installed app
 * - APPIUM_HOST: Appium server host (default: 127.0.0.1)
 * - APPIUM_PORT: Appium server port (default: 4723)
 */

import {config as sharedConfig} from './wdio.shared.conf';
import type {Options} from '@wdio/types';

// Device Farm environment variables
const DEVICE_UDID = process.env.DEVICEFARM_DEVICE_UDID || process.env.DEVICE_UDID;
const APP_PATH = process.env.DEVICEFARM_APP_PATH || process.env.APP_PATH;
const APPIUM_HOST = process.env.APPIUM_HOST || '127.0.0.1';
const APPIUM_PORT = parseInt(process.env.APPIUM_PORT || '4723', 10);
// Pre-built WebDriverAgent path for Device Farm (required for iOS 26+, works with iOS 18.5)
const WDA_DERIVED_DATA_PATH = process.env.DEVICEFARM_APPIUM_WDA_DERIVED_DATA_PATH_V9;

export const config: Options.Testrunner = {
  ...sharedConfig,

  // Connect to the Appium server started by Device Farm test spec
  hostname: APPIUM_HOST,
  port: APPIUM_PORT,
  path: '/wd/hub',

  capabilities: [
    {
      platformName: 'iOS',
      'appium:deviceName': 'iPhone',
      'appium:udid': DEVICE_UDID,
      'appium:automationName': 'XCUITest',
      'appium:app': APP_PATH,
      'appium:bundleId': 'ai.pocketpal',
      'appium:noReset': false,
      'appium:fullReset': false,
      'appium:newCommandTimeout': 300,
      'appium:autoAcceptAlerts': true,
      // Use pre-built WDA already installed on Device Farm devices
      'appium:usePrebuiltWDA': true,
      ...(WDA_DERIVED_DATA_PATH && {'appium:derivedDataPath': WDA_DERIVED_DATA_PATH}),
    },
  ],

  // No Appium service - Device Farm manages Appium
  services: [],
} as Options.Testrunner;
