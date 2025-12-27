/**
 * E2E Test: Model Download and Chat Flow
 *
 * This test verifies the complete flow:
 * 1. Navigate to Models page
 * 2. Open HuggingFace search
 * 3. Search for "smollm2 135m instruct" by author "bartowski"
 * 4. Open model details
 * 5. Download the model
 * 6. Wait for download to complete
 * 7. Navigate back and load the model
 * 8. Navigate to Chat
 * 9. Send a message and verify response
 */

const selectors = require('../helpers/selectors');
const actions = require('../helpers/actions');

describe('PocketPal - Model Download and Chat', () => {
  // Test configuration
  const MODEL_SEARCH_QUERY = 'smollm2 135m instruct';
  const MODEL_AUTHOR = 'bartowski';
  const DOWNLOAD_TIMEOUT = 300000; // 5 minutes for download
  const INFERENCE_TIMEOUT = 120000; // 2 minutes for inference

  beforeEach(async () => {
    // Wait for app to fully load
    await driver.pause(3000);
  });

  it('should download a model from HuggingFace and chat with it', async () => {
    console.log('Step 1: Navigate to Models screen');
    await actions.navigateToModels();

    console.log('Step 2: Open HuggingFace search');
    await actions.openHFSearch();

    console.log('Step 3: Search for model with author filter');
    await actions.searchHFModel(MODEL_SEARCH_QUERY, MODEL_AUTHOR);

    console.log('Step 4: Select the model from search results');
    // Wait for search results and tap on the first matching result
    // The model item should contain the author name
    const modelItemSelector = selectors.hfSearch.modelItemByText(MODEL_AUTHOR, MODEL_SEARCH_QUERY);
    await actions.tap(modelItemSelector, 30000);
    await driver.pause(1000);

    console.log('Step 5: Download the model');
    // In the details view, tap the download button for the model file
    await actions.tap(selectors.modelFile.downloadButton, 10000);
    await driver.pause(2000);

    console.log('Step 6: Wait for download to complete');
    // Close the HF search sheet by pressing back or tapping outside
    await driver.back();
    await driver.pause(1000);

    // Wait for download to complete (checking for progress bar disappearance)
    await actions.waitForDownloadComplete(DOWNLOAD_TIMEOUT);
    console.log('Download completed!');

    console.log('Step 7: Find and load the downloaded model');
    // Scroll to find the model in the list if needed
    await actions.scrollDown();
    await driver.pause(1000);

    // Load the model
    await actions.tap(selectors.modelCard.loadButton, 30000);

    // Wait for model to finish loading
    await driver.pause(10000);
    console.log('Model loaded!');

    console.log('Step 8: Navigate to Chat screen');
    await actions.navigateToChat();
    await driver.pause(1000);

    console.log('Step 9: Send a message');
    await actions.sendMessage('Hi');
    console.log('Message sent!');

    console.log('Step 10: Wait for AI response');
    // Wait for the AI to respond (this can take a while on device)
    await actions.waitForResponse(INFERENCE_TIMEOUT);
    console.log('Response received!');

    // Verify no error occurred
    const hasError = await actions.isDisplayed(selectors.byPartialText('Error'), 2000);
    expect(hasError).toBe(false);

    console.log('Test completed successfully!');
  });

  afterEach(async () => {
    // Take screenshot on failure
    if (this.currentTest?.state === 'failed') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await driver.saveScreenshot(`./screenshots/failure-${timestamp}.png`);
    }
  });
});
