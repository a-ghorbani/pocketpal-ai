/**
 * E2E Test: Navigation and Model Search Flow
 *
 * Verifies core navigation and model search functionality:
 * 1. App opens on Chat screen
 * 2. Navigate to Models screen via drawer
 * 3. Open HuggingFace search via FAB
 * 4. Verify search sheet is displayed with model results
 * 5. Close the search sheet
 *
 * Uses testID-based selectors for cross-platform reliability.
 */

import {expect} from '@wdio/globals';
import {ChatPage} from '../pages/ChatPage';
import {DrawerPage} from '../pages/DrawerPage';
import {ModelsPage} from '../pages/ModelsPage';
import {HFSearchSheet} from '../pages/HFSearchSheet';

// Declare globals
declare const driver: WebdriverIO.Browser;

describe('PocketPal - Navigation and Model Search', () => {
  // Page instances - created fresh for each test
  let chatPage: ChatPage;
  let drawerPage: DrawerPage;
  let modelsPage: ModelsPage;
  let hfSearchSheet: HFSearchSheet;

  beforeEach(async () => {
    // Instantiate page objects inside beforeEach (after browser is ready)
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    modelsPage = new ModelsPage();
    hfSearchSheet = new HFSearchSheet();

    // Wait for app to fully initialize
    await chatPage.waitForReady(60000);
  });

  afterEach(async function (this: Mocha.Context) {
    // Capture screenshot on failure for debugging
    if (this.currentTest?.state === 'failed') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const testName = this.currentTest.title.replace(/\s+/g, '-');
      try {
        await driver.saveScreenshot(
          `./debug-output/failure-${testName}-${timestamp}.png`,
        );
      } catch (e) {
        console.error('Failed to capture screenshot:', (e as Error).message);
      }
    }
  });

  it('should navigate to Models screen and open HF search', async () => {
    // Step 1: Verify app opens on Chat screen
    await expect(chatPage.chatInput).toBeDisplayed();

    // Step 2: Navigate to Models screen via drawer
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await expect(drawerPage.modelsTab).toBeDisplayed();

    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();

    // Step 3: Verify FAB is visible on Models screen
    await expect(modelsPage.fabButton).toBeDisplayed();

    // Step 4: Open HuggingFace search via FAB
    await modelsPage.openHuggingFaceSearch();
    await hfSearchSheet.waitForReady();
    await expect(hfSearchSheet.searchView).toBeDisplayed();

    // Step 5: Verify search sheet has the search bar visible
    await expect(hfSearchSheet.searchBar).toBeDisplayed();

    // Step 6: Close the search sheet
    await hfSearchSheet.close();

    // Step 7: Verify we're back on the Models screen
    await modelsPage.waitForReady();
    await expect(modelsPage.fabButton).toBeDisplayed();
  });
});
