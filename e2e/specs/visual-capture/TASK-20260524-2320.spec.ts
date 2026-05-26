/**
 * Per-story visual-capture spec — FOU-115 Phase 2 (Surface swap consumers).
 *
 * Captures the two arbitrary UI surfaces touched by this PR:
 *   1. UsageStats tooltip (`memory-usage-tooltip`) — opened from chat header.
 *   2. PalDetailSheet stats section — opened from Pals screen tap on a
 *      Palshub pal card.
 *
 * Pre/post procedure (manual workflow):
 *   # post-swap (this branch):
 *   VISUAL_CAPTURE_LABEL=post yarn e2e:ios --spec visual-capture/TASK-20260524-2320 --skip-build
 *
 *   # pre-swap reference: cherry-pick this file onto main and re-run:
 *   git checkout main
 *   git checkout feature/TASK-20260524-2320 -- e2e/specs/visual-capture/TASK-20260524-2320.spec.ts
 *   VISUAL_CAPTURE_LABEL=pre yarn e2e:ios --spec visual-capture/TASK-20260524-2320 --skip-build
 *
 * Output:
 *   e2e/debug-output/screenshots/visual-captures/TASK-20260524-2320/<label>/
 *     - usage-stats-tooltip.png
 *     - pal-detail-sheet-stats.png
 *
 * Caveats:
 *   - Network required for the PalDetailSheet capture (Palshub list fetch).
 *   - Cached model required for UsageStats (qwen3-0.6b — small, fast).
 *   - Best-effort: each phase is wrapped so a failure in one capture doesn't
 *     skip the other. Failures are logged and saved as `<name>-failed.txt`.
 */

import * as fs from 'fs';
import * as path from 'path';
import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {SettingsPage} from '../../pages/SettingsPage';
import {Selectors} from '../../helpers/selectors';
import {
  downloadAndLoadModel,
  dismissPerformanceWarningIfPresent,
} from '../../helpers/model-actions';
import {TIMEOUTS, ALL_MODELS} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

const TASK_ID = 'TASK-20260524-2320';
const LABEL = process.env.VISUAL_CAPTURE_LABEL || 'post';
const CAPTURE_DIR = path.join(
  SCREENSHOT_DIR,
  'visual-captures',
  TASK_ID,
  LABEL,
);

const SMALL_MODEL = ALL_MODELS.find(m => m.id === 'qwen3-0.6b');
if (!SMALL_MODEL) {
  throw new Error('qwen3-0.6b model fixture missing — update e2e/fixtures/models.ts');
}

function ensureCaptureDir(): void {
  if (!fs.existsSync(CAPTURE_DIR)) {
    fs.mkdirSync(CAPTURE_DIR, {recursive: true});
  }
}

async function captureScreenshot(name: string): Promise<void> {
  ensureCaptureDir();
  const file = path.join(CAPTURE_DIR, `${name}.png`);
  await driver.saveScreenshot(file);
  console.log(`[visual-capture] saved ${file}`);
}

function recordFailure(name: string, err: unknown): void {
  ensureCaptureDir();
  const file = path.join(CAPTURE_DIR, `${name}-failed.txt`);
  const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
  fs.writeFileSync(file, msg);
  console.warn(`[visual-capture] FAILED ${name}: ${msg}`);
}

describe(`Visual captures for ${TASK_ID} (label=${LABEL})`, () => {
  let chatPage: ChatPage;
  let drawerPage: DrawerPage;
  let settingsPage: SettingsPage;

  before(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    settingsPage = new SettingsPage();
    await chatPage.waitForReady(TIMEOUTS.appReady);

    // UsageStats tooltip needs a loaded model so the memory chart has data.
    await downloadAndLoadModel(SMALL_MODEL!);
    await dismissPerformanceWarningIfPresent();
  });

  it('captures UsageStats tooltip (`memory-usage-tooltip`)', async () => {
    try {
      // Enable Display Memory Usage if not already on. The switch lives deep
      // in the settings list, so scroll first.
      await chatPage.openDrawer();
      await drawerPage.waitForOpen();
      await drawerPage.navigateToSettings();
      await settingsPage.waitForReady();
      await settingsPage.scrollToDisplayMemoryUsageSwitch();

      const memSwitch = browser.$(Selectors.settings.displayMemoryUsageSwitch);
      await memSwitch.waitForDisplayed({timeout: 10000});
      const wasOn = (await memSwitch.getAttribute('value')) === '1';
      if (!wasOn) {
        await memSwitch.click();
        await browser.pause(500);
      }

      // Back to chat.
      await chatPage.openDrawer();
      await drawerPage.waitForOpen();
      await drawerPage.navigateToChat();
      await chatPage.waitForReady(TIMEOUTS.appReady);

      // Header memory indicator should be visible now.
      const touchable = browser.$('~memory-usage-touchable');
      await touchable.waitForDisplayed({timeout: 10000});
      await touchable.click();

      const tooltip = browser.$('~memory-usage-tooltip');
      await tooltip.waitForDisplayed({timeout: 5000});
      await browser.pause(300); // settle animation

      await captureScreenshot('usage-stats-tooltip');
    } catch (err) {
      recordFailure('usage-stats-tooltip', err);
      throw err;
    }
  });

  it('captures PalDetailSheet stats section', async () => {
    try {
      await chatPage.openDrawer();
      await drawerPage.waitForOpen();
      await drawerPage.navigateToPals();

      // The Pals screen renders either a sectioned ScrollView or a flat
      // FlatList depending on filter state — both contain SquarePalCard
      // instances. PalsHub cards carry `palshub-pal-card-<id>`; local cards
      // carry `local-pal-card-<id>`. We target PalsHub specifically because
      // only those open `PalDetailSheet` (the surface containing the
      // Surface swap we want to capture).
      const cardPredicate = (driver as any).isAndroid
        ? 'android=new UiSelector().resourceIdMatches("palshub-pal-card-.*")'
        : '-ios predicate string:name BEGINSWITH "palshub-pal-card-"';
      const firstCard = browser.$(cardPredicate);
      await firstCard.waitForDisplayed({timeout: 20000});
      await firstCard.click();

      // Sheet animation + content render.
      await browser.pause(1500);

      // Look for the download/buy button as a sheet-loaded sentinel.
      const downloadBtn = browser.$('~download-button');
      const downloadedBtn = browser.$('~downloaded-button');
      const buyBtn = browser.$('~buy-button');

      await browser.waitUntil(
        async () =>
          (await downloadBtn.isExisting()) ||
          (await downloadedBtn.isExisting()) ||
          (await buyBtn.isExisting()),
        {timeout: 10000, timeoutMsg: 'PalDetailSheet did not finish rendering'},
      );

      await captureScreenshot('pal-detail-sheet-stats');
    } catch (err) {
      recordFailure('pal-detail-sheet-stats', err);
      throw err;
    }
  });
});
