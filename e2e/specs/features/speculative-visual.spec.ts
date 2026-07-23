/**
 * Speculative Decoding — visual state capture
 *
 * Companion to `speculative.spec.ts`. That spec proves the feature engages;
 * this one walks every user-visible state the feature introduces and saves a
 * screenshot of each, so a reviewer can see the surfaces without a device:
 *
 *   1. Speculative section with the toggle OFF (baseline).
 *   2. Speculative section enabled with no model loaded.
 *   3. Draft-pick ignored note (no capable target — "carries no draft layers").
 *   4. MTP capability on a downloaded model card (Models screen) and its
 *      absence on a non-MTP card.
 *   5. MTP badge in the HF search details view (remote, pre-download path) and
 *      its absence for a non-MTP repo.
 *   6. No-effect note: speculative on, active model resolves to off.
 *   7. Draft cache rows DISABLED (resolution off) vs ENABLED (a usable draft),
 *      including the open cache-type menu.
 *   8. Draft-pick ignored note with an MTP target ("isn't compatible") and the
 *      cache rows in their embedded-MTP state.
 *
 * Environment: the Appium session reinstalls the app, which wipes its data
 * container, so the spec downloads both fixtures itself. It needs network for
 * the downloads, the HF search, and the remote GGUF header range-fetch that
 * drives the details-view badge.
 *
 * Usage:
 *   yarn e2e:ios --spec speculative-visual --devices virtual-only --skip-build
 */

import * as fs from 'fs';
import * as path from 'path';
import {expect} from '@wdio/globals';
import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {ModelsPage} from '../../pages/ModelsPage';
import {HFSearchSheet} from '../../pages/HFSearchSheet';
import {ModelDetailsSheet} from '../../pages/ModelDetailsSheet';
import {SettingsPage} from '../../pages/SettingsPage';
import {Selectors, byTestId, byPartialText} from '../../helpers/selectors';
import {Gestures} from '../../helpers/gestures';
import {dismissPerformanceWarningIfPresent} from '../../helpers/model-actions';
import {TIMEOUTS} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

/** Non-MTP text model: no embedded draft layers, unusable as a draft. */
const NON_MTP = {
  searchQuery: 'bartowski Qwen_Qwen3-0.6B',
  selectorText: 'Qwen_Qwen3-0.6B',
  downloadFile: 'Qwen_Qwen3-0.6B-Q4_0.gguf',
  /** Distinctive fragment of the model name as listed in the draft picker. */
  nameFragment: 'Qwen3-0.6B',
};

/** MTP-capable target: embedded nextn draft layers, resolves to `embedded`. */
const MTP = {
  searchQuery: 'unsloth Qwen3.5-0.8B-MTP-GGUF',
  selectorText: 'Qwen3.5-0.8B-MTP',
  downloadFile: 'Qwen3.5-0.8B-Q4_0.gguf',
  nameFragment: 'Qwen3.5-0.8B',
};

/** Matches speculative.spec.ts — the MTP model needs room to complete a turn. */
const SPEC_CONTEXT_SIZE = '4096';

/**
 * How long the details-view MTP probe gets. It range-fetches ~12 MB of GGUF
 * header in 2 MB chunks, and every chunk crosses the bridge base64-encoded, so
 * it is far slower on a device than the ~5s the same read takes in node.
 */
const BADGE_PROBE_TIMEOUT = 90000;

const SPEC_ACCORDION = byTestId('advanced-settings-accordion');
const SPEC_SWITCH = byTestId('speculative-decoding-switch');
const SPEC_PICKER = byTestId('speculative-draft-model-picker');
const SPEC_NO_EFFECT_NOTE = byTestId('speculative-no-effect-note');
const SPEC_IGNORED_NOTE = byTestId('speculative-draft-model-ignored-note');
const DRAFT_KEY_CACHE = byTestId('speculative-draft-key-cache-button');
const DRAFT_VALUE_CACHE = byTestId('speculative-draft-value-cache-button');
const MTP_BADGE = byTestId('mtp-capability-badge');

/** Capability string the model card appends for an MTP-capable model. */
const MTP_CAPABILITY_TEXT = 'Speculative (MTP)';
const DRAFT_MODEL_NONE_TEXT = 'None (embedded';

function nestedByTestId(testId: string): string {
  if ((browser as any).isAndroid) {
    return `.//*[contains(@resource-id, "${testId}")]`;
  }
  return `-ios predicate string:name == "${testId}"`;
}

async function saveShot(name: string): Promise<void> {
  try {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});
    }
    await driver.saveScreenshot(path.join(SCREENSHOT_DIR, `${name}.png`));
    console.log(`[capture] ${name}.png`);
  } catch (e) {
    console.error('Failed to capture screenshot:', (e as Error).message);
  }
}

/** Rendered text of an element (accessibility label carries it on both OSes). */
async function readLabel(selector: string): Promise<string> {
  const attr = (browser as any).isAndroid ? 'content-desc' : 'label';
  return (
    (await browser
      .$(selector)
      .getAttribute(attr)
      .catch(() => '')) || ''
  );
}

/**
 * Settings keeps its scroll offset and accordion state between visits (the
 * drawer navigator keeps the screen mounted), so every visit rewinds to the top
 * before scrolling to a target.
 */
async function scrollSettingsToTop(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Gestures.swipeDown();
  }
}

/**
 * Navigate to Settings without SettingsPage.navigateTo — that helper waits for
 * the context-size input to be *displayed*, and the Settings screen keeps the
 * scroll offset of the previous visit, so the input is usually off-screen.
 */
async function goToSettings(): Promise<void> {
  const chatPage = new ChatPage();
  const drawerPage = new DrawerPage();
  await chatPage.openDrawer();
  await drawerPage.waitForOpen();
  await drawerPage.navigateToSettings();
  await scrollSettingsToTop();
  await browser
    .$(byTestId('context-size-input'))
    .waitForDisplayed({timeout: TIMEOUTS.element});
}

/**
 * Scroll a settings row into view from the top of the screen, so a capture is
 * not at the mercy of where the previous step left the scroll offset. Rewinds
 * and retries once — a swipe swallowed by a keyboard or a menu leaves the list
 * short of the target.
 */
async function scrollSettingsTo(selector: string): Promise<boolean> {
  await scrollSettingsToTop();
  if (await Gestures.scrollToElement(selector, 12)) {
    return true;
  }
  await scrollSettingsToTop();
  return Gestures.scrollToElement(selector, 12);
}

/** Navigate to Settings and make sure the Advanced accordion is expanded. */
async function openAdvancedSection(navigate = true): Promise<void> {
  if (navigate) {
    await goToSettings();
  }
  if (!(await browser.$(SPEC_SWITCH).isExisting())) {
    if (!(await scrollSettingsTo(SPEC_ACCORDION))) {
      throw new Error('Advanced settings accordion never came into view');
    }
    await browser.$(SPEC_ACCORDION).click();
    await browser.pause(700);
  }
  await scrollSettingsTo(SPEC_SWITCH);
  await browser.$(SPEC_SWITCH).waitForExist({timeout: TIMEOUTS.element});
}

/**
 * The draft-model picker only renders while speculative is on, so its presence
 * is the reliable "enabled" signal (the DS Switch carries its testID on a
 * wrapper view and exposes no usable value attribute).
 */
async function setSpeculative(enabled: boolean): Promise<void> {
  const isOn = await browser.$(SPEC_PICKER).isExisting();
  if (isOn !== enabled) {
    await browser.$(SPEC_SWITCH).click();
    await browser.pause(800);
  }
}

/**
 * Menu entry whose text contains `fragment`, excluding the picker button —
 * the button renders the current pick, so it matches the same text and would
 * otherwise swallow the tap and leave the menu open over the next capture.
 */
function menuItemSelector(fragment: string): string {
  if ((browser as any).isAndroid) {
    return (
      `//*[(contains(@text, "${fragment}") or contains(@content-desc, "${fragment}"))` +
      ' and not(contains(@resource-id, "speculative-draft-model-picker"))]'
    );
  }
  return (
    `-ios predicate string:(label CONTAINS "${fragment}" OR value CONTAINS "${fragment}")` +
    ' AND name != "speculative-draft-model-picker"'
  );
}

/** Click the topmost displayed element matching `selector`. */
async function clickTopmost(selector: string): Promise<boolean> {
  const found = await browser
    .$(selector)
    .waitForExist({timeout: 8000})
    .then(() => true)
    .catch(() => false);
  if (!found) {
    return false;
  }
  const elements = browser.$$(selector);
  const count = await elements.length;
  for (let i = count - 1; i >= 0; i--) {
    if (await elements[i].isDisplayed().catch(() => false)) {
      await elements[i].click();
      await browser.pause(700);
      return true;
    }
  }
  return false;
}

/** Tap near the top of the screen to dismiss an open menu. */
async function dismissMenu(): Promise<void> {
  const {width, height} = await Gestures.getScreenSize();
  await browser
    .action('pointer', {parameters: {pointerType: 'touch'}})
    .move({x: Math.floor(width / 2), y: Math.floor(height * 0.08)})
    .down()
    .up()
    .perform();
  await browser.pause(500);
}

/** Pick a draft model from the picker menu; returns the picker's new label. */
async function selectDraftModel(fragment: string): Promise<string> {
  await Gestures.scrollToElement(SPEC_PICKER, 6);
  await browser.$(SPEC_PICKER).click();
  await browser.pause(800);
  const clicked = await clickTopmost(menuItemSelector(fragment));
  if (!clicked) {
    // Leaving the menu open would cover every later screen, so always close it.
    console.log(`[draft picker] no menu entry matched "${fragment}"`);
    await dismissMenu();
  }
  await browser.pause(500);
  const label = await readLabel(SPEC_PICKER);
  console.log(`[draft picker] "${fragment}" -> "${label}"`);
  return label;
}

/**
 * Download a model from HuggingFace WITHOUT loading it, and capture the
 * details-view header on the way (the MTP badge lives there). Returns once the
 * download has completed on the Models screen.
 */
async function downloadModelViaHFSearch(
  model: {searchQuery: string; selectorText: string; downloadFile: string},
  onDetailsView?: () => Promise<void>,
): Promise<void> {
  const modelsPage = new ModelsPage();
  const hfSearchSheet = new HFSearchSheet();
  const modelDetailsSheet = new ModelDetailsSheet();

  await modelsPage.openHuggingFaceSearch();
  await hfSearchSheet.waitForReady();
  await hfSearchSheet.search(model.searchQuery);
  await hfSearchSheet.selectModel(model.selectorText);
  await modelDetailsSheet.waitForReady();

  if (onDetailsView) {
    await onDetailsView();
  }

  await modelDetailsSheet.scrollToFile(model.downloadFile);
  await modelDetailsSheet.tapDownloadForFile(model.downloadFile);
  await modelDetailsSheet.close();
  await hfSearchSheet.close();
  await modelsPage.waitForReady();

  const containerSelector = Selectors.modelCard.cardContainer(
    model.downloadFile,
  );
  const container = browser.$(containerSelector);
  await container.waitForDisplayed({timeout: TIMEOUTS.download});
  // The load button only renders once the file is fully downloaded.
  await container
    .$(Selectors.modelCard.loadButtonElement)
    .waitForExist({timeout: TIMEOUTS.download});
  console.log(`[download] ${model.downloadFile} ready`);
}

/** Load an already-downloaded model from its Models-screen card. */
async function loadDownloadedModel(downloadFile: string): Promise<void> {
  const chatPage = new ChatPage();
  const drawerPage = new DrawerPage();
  const modelsPage = new ModelsPage();

  await chatPage.openDrawer();
  await drawerPage.waitForOpen();
  await drawerPage.navigateToModels();
  await modelsPage.waitForReady();

  // Release the previous model first: on the simulator, holding two models plus
  // a projection in Metal buffers at once is what tips a load into a crash.
  const offloadBtn = browser.$(Selectors.modelCard.offloadButton);
  if (await offloadBtn.isExisting()) {
    await offloadBtn.click();
    await browser.pause(4000);
    console.log('[load] released the previously active model');
  }

  const containerSelector = Selectors.modelCard.cardContainer(downloadFile);
  await Gestures.scrollToElement(containerSelector, 10);
  const container = browser.$(containerSelector);
  await container.waitForDisplayed({timeout: 30000});

  const loadBtn = container.$(Selectors.modelCard.loadButtonElement);
  const hasLoadButton = await loadBtn
    .waitForExist({timeout: 5000})
    .then(() => true)
    .catch(() => false);
  if (!hasLoadButton) {
    console.log(`[load] ${downloadFile} already active — skipping load`);
    await drawerPage.navigateToChat();
    await chatPage.waitForReady();
    return;
  }

  await loadBtn.click();
  await dismissPerformanceWarningIfPresent();
  await chatPage.waitForReady(TIMEOUTS.appReady);
  console.log(`[load] ${downloadFile} loaded`);
}

/** Release the active model, if any, from the Models screen. */
async function offloadActiveModel(): Promise<void> {
  const chatPage = new ChatPage();
  const drawerPage = new DrawerPage();
  const modelsPage = new ModelsPage();

  await chatPage.openDrawer();
  await drawerPage.waitForOpen();
  await drawerPage.navigateToModels();
  await modelsPage.waitForReady();

  const offloadBtn = browser.$(Selectors.modelCard.offloadButton);
  if (await offloadBtn.isExisting()) {
    await offloadBtn.click();
    await browser.pause(4000);
    console.log('[load] released the active model');
  }
}

/** Expand (or collapse) a model card's details section. */
async function toggleCardDetails(downloadFile: string): Promise<void> {
  const containerSelector = Selectors.modelCard.cardContainer(downloadFile);
  await Gestures.scrollToElement(containerSelector, 10);
  const container = browser.$(containerSelector);
  await container.waitForDisplayed({timeout: 20000});
  await container.$(nestedByTestId('expand-details-button')).click();
  await browser.pause(800);
}

describe('Speculative decoding — visual states', () => {
  before(async () => {
    const chatPage = new ChatPage();
    const settingsPage = new SettingsPage();
    await chatPage.waitForReady(TIMEOUTS.appReady);

    await settingsPage.navigateTo();
    await settingsPage.setContextSize(SPEC_CONTEXT_SIZE);
    await openAdvancedSection(false);

    // A previous session's settings can survive, so normalise before capturing.
    await setSpeculative(false);
    await Gestures.scrollToElement(SPEC_SWITCH, 6);
    await saveShot('mtp-01-speculative-toggle-off');

    await setSpeculative(true);
    await selectDraftModel(DRAFT_MODEL_NONE_TEXT);
    await Gestures.scrollToElement(SPEC_SWITCH, 6);
    await saveShot('mtp-02-speculative-enabled-no-model');
  });

  afterEach(async function (this: Mocha.Context) {
    if (this.currentTest?.state === 'failed') {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const name = this.currentTest.title.replace(/\s+/g, '-');
      await saveShot(`failure-${name}-${ts}`);
    }
  });

  it('shows the MTP badge in the HF search details view', async function (this: Mocha.Context) {
    // Two probe waits plus two model downloads exceed the default per-test cap.
    this.timeout(1200000);
    const drawerPage = new DrawerPage();
    const modelsPage = new ModelsPage();
    await new ChatPage().openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();

    // Downloads both fixtures for the later states, capturing the pre-download
    // details view of each on the way. The badge wait is best-effort so a slow
    // or failed probe still leaves the downloads (and the later states) intact —
    // the outcome is asserted at the end of this test.
    let mtpBadgeSeen = false;
    await downloadModelViaHFSearch(MTP, async () => {
      // The badge is driven by a range-fetch of the remote GGUF header, which
      // pulls several MB through the bridge before it can answer.
      mtpBadgeSeen = await browser
        .$(MTP_BADGE)
        .waitForExist({timeout: BADGE_PROBE_TIMEOUT})
        .then(() => true)
        .catch(() => false);
      console.log(`[hf details] MTP badge rendered: ${mtpBadgeSeen}`);
      await saveShot('mtp-06-hf-details-badge');
    });

    let nonMtpBadgeSeen = false;
    await downloadModelViaHFSearch(NON_MTP, async () => {
      // Give the probe a fair chance to resolve before reading absence.
      await browser.pause(30000);
      nonMtpBadgeSeen = await browser.$(MTP_BADGE).isExisting();
      console.log(`[hf details] non-MTP badge rendered: ${nonMtpBadgeSeen}`);
      await saveShot('mtp-07-hf-details-no-badge');
    });

    expect(nonMtpBadgeSeen).toBe(false);
    expect(mtpBadgeSeen).toBe(true);
  });

  it('surfaces the MTP capability on a downloaded model card', async () => {
    await toggleCardDetails(MTP.downloadFile);
    await Gestures.scrollToElement(byPartialText(MTP_CAPABILITY_TEXT), 6);
    await expect(browser.$(byPartialText(MTP_CAPABILITY_TEXT))).toBeExisting();
    await saveShot('mtp-04-model-card-capability');
    await toggleCardDetails(MTP.downloadFile);

    await toggleCardDetails(NON_MTP.downloadFile);
    await saveShot('mtp-05-model-card-non-mtp');
    await expect(
      browser.$(byPartialText(MTP_CAPABILITY_TEXT)),
    ).not.toBeExisting();
    await toggleCardDetails(NON_MTP.downloadFile);
  });

  it('shows the draft-pick ignored note when the pick carries no draft layers', async () => {
    // Nothing is loaded yet, so a non-MTP pick is simply unusable as a draft —
    // the "carries no draft layers" variant of the note.
    await openAdvancedSection();
    const label = await selectDraftModel(NON_MTP.nameFragment);
    expect(label).toContain(NON_MTP.nameFragment);

    await scrollSettingsTo(SPEC_IGNORED_NOTE);
    await expect(browser.$(SPEC_IGNORED_NOTE)).toBeExisting();
    console.log(`[ignored note] ${await readLabel(SPEC_IGNORED_NOTE)}`);
    await saveShot('mtp-03-ignored-note-draft-not-capable');
  });

  it('shows the no-effect note and disabled draft cache rows for a non-capable target', async () => {
    await loadDownloadedModel(NON_MTP.downloadFile);
    await openAdvancedSection();

    await scrollSettingsTo(SPEC_NO_EFFECT_NOTE);
    await expect(browser.$(SPEC_NO_EFFECT_NOTE)).toBeExisting();
    console.log(`[no-effect note] ${await readLabel(SPEC_NO_EFFECT_NOTE)}`);
    await saveShot('mtp-08-no-effect-note');

    await scrollSettingsTo(DRAFT_KEY_CACHE);
    expect(await browser.$(DRAFT_KEY_CACHE).isEnabled()).toBe(false);
    expect(await browser.$(DRAFT_VALUE_CACHE).isEnabled()).toBe(false);
    await saveShot('mtp-09-draft-cache-rows-disabled');
  });

  it('enables the draft cache rows once the pick is a usable draft', async () => {
    // With no model loaded the pick alone decides the mode, so an MTP-capable
    // pick resolves to `paired` and the draft cache rows become live.
    await offloadActiveModel();
    await openAdvancedSection();
    const label = await selectDraftModel(MTP.nameFragment);
    expect(label).toContain(MTP.nameFragment);

    await scrollSettingsTo(DRAFT_KEY_CACHE);
    expect(await browser.$(DRAFT_KEY_CACHE).isEnabled()).toBe(true);
    expect(await browser.$(DRAFT_VALUE_CACHE).isEnabled()).toBe(true);
    console.log(`[draft key cache] ${await readLabel(DRAFT_KEY_CACHE)}`);
    console.log(`[draft value cache] ${await readLabel(DRAFT_VALUE_CACHE)}`);
    await saveShot('mtp-10-draft-cache-rows-enabled-paired');

    await browser.$(DRAFT_KEY_CACHE).click();
    await browser.pause(1000);
    await saveShot('mtp-11-draft-cache-menu-open');
    await dismissMenu();
  });

  it('enables the draft cache rows once an MTP target resolves to embedded', async function (this: Mocha.Context) {
    await selectDraftModel(NON_MTP.nameFragment);
    try {
      await loadDownloadedModel(MTP.downloadFile);
    } catch (e) {
      // The MTP fixture ships in a vision repo, and the iOS simulator's Metal
      // driver aborts the process while allocating the projection model's
      // buffers, so the target never becomes active there.
      console.log(`[load] MTP target did not load: ${(e as Error).message}`);
      this.skip();
    }
    await openAdvancedSection();

    // The MTP target is active, so the non-MTP draft pick is ignored — the
    // "not compatible" variant of the note — and the resolution is `embedded`.
    await scrollSettingsTo(SPEC_IGNORED_NOTE);
    await expect(browser.$(SPEC_IGNORED_NOTE)).toBeExisting();
    await expect(browser.$(SPEC_NO_EFFECT_NOTE)).not.toBeExisting();
    console.log(`[ignored note] ${await readLabel(SPEC_IGNORED_NOTE)}`);
    await saveShot('mtp-12-ignored-note-draft-incompatible');

    await scrollSettingsTo(DRAFT_KEY_CACHE);
    expect(await browser.$(DRAFT_KEY_CACHE).isEnabled()).toBe(true);
    expect(await browser.$(DRAFT_VALUE_CACHE).isEnabled()).toBe(true);
    console.log(`[draft key cache] ${await readLabel(DRAFT_KEY_CACHE)}`);
    console.log(`[draft value cache] ${await readLabel(DRAFT_VALUE_CACHE)}`);
    await saveShot('mtp-13-draft-cache-rows-enabled-embedded');
  });
});
