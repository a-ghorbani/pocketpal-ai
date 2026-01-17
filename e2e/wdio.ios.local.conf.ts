/**
 * WebDriverIO configuration for local iOS testing
 * TypeScript version
 *
 * Build the release app before running tests:
 *   yarn ios:build:e2e
 */

import {config as sharedConfig} from './wdio.shared.conf';
import type {Options} from '@wdio/types';

// Use release build with known path (no Metro bundler required)
const APP_PATH = '../ios/build/Build/Products/Release-iphonesimulator/PocketPal.app';

export const config: Options.Testrunner = {
  ...sharedConfig,

  capabilities: [
    {
      platformName: 'iOS',
      'appium:deviceName': 'iPhone 17 Pro',
      'appium:platformVersion': '26.0',
      'appium:automationName': 'XCUITest',
      'appium:app': APP_PATH,
      'appium:bundleId': 'ai.pocketpal',
      'appium:noReset': false,
      'appium:fullReset': false,
      'appium:newCommandTimeout': 300,
      'appium:autoAcceptAlerts': true,
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
