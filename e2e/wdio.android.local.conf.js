/**
 * WebDriverIO configuration for local Android testing
 */
const { config } = require('./wdio.shared.conf');

exports.config = {
  ...config,

  capabilities: [
    {
      platformName: 'Android',
      'appium:deviceName': 'Android Emulator',
      'appium:platformVersion': '14',
      'appium:automationName': 'UiAutomator2',
      'appium:app': '../android/app/build/outputs/apk/release/app-release.apk',
      'appium:appPackage': 'com.pocketpal',
      'appium:appActivity': '.MainActivity',
      'appium:noReset': false,
      'appium:fullReset': false,
      'appium:newCommandTimeout': 300,
      'appium:autoGrantPermissions': true,
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
};
