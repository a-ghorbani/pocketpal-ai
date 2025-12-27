/**
 * Shared WebDriverIO configuration for PocketPal E2E tests
 */

exports.config = {
  runner: 'local',
  specs: ['./specs/**/*.spec.js'],
  exclude: [],
  maxInstances: 1,

  logLevel: 'info',
  bail: 0,
  waitforTimeout: 30000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  framework: 'mocha',
  reporters: ['spec'],

  mochaOpts: {
    ui: 'bdd',
    timeout: 600000, // 10 minutes - model downloads and inference can be slow
  },

  // Custom commands for common operations
  before: function () {
    // Add custom commands
    browser.addCommand('waitForElement', async function (selector, timeout = 30000) {
      const element = await $(selector);
      await element.waitForDisplayed({ timeout });
      return element;
    });

    browser.addCommand('tapByAccessibilityId', async function (accessibilityId, timeout = 30000) {
      const selector = `~${accessibilityId}`;
      const element = await browser.waitForElement(selector, timeout);
      await element.click();
    });

    browser.addCommand('tapByTestId', async function (testId, timeout = 30000) {
      // Android uses resource-id, iOS uses accessibilityIdentifier
      const isAndroid = driver.isAndroid;
      const selector = isAndroid
        ? `//*[@resource-id="${testId}" or @content-desc="${testId}"]`
        : `~${testId}`;
      const element = await browser.waitForElement(selector, timeout);
      await element.click();
    });

    browser.addCommand('inputText', async function (selector, text) {
      const element = await browser.waitForElement(selector);
      await element.setValue(text);
    });

    browser.addCommand('waitForText', async function (text, timeout = 60000) {
      const selector = `//*[contains(@text, "${text}") or contains(@label, "${text}") or contains(@value, "${text}")]`;
      await browser.waitForElement(selector, timeout);
    });
  },
};
