/**
 * WebDriverIO configuration for AWS Device Farm iOS testing
 * This config is used when running tests on real devices in AWS Device Farm
 */
const { config } = require('./wdio.shared.conf');

exports.config = {
  ...config,

  // AWS Device Farm provides the capabilities
  capabilities: [
    {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:noReset': false,
      'appium:fullReset': false,
      'appium:newCommandTimeout': 300,
      'appium:autoAcceptAlerts': true,
    },
  ],

  // No Appium service - AWS Device Farm provides the server
  services: [],

  // AWS Device Farm Appium server
  hostname: '127.0.0.1',
  port: 4723,
  path: '/wd/hub',
};
