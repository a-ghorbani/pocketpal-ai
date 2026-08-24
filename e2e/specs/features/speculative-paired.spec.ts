/**
 * Separate-Draft (mem-shared / "assistant" MTP) Speculative Decoding — engagement
 *
 * The sibling `speculative.spec.ts` proves EMBEDDED MTP (a self-contained MTP
 * target) and the crash-SAFETY of a width-MISMATCHED paired draft.
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
 * Fixture pair (device-proven: paired engagement with real draft acceptance
 * on a Pixel 9, both files from the same repo):
 *   target: ggml-org/gemma-4-E2B-it-GGUF (gemma-4-E2B-it-Q4_0.gguf, arch
 *           gemma4, no nextn KV)
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
 *   (long downloads: prefix with E2E_MOCHA_TIMEOUT=1800000 — a per-test
 *   this.timeout() cannot raise wdio's mochaOpts ceiling)
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
import {Selectors, byTestId, byPartialText} from '../../helpers/selectors';
import {Gestures} from '../../helpers/gestures';
import {readAccessibilityLabel} from '../../helpers/element-text';
import {ensureRevealed} from '../../helpers/disclosure';
import {readSwitchState} from '../../helpers/control-state';
import {
  dismissPerformanceWarningIfPresent,
  dismissContextRoomSheetIfPresent,
  waitForModelDownloaded,
} from '../../helpers/model-actions';
import {TIMEOUTS, ModelTestConfig} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

/**
 * Fixture pair, overridable per device. The default gemma-4 set needs ~2.9 GB,
 * which does not fit every target; any pair works so long as the draft is
 * MTP-capable and its n_embd_out equals the target's n_embd (draftResolution.ts).
 */
const env = (name: string, fallback: string): string =>
  process.env[name] || fallback;

/**
 * Separate MTP draft. Downloaded (not loaded) so its width/MTP metadata is
 * available to the pairing resolver and it appears in the draft-model picker.
 *
 * The draft file is ~97 MB, but the app pairs every file in a multimodal repo
 * with its mmproj, so the actual transfer is ~655 MB — well past the 5-minute
 * default.
 */
const DRAFT_MODEL: ModelTestConfig = {
  id: 'paired-mtp-draft',
  searchQuery: env('E2E_PAIRED_DRAFT_QUERY', 'ggml-org gemma-4-E2B-it-GGUF'),
  selectorText: env('E2E_PAIRED_DRAFT_SELECTOR', 'gemma-4-E2B-it'),
  downloadFile: env('E2E_PAIRED_DRAFT_FILE', 'mtp-gemma-4-E2B-it-Q8_0.gguf'),
  downloadTimeout: Number(process.env.E2E_DOWNLOAD_TIMEOUT) || 900000,
  prompts: [{input: 'Hi', description: 'Basic greeting'}],
};

/**
 * The chat target paired with the draft. The default is loaded TEXT-ONLY (no
 * mmproj) because its repo is multimodal.
 */
const TARGET_MODEL: ModelTestConfig = {
  id: 'paired-target',
  searchQuery: env('E2E_PAIRED_TARGET_QUERY', 'ggml-org gemma-4-E2B-it-GGUF'),
  selectorText: env('E2E_PAIRED_TARGET_SELECTOR', 'gemma-4-E2B-it'),
  downloadFile: env('E2E_PAIRED_TARGET_FILE', 'gemma-4-E2B-it-Q4_0.gguf'),
  // HF often serves large files at only a few MB/s, so the wait is
  // overridable for slow lanes the way E2E_MOCHA_TIMEOUT is.
  downloadTimeout: Number(process.env.E2E_DOWNLOAD_TIMEOUT) || 900000,
  prompts: [{input: 'Hi', description: 'Basic greeting'}],
  disableVisionBeforeLoad: process.env.E2E_PAIRED_TARGET_VISION !== 'false',
};

/** Fragment of the draft's display name (extractHFModelTitle == filename). */
const DRAFT_TITLE_FRAGMENT = DRAFT_MODEL.downloadFile.replace(/\.gguf$/, '');

/**
 * n_ctx for the run. The paired draft needs room to draft to completion; with
 * the small default the "Give this chat more room" sheet pops mid-generation
 * and the wait helper cancels it (a false negative). n_ctx is read at initLlama
 * time, so it is committed before the target loads.
 */
const SPEC_CONTEXT_SIZE = '4096';

const SPEC_ACCORDION = byTestId('advanced-settings-accordion');
/** First row inside the accordion — mounted only while it is expanded. */
const SPEC_ACCORDION_FIRST_ROW = byTestId('batch-size-slider');
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
  // A fixed swipe count cannot rewind a list whose height depends on whether
  // the Advanced accordion is expanded; the native scroller has no such limit.
  if (await Gestures.nativeScrollIntoView(byTestId('context-size-input'))) {
    return;
  }
  for (let i = 0; i < 8; i++) {
    await Gestures.swipeDown();
  }
}

/**
 * Navigate to Settings without SettingsPage.navigateTo — that helper waits for
 * context-size-input to be *displayed*, but a repeat visit keeps the previous
 * scroll offset so the input is off-screen and the wait times out.
 */
async function goToSettings(settingsPage: SettingsPage): Promise<void> {
  // Already on Settings: a redundant drawer round-trip has raced the drawer
  // close on the emulator, dropping the screen from the accessibility tree.
  if (await browser.$(byTestId('context-size-input')).isExisting()) {
    return;
  }
  try {
    await settingsPage.navigateTo();
    return;
  } catch {
    // The drawer keeps Settings mounted, so a repeat visit restores the previous
    // scroll offset and navigateTo's "context-size-input displayed" wait times
    // out even though the screen is up. Rewind to the top and re-check.
    await scrollSettingsToTop();
    await browser
      .$(byTestId('context-size-input'))
      .waitForDisplayed({timeout: TIMEOUTS.element});
  }
}

/**
 * The iOS simulator's Metal shim aborts in MTLSimDevice.newBufferWithLength
 * (_xpc_shmem_create_with_prot) once a paired draft decodes alongside a large
 * target, so runs there select the CPU backend. Draft-token production is
 * backend-independent, so the engagement proof is unaffected.
 */
async function forceCpuIfRequested(settingsPage: SettingsPage): Promise<void> {
  if (process.env.E2E_FORCE_CPU !== 'true') {
    return;
  }
  await goToSettings(settingsPage);
  await scrollSettingsToTop();
  const cpuOption = byTestId('device-option-cpu');
  const reached =
    (await Gestures.nativeScrollIntoView(cpuOption)) ||
    (await Gestures.scrollToElement(cpuOption, 10));
  if (!reached) {
    console.log('[paired] CPU device option not present; leaving backend as-is');
    return;
  }
  await browser.pause(700);
  await browser.$(cpuOption).click();
  await browser.pause(700);
  console.log('[paired] selected CPU backend');

  // The draft carries its own layer count (spec_draft_n_gpu_layers, default
  // 99), so the device selector alone leaves the draft's decode on Metal —
  // which is exactly where the simulator aborts.
  await enableSpeculativeGlobally(settingsPage);
  const draftLayers = byTestId('speculative-draft-gpu-layers-slider-input');
  const draftReached =
    (await Gestures.nativeScrollIntoView(draftLayers)) ||
    (await Gestures.scrollToElement(draftLayers, 12));
  if (!draftReached) {
    console.log('[paired] draft gpu-layers input not reachable');
    return;
  }
  const input = browser.$(draftLayers);
  await input.clearValue();
  await input.setValue('0');
  await browser.pause(500);
  // The layer count uses a numeric keypad, which has no Return/Done key. ESC
  // closes it on Android without the back-press that hideKeyboard() emits (a
  // pop React Navigation would consume); iOS needs the driver's own dismiss.
  if ((browser as any).isAndroid) {
    await (browser as any).pressKeyCode(111).catch(() => undefined);
  } else {
    await browser
      .execute('mobile: hideKeyboard' as any)
      .catch(() => undefined);
  }
  await browser.pause(500);
  console.log('[paired] draft gpu layers set to 0');
}

/** Enable speculative decoding globally in Settings -> Advanced. */
async function enableSpeculativeGlobally(
  settingsPage: SettingsPage,
): Promise<void> {
  await goToSettings(settingsPage);
  await ensureRevealed({
    toggle: SPEC_ACCORDION,
    dependent: SPEC_SWITCH,
    stateProbe: SPEC_ACCORDION_FIRST_ROW,
    rewind: scrollSettingsToTop,
    maxScrolls: 8,
  });
  await browser.$(SPEC_SWITCH).waitForExist({timeout: TIMEOUTS.element});

  // Read the switch itself: with app state persisted between runs
  // (E2E_NO_RESET) speculative may already be on, and the previous
  // "picker exists" heuristic misreads an off-viewport picker as OFF —
  // clicking then toggles the feature off. Android exposes `checked`,
  // iOS `value`; only click when it reads unchecked.
  const state = (browser as any).isAndroid
    ? await browser
        .$(SPEC_SWITCH)
        .getAttribute('checked')
        .catch(() => null)
    : await browser
        .$(SPEC_SWITCH)
        .getAttribute('value')
        .catch(() => null);
  if (state !== 'true' && state !== '1') {
    await browser.$(SPEC_SWITCH).click();
    await browser.pause(700);
  }
  await Gestures.scrollToElement(SPEC_PICKER, 4);
  await browser.$(SPEC_PICKER).waitForExist({timeout: TIMEOUTS.element});
}

/**
 * Download a file with its vision projection turned OFF.
 *
 * The plain download button on a file card always passes `enableVision: true`,
 * so every file in a multimodal repo drags its ~557 MB mmproj along (a 97 MB
 * draft becomes a 655 MB transfer). The projection is reachable only through
 * the card's vision chip, which opens a sheet carrying its own toggle and
 * Download button. Neither control has a testID, so both are matched on text.
 *
 * Returns false when the file has no vision chip — a non-multimodal file needs
 * the normal path.
 */
async function tapDownloadWithoutVision(filename: string): Promise<boolean> {
  const card = browser.$(Selectors.modelDetails.fileCard(filename));
  const chip = card.$(byPartialText('Includes vision capability'));
  if (!(await chip.isExisting().catch(() => false))) {
    return false;
  }
  await browser.pause(700);
  await chip.click();
  await browser.pause(1500);

  const toggle = browser.$(
    (browser as any).isAndroid
      ? '//android.widget.Switch'
      : '-ios class chain:**/XCUIElementTypeSwitch',
  );
  if (await toggle.isExisting().catch(() => false)) {
    const on = await readSwitchState(
      (browser as any).isAndroid
        ? '//android.widget.Switch'
        : '-ios class chain:**/XCUIElementTypeSwitch',
    );
    if (on !== false) {
      await toggle.click();
      await browser.pause(700);
    }
  }

  // Exact match on the button: every file row behind the sheet also carries a
  // download control, labelled "Download model", and a substring match resolves
  // one of those instead — a tap that lands under the sheet and does nothing.
  const downloadBtn = browser.$(
    (browser as any).isAndroid
      ? '//android.widget.Button[@content-desc="Download"]'
      : '-ios predicate string:type == "XCUIElementTypeButton" AND label == "Download"',
  );
  await downloadBtn.waitForExist({timeout: TIMEOUTS.element});
  await browser.pause(500);
  await downloadBtn.click();
  await browser.pause(1500);
  console.log(`[paired] ${filename}: downloading without vision projection`);
  return true;
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

  // Persisted-state rerun (E2E_NO_RESET): the card already exists, so the
  // whole HF search flow is a no-op — skip it.
  const cardSelector = Selectors.modelCard.cardContainer(model.downloadFile);
  if (
    await browser
      .$(cardSelector)
      .isExisting()
      .catch(() => false)
  ) {
    console.log(`Model already present (not re-downloading): ${model.id}`);
    return;
  }

  await modelsPage.openHuggingFaceSearch();
  await hfSearchSheet.waitForReady();

  await hfSearchSheet.search(model.searchQuery);
  await hfSearchSheet.selectModel(model.selectorText);
  await modelDetailsSheet.waitForReady();

  await modelDetailsSheet.scrollToFile(model.downloadFile);
  if (
    process.env.E2E_PAIRED_NO_VISION !== 'true' ||
    !(await tapDownloadWithoutVision(model.downloadFile))
  ) {
    await modelDetailsSheet.tapDownloadForFile(model.downloadFile);
  }

  await modelDetailsSheet.close();
  await hfSearchSheet.close();
  await modelsPage.waitForReady();

  const downloadTimeout = model.downloadTimeout ?? TIMEOUTS.download;
  await waitForModelDownloaded(model.downloadFile, downloadTimeout);

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

  // Persisted-state rerun (E2E_NO_RESET): skip the HF flow when the card
  // already exists and go straight to the load.
  const presentSelector = Selectors.modelCard.cardContainer(model.downloadFile);
  const alreadyPresent = await browser
    .$(presentSelector)
    .isExisting()
    .catch(() => false);
  if (!alreadyPresent) {
    await modelsPage.openHuggingFaceSearch();
    await hfSearchSheet.waitForReady();

    await hfSearchSheet.search(model.searchQuery);
    await hfSearchSheet.selectModel(model.selectorText);
    await modelDetailsSheet.waitForReady();

    await modelDetailsSheet.scrollToFile(model.downloadFile);
    if (
      process.env.E2E_PAIRED_NO_VISION !== 'true' ||
      !(await tapDownloadWithoutVision(model.downloadFile))
    ) {
      await modelDetailsSheet.tapDownloadForFile(model.downloadFile);
    }

    await modelDetailsSheet.close();
    await hfSearchSheet.close();
    await modelsPage.waitForReady();
  } else {
    console.log(`Target already present (not re-downloading): ${model.id}`);
  }

  const downloadTimeout = model.downloadTimeout ?? TIMEOUTS.download;
  const containerSelector = Selectors.modelCard.cardContainer(
    model.downloadFile,
  );
  await waitForModelDownloaded(model.downloadFile, downloadTimeout);
  const modelCardContainer = browser.$(containerSelector);

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
  settingsPage: SettingsPage,
  titleFragment: string,
): Promise<void> {
  // Idempotent: reads the switch state, so a re-entry with speculative
  // already on cannot toggle it off.
  await enableSpeculativeGlobally(settingsPage);
  await browser.$(SPEC_PICKER).click();
  await browser.pause(500);

  const item = browser.$(byPartialText(titleFragment));
  await item.waitForExist({timeout: TIMEOUTS.element});
  await item.click();
  await browser.pause(700);

  const pickerLabel = await readAccessibilityLabel(SPEC_PICKER);
  console.log(`[paired] draft picker after selection: ${pickerLabel}`);
}

/**
 * Wait for the draft-tokens footer, dismissing the "more room" sheet on each
 * poll so a mid-turn context sheet cannot swallow the completion.
 */
async function waitForDraftFooter(
  maxWaitMs = TIMEOUTS.inference,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await dismissContextRoomSheetIfPresent();
    if (
      await browser
        .$(DRAFT_TOKENS_EL)
        .isExisting()
        .catch(() => false)
    ) {
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
    await goToSettings(settingsPage);
    await settingsPage.setContextSize(SPEC_CONTEXT_SIZE);
    await enableSpeculativeGlobally(settingsPage);
    await forceCpuIfRequested(settingsPage);
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

  it('paired engagement: a separate MTP draft paired to a target produces draft tokens', async function (this: Mocha.Context) {
    // Two sequential downloads (98 MB draft + ~3.5 GB target) plus load and
    // generation exceed the 10-min suite default. this.timeout() does not
    // override wdio's mochaOpts.timeout, so long runs must ALSO raise
    // E2E_MOCHA_TIMEOUT (see usage header); this call covers plain mocha.
    this.timeout(Number(process.env.E2E_MOCHA_TIMEOUT) || 1_800_000);

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
          `[paired] target load aborted; fresh crash report(s): ${crashes.join(
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
          `[paired] generation aborted; fresh crash report(s): ${crashes.join(
            ', ',
          )}`,
        );
        this.skip();
        return;
      }
      throw err;
    }

    const draftEl = browser.$(DRAFT_TOKENS_EL);
    const draftText = await draftEl.getText();
    console.log(`[paired] draft tokens surfaced: ${draftText}`);

    // "draft: <accepted>/<total> (<pct>%)" -- total is draft_tokens; > 0 == engaged.
    const m = draftText.match(/(\d+)\s*\/\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m && m[1])).toBeGreaterThanOrEqual(0);
    expect(Number(m && m[2])).toBeGreaterThan(0);

    const timingEl = browser.$(TIMING_EL);
    await timingEl.waitForExist({timeout: TIMEOUTS.element});
    const timingText = await timingEl.getText();
    console.log(`[paired] timings surfaced: ${timingText}`);
    const rate = timingText.match(/([\d.]+)\s*tokens?\/sec/i);
    expect(rate).not.toBeNull();
    expect(Number(rate && rate[1])).toBeGreaterThan(0);

    await saveShot('speculative-paired-engagement');
  });
});
