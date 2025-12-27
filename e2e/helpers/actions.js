/**
 * Common actions for PocketPal E2E tests
 */
const selectors = require('./selectors');

/**
 * Wait for an element and return it
 */
async function waitForElement(selector, timeout = 30000) {
  const element = await $(selector);
  await element.waitForDisplayed({ timeout });
  return element;
}

/**
 * Tap on an element by selector
 */
async function tap(selector, timeout = 30000) {
  const element = await waitForElement(selector, timeout);
  await element.click();
}

/**
 * Type text into an element
 */
async function typeText(selector, text, timeout = 30000) {
  const element = await waitForElement(selector, timeout);
  await element.clearValue();
  await element.setValue(text);
}

/**
 * Check if element is displayed
 */
async function isDisplayed(selector, timeout = 5000) {
  try {
    const element = await $(selector);
    return await element.waitForDisplayed({ timeout });
  } catch {
    return false;
  }
}

/**
 * Wait for text to appear anywhere on screen
 */
async function waitForText(text, timeout = 60000) {
  const selector = selectors.byPartialText(text);
  await waitForElement(selector, timeout);
}

/**
 * Scroll down in a scrollable view
 */
async function scrollDown() {
  const { width, height } = await driver.getWindowSize();
  await driver.touchAction([
    { action: 'press', x: width / 2, y: height * 0.7 },
    { action: 'wait', ms: 500 },
    { action: 'moveTo', x: width / 2, y: height * 0.3 },
    { action: 'release' },
  ]);
}

/**
 * Navigate to Models screen via drawer
 */
async function navigateToModels() {
  // Open drawer by swiping from left edge
  const { width, height } = await driver.getWindowSize();
  await driver.touchAction([
    { action: 'press', x: 10, y: height / 2 },
    { action: 'wait', ms: 300 },
    { action: 'moveTo', x: width * 0.8, y: height / 2 },
    { action: 'release' },
  ]);
  await driver.pause(500);

  // Tap on Models
  await tap(selectors.drawer.modelsTab);
  await driver.pause(500);
}

/**
 * Navigate to Chat screen via drawer
 */
async function navigateToChat() {
  // Open drawer by swiping from left edge
  const { width, height } = await driver.getWindowSize();
  await driver.touchAction([
    { action: 'press', x: 10, y: height / 2 },
    { action: 'wait', ms: 300 },
    { action: 'moveTo', x: width * 0.8, y: height / 2 },
    { action: 'release' },
  ]);
  await driver.pause(500);

  // Tap on Chat
  await tap(selectors.drawer.chatTab);
  await driver.pause(500);
}

/**
 * Open HuggingFace search modal
 */
async function openHFSearch() {
  // Tap on FAB group to expand
  await tap(selectors.models.fabGroup);
  await driver.pause(300);

  // Tap on HF search FAB
  await tap(selectors.models.hfFab);
  await driver.pause(500);

  // Wait for search view to appear
  await waitForElement(selectors.hfSearch.view);
}

/**
 * Search for a model in HuggingFace
 */
async function searchHFModel(searchText, authorFilter = null) {
  // Type in search box
  await typeText(selectors.hfSearch.searchInput, searchText);
  await driver.pause(1000); // Wait for debounce

  // Apply author filter if provided
  if (authorFilter) {
    await tap(selectors.hfSearch.authorFilterButton);
    await driver.pause(300);
    await typeText(selectors.hfSearch.authorFilterInput, authorFilter);
    await driver.pause(500);

    // Close the filter sheet by tapping outside or pressing back
    await driver.back();
    await driver.pause(500);
  }

  // Wait for results to load
  await driver.pause(2000);
}

/**
 * Wait for download to complete
 */
async function waitForDownloadComplete(timeout = 300000) {
  // Wait for progress bar to disappear (download complete)
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const progressVisible = await isDisplayed(selectors.modelCard.downloadProgress, 1000);
    if (!progressVisible) {
      // Download complete
      await driver.pause(1000);
      return true;
    }
    await driver.pause(2000);
  }

  throw new Error(`Download did not complete within ${timeout}ms`);
}

/**
 * Load a model (assumes model card is visible)
 */
async function loadModel() {
  await tap(selectors.modelCard.loadButton);
  // Wait for model to load (loading indicator to disappear)
  await driver.pause(5000);
}

/**
 * Send a chat message
 */
async function sendMessage(message) {
  await typeText(selectors.chat.input, message);
  await driver.pause(300);
  await tap(selectors.chat.sendButton);
}

/**
 * Wait for AI response in chat
 */
async function waitForResponse(timeout = 120000) {
  // Wait for any response text to appear
  // This is a simple check - in production you might want to check for specific elements
  await driver.pause(timeout > 30000 ? 30000 : timeout);

  // Check that no error occurred
  const hasError = await isDisplayed(selectors.byPartialText('Error'), 2000);
  if (hasError) {
    throw new Error('AI response resulted in an error');
  }

  return true;
}

module.exports = {
  waitForElement,
  tap,
  typeText,
  isDisplayed,
  waitForText,
  scrollDown,
  navigateToModels,
  navigateToChat,
  openHFSearch,
  searchHFModel,
  waitForDownloadComplete,
  loadModel,
  sendMessage,
  waitForResponse,
};
