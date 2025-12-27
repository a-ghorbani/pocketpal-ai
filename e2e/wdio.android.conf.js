/**
 * WebDriverIO configuration for AWS Device Farm Android testing
 * This config is used when running tests on real devices in AWS Device Farm
 */
const { config } = require('./wdio.shared.conf');

exports.config = {
  ...config,

  // AWS Device Farm provides the capabilities
  capabilities: [
    {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:noReset': false,
      'appium:fullReset': false,
      'appium:newCommandTimeout': 300,
      'appium:autoGrantPermissions': true,
    },
  ],

  // No Appium service - AWS Device Farm provides the server
  services: [],

  // AWS Device Farm Appium server
  hostname: '127.0.0.1',
  port: 4723,
  path: '/wd/hub',
};
