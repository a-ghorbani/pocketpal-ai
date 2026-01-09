/**
 * WebDriverIO configuration for local Android testing
 * TypeScript version
 */

import {config as sharedConfig} from './wdio.shared.conf';
import type {Options} from '@wdio/types';

export const config: Options.Testrunner = {
  ...sharedConfig,

  capabilities: [
    {
      platformName: 'Android',
      'appium:deviceName': 'emulator-5554',
      'appium:platformVersion': '16',
      'appium:automationName': 'UiAutomator2',
      // Use release build to avoid needing Metro bundler
      'appium:app': '../android/app/build/outputs/apk/release/app-release.apk',
      'appium:appPackage': 'com.pocketpalai',
      'appium:appActivity': 'com.pocketpal.MainActivity',
      // Force fresh install to ensure clean state
      'appium:noReset': false,
      'appium:fullReset': true,
      'appium:newCommandTimeout': 300,
      'appium:autoGrantPermissions': true,
      // Skip lock handling - emulator should be unlocked manually or have no lock
      'appium:skipUnlock': true,
    },
  ],

  services: [
    [
      'appium',
      {
        args: {
          allowInsecure: ['chromedriver_autodownload'],
        },
      },
    ],
  ],
} as Options.Testrunner;
