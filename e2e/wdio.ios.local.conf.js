/**
 * WebDriverIO configuration for local iOS testing
 */
const { config } = require('./wdio.shared.conf');

exports.config = {
  ...config,

  capabilities: [
    {
      platformName: 'iOS',
      'appium:deviceName': 'iPhone 17 Pro',
      'appium:platformVersion': '26.0',
      'appium:udid': 'FC7F851B-B6C0-4E1D-B99B-335889FCC177',
      'appium:automationName': 'XCUITest',
      'appium:app': '../ios/build/Build/Products/Debug-iphonesimulator/PocketPal.app',
      'appium:bundleId': 'com.pocketpal',
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
};
