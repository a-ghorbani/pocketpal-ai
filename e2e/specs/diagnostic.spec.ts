/**
 * Diagnostic test for debugging element selectors
 *
 * Saves page source XML at each navigation step to help identify
 * correct selectors when tests fail. Check e2e/debug-output/ for output.
 */

import * as fs from 'fs';
import * as path from 'path';
import {ChatPage} from '../pages/ChatPage';
import {DrawerPage} from '../pages/DrawerPage';
import {ModelsPage} from '../pages/ModelsPage';
import {HFSearchSheet} from '../pages/HFSearchSheet';
import {Selectors} from '../helpers/selectors';
import { ModelDetailsSheet } from '../pages';

declare const driver: WebdriverIO.Browser;

const OUTPUT_DIR = path.join(__dirname, '../debug-output');

/**
 * Save page source XML for analysis
 */
async function savePageSource(filename: string): Promise<string> {
  const pageSource = await driver.getPageSource();

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, {recursive: true});
  }

  const platform = driver.isAndroid ? "Android" : driver.isIOS ? "iOS" : "unknown"; 
  const filePath = path.join(OUTPUT_DIR, `${filename}-${platform}.xml`);
  fs.writeFileSync(filePath, pageSource);
  console.log(`Saved: ${filePath}`);

  return pageSource;
}

/**
 * Log selector being used
 */
function logSelector(name: string, selector: string): void {
  console.log(`  ${name}: ${selector}`);
}

describe('Diagnostic - Element Selector Analysis', () => {
  let chatPage: ChatPage;
  let drawerPage: DrawerPage;
  let modelsPage: ModelsPage;
  let hfSearchSheet: HFSearchSheet;
  let modelDetailsSheet: ModelDetailsSheet;

  beforeEach(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    modelsPage = new ModelsPage();
    hfSearchSheet = new HFSearchSheet();
    modelDetailsSheet = new ModelDetailsSheet();

    await chatPage.waitForReady(30000);
  });

  it('should dump page source at each navigation step', async () => {
    console.log('\n=== STEP 1: Chat Screen ===');
    logSelector('chat.input', Selectors.chat.input);
    logSelector('chat.menuButton', Selectors.chat.menuButton);
    await savePageSource('01-chat-screen');

    console.log('\n=== STEP 2: Drawer Open ===');
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    logSelector('drawer.modelsTab', Selectors.drawer.modelsTab);
    logSelector('drawer.chatTab', Selectors.drawer.chatTab);
    await savePageSource('02-drawer-open');

    console.log('\n=== STEP 3: Models Screen ===');
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();
    logSelector('models.fabGroup', Selectors.models.fabGroup);
    logSelector('models.menuButton', Selectors.models.menuButton);
    await savePageSource('03-models-screen');

    console.log('\n=== STEP 4: HF Search Sheet ===');
    // openHuggingFaceSearch() internally expands the FAB menu first
    await modelsPage.openHuggingFaceSearch();
    await hfSearchSheet.waitForReady();
    await driver.pause(1500);
    logSelector('hfSearch.view', Selectors.hfSearch.view);
    logSelector('hfSearch.searchBar', Selectors.hfSearch.searchBar);
    logSelector('hfSearch.searchInput', Selectors.hfSearch.searchInput);
    logSelector('common.sheetHandle', Selectors.common.sheetHandle);
    await hfSearchSheet.search('bartowski smollm2 135m');
    await savePageSource('04-hf-search-sheet');

    console.log('\n=== STEP 5: Select Model ===');
    await hfSearchSheet.selectModel('SmolLM2-135M-Instruct');
    await driver.pause(100);
    await savePageSource('05-model-details');

    await modelDetailsSheet.close();
    await hfSearchSheet.close();
    await modelsPage.waitForReady();

    console.log('\n=== DIAGNOSTIC COMPLETE ===');
    console.log(`Output saved to: ${OUTPUT_DIR}`);
  });
});
