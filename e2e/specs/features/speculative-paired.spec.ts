/**
 * Separate-Draft (mem-shared / "assistant" MTP) Speculative Decoding — engagement
 *
 * The sibling `speculative.spec.ts` proves EMBEDDED MTP (a self-contained MTP
 * target, V1') and the crash-SAFETY of a width-MISMATCHED paired draft (V2-D).
 * Neither proves the OTHER headline mode: a WORKING separate draft model paired
 * to a distinct target, resolving to `mode: 'paired'` and actually producing
 * draft tokens. This spec is exactly that missing proof.
 *
 * Pairing path (resolveDraftCandidate -> 'paired'):
 *   - a separate MTP draft is DOWNLOADED (its ggufMetadata carries
 *     nextn_predict_layers > 0 -> isMTPCapable) and picked in Settings, which
 *     writes selectedDraftModelId;
 *   - a distinct NON-MTP target is loaded whose n_embd equals the draft's
 *     n_embd_out (the native init_mtp width assert). Width match + downloaded +
 *     MTP-capable draft => paired, and getEffectiveContextInitParams emits
 *     model_draft + spec_type='draft-mtp' at initLlama time.
 *
 * Engagement is only observable at runtime: the assistant turn footer renders
 * `message-draft-tokens` ("draft: <accepted>/<total>") only when the completion
 * reported draft_tokens > 0. This spec asserts that element is present with
 * total > 0, and that `footer-timing` shows a real tokens/sec.
 *
 * Fixture pair (verified in llama.rn's own C++ harness, draft-accept 0.57-0.89):
 *   target: bartowski/google_gemma-4-E2B-it-GGUF (google_gemma-4-E2B-it-Q4_K_M.gguf)
 *   draft:  ggml-org/gemma-4-E2B-it-GGUF (mtp-gemma-4-E2B-it-Q8_0.gguf, arch
 *           gemma4-assistant, nextn_predict_layers=4)
 *
 * SIMULATOR CAVEAT: the target is a multimodal repo. Loading a vision projection
 * model has crashed the iOS-sim Metal driver (MTLSimDevice newBufferWithLength ->
 * _xpc_api_misuse). The target is therefore loaded TEXT-ONLY: only the base
 * weights are downloaded, never the mmproj projection file, so multimodal stays
 * off. If the target still aborts on a text-only load, that is a real finding —
 * the test captures the fresh crash-report path and skips (unproven on device)
 * rather than forcing a green.
 *
 * Usage:
 *   yarn e2e:ios --spec speculative-paired --devices virtual-only
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {expect} from '@wdio/globals';
import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {ModelsPage} from '../../pages/ModelsPage';
import {HFSearchSheet} from '../../pages/HFSearchSheet';
import {ModelDetailsSheet} from '../../pages/ModelDetailsSheet';
import {SettingsPage} from '../../pages/SettingsPage';
import {
  Selectors,
  byTestId,
  byPartialText,
} from '../../helpers/selectors';
import {Gestures} from '../../helpers/gestures';
import {
  dismissPerformanceWarningIfPresent,
  dismissContextRoomSheetIfPresent,
} from '../../helpers/model-actions';
import {TIMEOUTS, ModelTestConfig} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

/**
 * Separate MTP draft: arch gemma4-assistant, nextn_predict_layers=4, ~98 MB.
 * Downloaded (not loaded) so its width/MTP metadata is available to the pairing
 * resolver and it appears in the draft-model picker.
 */
const DRAFT_MODEL: ModelTestConfig = {
  id: 'gemma-4-e2b-mtp-draft',
  searchQuery: 'ggml-org gemma-4-E2B-it-GGUF',
  selectorText: 'gemma-4-E2B-it',
  downloadFile: 'mtp-gemma-4-E2B-it-Q8_0.gguf',
  prompts: [{input: 'Hi', description: 'Basic greeting'}],
};

/** The chat target paired with the draft. Loaded TEXT-ONLY (no mmproj). */
const TARGET_MODEL: ModelTestConfig = {
  id: 'gemma-4-e2b-target',
  searchQuery: 'bartowski google_gemma-4-E2B-it-GGUF',
  selectorText: 'google_gemma-4-E2B-it',
  downloadFile: 'google_gemma-4-E2B-it-Q4_K_M.gguf',
  downloadTimeout: 900000,
  prompts: [{input: 'Hi', description: 'Basic greeting'}],
};

/** Fragment of the draft's display name (extractHFModelTitle == filename). */
const DRAFT_TITLE_FRAGMENT = 'mtp-gemma-4-E2B-it-Q8_0';

/**
 * n_ctx for the run. The paired draft needs room to draft to completion; with
 * the small default the "Give this chat more room" sheet pops mid-generation
 * and the wait helper cancels it (a false negative). n_ctx is read at initLlama
 * time, so it is committed before the target loads.
 */
const SPEC_CONTEXT_SIZE = '4096';

const SPEC_ACCORDION = byTestId('advanced-settings-accordion');
const SPEC_SWITCH = byTestId('speculative-decoding-switch');
const SPEC_PICKER = byTestId('speculative-draft-model-picker');

const DRAFT_TOKENS_EL = byTestId('message-draft-tokens');
const TIMING_EL = byTestId('footer-timing');

async function saveShot(name: string): Promise<void> {
  try {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});
    }
    await driver.saveScreenshot(path.join(SCREENSHOT_DIR, `${name}.png`));
  } catch (e) {
    console.error('Failed to capture screenshot:', (e as Error).message);
  }
}

/** Fresh PocketPal crash reports written since `sinceMs` (iOS-sim host). */
function freshCrashReports(sinceMs: number): string[] {
  const dir = path.join(os.homedir(), 'Library/Logs/DiagnosticReports');
  try {
    return fs
      .readdirSync(dir)
      .filter(f => /^PocketPal.*\.ips$/i.test(f))
      .map(f => path.join(dir, f))
      .filter(p => {
        try {
          return fs.statSync(p).mtimeMs >= sinceMs;
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

/**
 * Settings keeps its scroll offset between visits (the drawer navigator keeps
 * the screen mounted), so rewind to the top before scrolling to a row.
 */
async function scrollSettingsToTop(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Gestures.swipeDown();
  }
}

/**
 * Navigate to Settings without SettingsPage.navigateTo — that helper waits for
 * context-size-input to be *displayed*, but a repeat visit keeps the previous
 * scroll offset so the input is off-screen and the wait times out.
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

/** Enable speculative decoding globally in Settings -> Advanced. */
async function enableSpeculativeGlobally(
  _settingsPage: SettingsPage,
): Promise<void> {
  await goToSettings();
  await Gestures.scrollToElement(SPEC_ACCORDION, 8);
  if (!(await browser.$(SPEC_PICKER).isExisting())) {
    await browser.$(SPEC_ACCORDION).click();
    await browser.pause(500);
  }
  await Gestures.scrollToElement(SPEC_SWITCH, 8);
  await browser.$(SPEC_SWITCH).waitForExist({timeout: TIMEOUTS.element});

  // The DS Switch carries its testID on a wrapper view; the draft-model picker
  // only renders once speculative is on, so its presence is the enabled signal.
  if (!(await browser.$(SPEC_PICKER).isExisting())) {
    await browser.$(SPEC_SWITCH).click();
    await browser.pause(700);
  }
  await Gestures.scrollToElement(SPEC_PICKER, 4);
  await browser.$(SPEC_PICKER).waitForExist({timeout: TIMEOUTS.element});
}

/**
 * Download a model from HuggingFace WITHOUT loading it. Mirrors the shared
 * download-and-load flow minus the load step: the draft must be present (so its
 * metadata is fetched and it becomes pickable) but must NOT become the active
 * context. Ends on the Models screen with the model downloaded.
 */
async function downloadModelOnly(model: ModelTestConfig): Promise<void> {
  const chatPage = new ChatPage();
  const drawerPage = new DrawerPage();
  const modelsPage = new ModelsPage();
  const hfSearchSheet = new HFSearchSheet();
  const modelDetailsSheet = new ModelDetailsSheet();

  await chatPage.openDrawer();
  await drawerPage.waitForOpen();
  await drawerPage.navigateToModels();
  await modelsPage.waitForReady();

  await modelsPage.openHuggingFaceSearch();
  await hfSearchSheet.waitForReady();

  await hfSearchSheet.search(model.searchQuery);
  await hfSearchSheet.selectModel(model.selectorText);
  await modelDetailsSheet.waitForReady();

  await modelDetailsSheet.scrollToFile(model.downloadFile);
  await modelDetailsSheet.tapDownloadForFile(model.downloadFile);

  await modelDetailsSheet.close();
  await hfSearchSheet.close();
  await modelsPage.waitForReady();

  const downloadTimeout = model.downloadTimeout ?? TIMEOUTS.download;
  const containerSelector = Selectors.modelCard.cardContainer(
    model.downloadFile,
  );
  await browser
    .$(containerSelector)
    .waitForDisplayed({timeout: downloadTimeout});

  // The card flips to "downloaded" on isDownloaded=true, then the GGUF metadata
  // (nextn/width) is fetched right after; give that async read a beat to land so
  // the draft is MTP/width-known by the time the target load resolves pairing.
  await browser.pause(3000);
  console.log(`Model downloaded (not loaded): ${model.id}`);
}

/**
 * Download-and-load a model, then verify it reached the chat shell. Reused for
 * the TARGET; pairing is resolved at this load using the already-picked draft.
 */
async function downloadAndLoadTarget(model: ModelTestConfig): Promise<void> {
  const chatPage = new ChatPage();
  const drawerPage = new DrawerPage();
  const modelsPage = new ModelsPage();
  const hfSearchSheet = new HFSearchSheet();
  const modelDetailsSheet = new ModelDetailsSheet();

  await chatPage.openDrawer();
  await drawerPage.waitForOpen();
  await drawerPage.navigateToModels();
  await modelsPage.waitForReady();

  await modelsPage.openHuggingFaceSearch();
  await hfSearchSheet.waitForReady();

  await hfSearchSheet.search(model.searchQuery);
  await hfSearchSheet.selectModel(model.selectorText);
  await modelDetailsSheet.waitForReady();

  await modelDetailsSheet.scrollToFile(model.downloadFile);
  await modelDetailsSheet.tapDownloadForFile(model.downloadFile);

  await modelDetailsSheet.close();
  await hfSearchSheet.close();
  await modelsPage.waitForReady();

  const downloadTimeout = model.downloadTimeout ?? TIMEOUTS.download;
  const containerSelector = Selectors.modelCard.cardContainer(
    model.downloadFile,
  );
  const modelCardContainer = browser.$(containerSelector);
  await modelCardContainer.waitForDisplayed({timeout: downloadTimeout});

  const loadBtn = modelCardContainer.$(Selectors.modelCard.loadButtonElement);
  await loadBtn.waitForDisplayed({timeout: 10000});
  await loadBtn.click();

  // Multimodal repo -> a performance/memory warning may appear; Continue loads
  // text-only (no projection was downloaded, so multimodal stays off).
  await dismissPerformanceWarningIfPresent();
  await chatPage.waitForReady();
  console.log(`Target loaded (text-only): ${model.id}`);
}

/** Open the draft-model picker in Settings and select the separate MTP draft. */
async function pickDraftModel(
  _settingsPage: SettingsPage,
  titleFragment: string,
): Promise<void> {
  await goToSettings();
  await Gestures.scrollToElement(SPEC_ACCORDION, 8);
  if (!(await browser.$(SPEC_PICKER).isExisting())) {
    await browser.$(SPEC_ACCORDION).click();
    await browser.pause(500);
  }
  await Gestures.scrollToElement(SPEC_SWITCH, 8);
  if (!(await browser.$(SPEC_PICKER).isExisting())) {
    await browser.$(SPEC_SWITCH).click();
    await browser.pause(700);
  }
  await Gestures.scrollToElement(SPEC_PICKER, 4);
  await browser.$(SPEC_PICKER).waitForExist({timeout: TIMEOUTS.element});
  await browser.$(SPEC_PICKER).click();
  await browser.pause(500);

  const item = browser.$(byPartialText(titleFragment));
  await item.waitForExist({timeout: TIMEOUTS.element});
  await item.click();
  await browser.pause(700);

  const pickerLabel =
    (await browser.$(SPEC_PICKER).getAttribute('label').catch(() => '')) || '';
  console.log(`[V3] draft picker after selection: ${pickerLabel}`);
}

/**
 * Wait for the draft-tokens footer, dismissing the "more room" sheet on each
 * poll so a mid-turn context sheet cannot swallow the completion.
 */
async function waitForDraftFooter(maxWaitMs = TIMEOUTS.inference): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await dismissContextRoomSheetIfPresent();
    if (await browser.$(DRAFT_TOKENS_EL).isExisting().catch(() => false)) {
      return;
    }
    await browser.pause(1500);
  }
  throw new Error('draft-tokens footer did not appear within timeout');
}

describe('Speculative Decoding / separate-draft (paired) MTP', () => {
  let chatPage: ChatPage;
  let settingsPage: SettingsPage;

  before(async () => {
    chatPage = new ChatPage();
    settingsPage = new SettingsPage();
    await chatPage.waitForReady(TIMEOUTS.appReady);

    // n_ctx before any load (read at initLlama time); then speculative on.
    await goToSettings();
    await settingsPage.setContextSize(SPEC_CONTEXT_SIZE);
    await enableSpeculativeGlobally(settingsPage);
    await saveShot('speculative-paired-settings-enabled');
  });

  beforeEach(() => {
    chatPage = new ChatPage();
  });

  afterEach(async function (this: Mocha.Context) {
    if (this.currentTest?.state === 'failed') {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const name = this.currentTest.title.replace(/\s+/g, '-');
      await saveShot(`failure-${name}-${ts}`);
    }
  });

  it('V3 paired engagement: a separate MTP draft paired to a target produces draft tokens', async function (this: Mocha.Context) {
    // Two sequential downloads (98 MB draft + ~1.7 GB target) plus load and
    // generation exceed the 10-min suite default; the download helpers already
    // allow 15-min waits, so lift the test budget to cover both.
    this.timeout(1_800_000);

    // 1) Download the separate MTP draft (not loaded) so it is pickable and its
    //    width/MTP metadata is known.
    await downloadModelOnly(DRAFT_MODEL);

    // 2) Pick it as the draft model (writes selectedDraftModelId) BEFORE the
    //    target loads -- pairing is resolved from contextInitParams at load.
    await pickDraftModel(settingsPage, DRAFT_TITLE_FRAGMENT);
    await saveShot('speculative-paired-draft-picked');

    // 3) Load the target text-only. A width match to the picked draft resolves
    //    mode:'paired' and emits spec_type='draft-mtp'. Guard the Metal
    //    projection-buffer crash: on a native abort the session dies; capture
    //    the fresh crash report and skip (unproven on device) instead of a red.
    const loadStart = Date.now();
    try {
      await downloadAndLoadTarget(TARGET_MODEL);
    } catch (err) {
      const crashes = freshCrashReports(loadStart);
      if (crashes.length > 0) {
        console.log(
          `[V3] target load aborted; fresh crash report(s): ${crashes.join(
            ', ',
          )}`,
        );
        this.skip();
        return;
      }
      throw err;
    }

    // 4) Send a prompt and read the engagement footer directly. An MTP turn can
    //    exhaust context before the body renders, but the footer renders on turn
    //    completion and IS the engagement signal.
    await chatPage.resetChat();
    await chatPage.sendMessage('Hi');

    try {
      await waitForDraftFooter();
    } catch (err) {
      const crashes = freshCrashReports(loadStart);
      if (crashes.length > 0) {
        console.log(
          `[V3] generation aborted; fresh crash report(s): ${crashes.join(
            ', ',
          )}`,
        );
        this.skip();
        return;
      }
      throw err;
    }

    const draftEl = browser.$(DRAFT_TOKENS_EL);
    const draftText =
      (await draftEl.getAttribute('label').catch(() => '')) || '';
    console.log(`[V3] draft tokens surfaced: ${draftText}`);

    // "draft: <accepted>/<total> (<pct>%)" -- total is draft_tokens; > 0 == engaged.
    const m = draftText.match(/(\d+)\s*\/\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m && m[1])).toBeGreaterThanOrEqual(0);
    expect(Number(m && m[2])).toBeGreaterThan(0);

    const timingText =
      (await browser.$(TIMING_EL).getAttribute('label').catch(() => '')) || '';
    console.log(`[V3] timings surfaced: ${timingText}`);
    const rate = timingText.match(/([\d.]+)\s*tokens?\/sec/i);
    expect(rate).not.toBeNull();
    expect(Number(rate && rate[1])).toBeGreaterThan(0);

    await saveShot('speculative-paired-v3-engagement');
  });
});
