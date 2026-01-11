/**
 * WebDriverIO configuration for AWS Device Farm Android testing
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

export const config: Options.Testrunner = {
  ...sharedConfig,

  // Connect to the Appium server started by Device Farm test spec
  hostname: APPIUM_HOST,
  port: APPIUM_PORT,
  path: '/wd/hub',

  capabilities: [
    {
      platformName: 'Android',
      'appium:deviceName': DEVICE_UDID || 'Android Device',
      'appium:udid': DEVICE_UDID,
      'appium:automationName': 'UiAutomator2',
      'appium:app': APP_PATH,
      'appium:appPackage': 'com.pocketpalai',
      'appium:appActivity': 'com.pocketpal.MainActivity',
      'appium:noReset': false,
      'appium:fullReset': true,
      'appium:newCommandTimeout': 300,
      'appium:autoGrantPermissions': true,
      'appium:skipUnlock': true,
    },
  ],

  // No Appium service - Device Farm manages Appium
  services: [],
} as Options.Testrunner;
