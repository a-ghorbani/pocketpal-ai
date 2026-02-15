/**
 * WebDriverIO configuration for local Android testing
 * TypeScript version
 *
 * Env var overrides (all optional, defaults match previous hardcoded values):
 *   E2E_DEVICE_NAME       - Emulator/device name (default: 'emulator-5554')
 *   E2E_PLATFORM_VERSION  - Android version (default: '16')
 *   E2E_DEVICE_UDID       - Device UDID (default: undefined = emulator auto-selection)
 *   E2E_APP_PATH           - Path to APK (default: release APK build)
 *   E2E_APPIUM_PORT        - Appium server port (default: 4723)
 */

import {config as sharedConfig} from './wdio.shared.conf';
import type {Options} from '@wdio/types';

// Env-var-driven configuration with backward-compatible defaults
const DEVICE_NAME = process.env.E2E_DEVICE_NAME || 'emulator-5554';
const PLATFORM_VERSION = process.env.E2E_PLATFORM_VERSION || '16';
const DEVICE_UDID = process.env.E2E_DEVICE_UDID; // undefined = emulator auto-selection
const APP_PATH = process.env.E2E_APP_PATH || '../android/app/build/outputs/apk/release/app-release.apk';
const APPIUM_PORT = parseInt(process.env.E2E_APPIUM_PORT || '4723', 10);

export const config: Options.Testrunner = {
  ...sharedConfig,

  // Override port if non-default
  ...(APPIUM_PORT !== 4723 && {port: APPIUM_PORT}),

  capabilities: [
    {
      platformName: 'Android',
      'appium:deviceName': DEVICE_NAME,
      'appium:platformVersion': PLATFORM_VERSION,
      'appium:automationName': 'UiAutomator2',
      'appium:app': APP_PATH,
      'appium:appPackage': 'com.pocketpalai',
      'appium:appActivity': 'com.pocketpal.MainActivity',
      // Force fresh install to ensure clean state
      'appium:noReset': false,
      'appium:fullReset': true,
      'appium:newCommandTimeout': 300,
      'appium:autoGrantPermissions': true,
      // Skip lock handling - emulator should be unlocked manually or have no lock
      'appium:skipUnlock': true,
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
