/**
 * WebDriverIO configuration for local iOS testing
 * TypeScript version
 *
 * Build the release app before running tests:
 *   yarn ios:build:e2e
 *
 * Env var overrides (all optional, defaults match previous hardcoded values):
 *   E2E_DEVICE_NAME       - Simulator/device name (default: 'iPhone 17 Pro')
 *   E2E_PLATFORM_VERSION  - iOS version (default: '26.0')
 *   E2E_DEVICE_UDID       - Device UDID (default: undefined = simulator auto-selection)
 *   E2E_APP_PATH           - Path to .app or .ipa (default: release simulator build)
 *   E2E_APPIUM_PORT        - Appium server port (default: 4723)
 */

import {config as sharedConfig} from './wdio.shared.conf';
import type {Options} from '@wdio/types';

// Env-var-driven configuration with backward-compatible defaults
const DEVICE_NAME = process.env.E2E_DEVICE_NAME || 'iPhone 17 Pro';
const PLATFORM_VERSION = process.env.E2E_PLATFORM_VERSION || '26.0';
const DEVICE_UDID = process.env.E2E_DEVICE_UDID; // undefined = simulator auto-selection
const APP_PATH = process.env.E2E_APP_PATH || '../ios/build/Build/Products/Release-iphonesimulator/PocketPal.app';
const APPIUM_PORT = parseInt(process.env.E2E_APPIUM_PORT || '4723', 10);

export const config: Options.Testrunner = {
  ...sharedConfig,

  // Override port if non-default
  ...(APPIUM_PORT !== 4723 && {port: APPIUM_PORT}),

  capabilities: [
    {
      platformName: 'iOS',
      'appium:deviceName': DEVICE_NAME,
      'appium:platformVersion': PLATFORM_VERSION,
      'appium:automationName': 'XCUITest',
      'appium:app': APP_PATH,
      'appium:bundleId': 'ai.pocketpal',
      'appium:noReset': false,
      'appium:fullReset': false,
      'appium:newCommandTimeout': 300,
      'appium:autoAcceptAlerts': true,
      // Only include UDID if explicitly set (real devices need it)
      ...(DEVICE_UDID && {'appium:udid': DEVICE_UDID}),
    },
  ],

  services: [
    [
      'appium',
      {
        args: {
          allowInsecure: ['chromedriver_autodownload'],
          port: APPIUM_PORT,
        },
      },
    ],
  ],
} as Options.Testrunner;
