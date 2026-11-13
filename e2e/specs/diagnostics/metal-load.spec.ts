/**
 * Metal load probe: download a 3B Q4 model, load it, send one prompt, and
 * record whether the app replied or exited. Built for one cloud iOS device per
 * run (AWS Device Farm, testspec-ios-metal-load.yml), and runs the same way
 * against a local device through wdio.ios.local.conf.ts.
 *
 * It drives only controls that exist unchanged in the 1.20.1 to 1.23.0 UIs,
 * so one test package can probe builds of each of those releases.
 *
 * Env:
 *   METAL_LOAD_DEVICE  auto (default; Metal on iOS) or cpu (the Settings
 *                      device option, i.e. Metal off)
 *   METAL_LOAD_FILE    GGUF file name in the HF repo (default Q4_K_M)
 *
 * Output (OUTPUT_DIR, which is the Device Farm customer-artifacts dir there):
 *   metal-load-report.json   outcome, stage timings, device and app facts
 *   metal-load-syslog.txt    device syslog captured by Appium for the session
 *   metal-load-syslog-ggml.txt  the llama/ggml/Metal/jetsam lines of it
 *   metal-load-crash-<n>.ips crash and JetsamEvent reports written in-session
 *   metal-load-memory.json   memory snapshots, when the container is readable
 */

import * as fs from 'fs';
import * as path from 'path';
import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {ModelsPage} from '../../pages/ModelsPage';
import {HFSearchSheet} from '../../pages/HFSearchSheet';
import {ModelDetailsSheet} from '../../pages/ModelDetailsSheet';
import {SettingsPage} from '../../pages/SettingsPage';
import {Selectors, byTestId} from '../../helpers/selectors';
import {Gestures} from '../../helpers/gestures';
import {
  waitForModelDownloaded,
  dismissPerformanceWarningIfPresent,
  waitForInferenceComplete,
} from '../../helpers/model-actions';
import {triggerSnapshot} from '../../helpers/memory';
import {OUTPUT_DIR, SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const browser: WebdriverIO.Browser;
declare const driver: WebdriverIO.Browser;

const BUNDLE_ID = 'ai.pocketpal';
const REPO_QUERY = 'bartowski Llama-3.2-3B-Instruct';
const REPO_LABEL = 'Llama-3.2-3B-Instruct';
const FILE = process.env.METAL_LOAD_FILE || 'Llama-3.2-3B-Instruct-Q4_K_M.gguf';
const DEVICE_OPTION = (process.env.METAL_LOAD_DEVICE || 'auto').toLowerCase();
const PROMPT = 'Hi';

const DOWNLOAD_TIMEOUT_MS = 20 * 60 * 1000;
const LOAD_TIMEOUT_MS = 5 * 60 * 1000;
const REPLY_TIMEOUT_MS = 3 * 60 * 1000;
// ReportCrash writes the .ips (and JetsamEvent) a few seconds after the exit.
const CRASH_REPORT_SETTLE_MS = 45 * 1000;

const GGML_LINE =
  /ggml|llama|rnllama|metal|MTL|AGX|GPU|jetsam|memorystatus|ReportCrash|PocketPal|EXC_|SIGABRT|SIGKILL|abort/i;

type Outcome =
  | 'replied'
  | 'loaded_no_reply'
  | 'app_exited_during_load'
  | 'app_exited_during_reply'
  | 'load_error_shown'
  | 'setup_failed';

interface Report {
  file: string;
  deviceOption: string;
  outcome?: Outcome;
  stage: string;
  error?: string;
  marks: Record<string, unknown>;
  device?: unknown;
  app?: unknown;
  platformVersion?: unknown;
  crashReports: string[];
  memorySnapshots?: unknown;
}

const report: Report = {
  file: FILE,
  deviceOption: DEVICE_OPTION,
  stage: 'start',
  marks: {},
  crashReports: [],
};

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, {recursive: true});
}

function writeReport(): void {
  ensureDir(OUTPUT_DIR);
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'metal-load-report.json'),
    JSON.stringify(report, null, 2),
  );
}

function mark(key: string, value: unknown = Date.now()): void {
  report.marks[key] = value;
  console.log(`[metal-load] ${key}=${JSON.stringify(value)}`);
  writeReport();
}

function stage(name: string): void {
  report.stage = name;
  mark(`stage_${name}`);
}

async function shot(name: string): Promise<void> {
  try {
    ensureDir(SCREENSHOT_DIR);
    await driver.saveScreenshot(
      path.join(SCREENSHOT_DIR, `metal-load-${name}.png`),
    );
  } catch (e) {
    console.log(
      `[metal-load] screenshot ${name} failed: ${(e as Error).message}`,
    );
  }
}

/** XCUITest app state: 1 not running, 2/3 background, 4 foreground. */
async function appState(): Promise<number> {
  try {
    return (await driver.execute('mobile: queryAppState', {
      bundleId: BUNDLE_ID,
    })) as unknown as number;
  } catch {
    return 0;
  }
}

async function appIsGone(): Promise<boolean> {
  const state = await appState();
  return state === 1;
}

async function loadErrorText(): Promise<string | null> {
  const snackbar = browser.$(Selectors.common.errorSnackbar);
  if (await snackbar.isDisplayed().catch(() => false)) {
    return String(
      (await snackbar.getText().catch(() => '')) || 'error-snackbar',
    );
  }
  const title = browser.$(Selectors.alert.title);
  if (await title.isExisting().catch(() => false)) {
    const text = String((await title.getText().catch(() => '')) || '');
    if (/error|fail/i.test(text)) {
      const msg = await browser
        .$(Selectors.alert.message)
        .getText()
        .catch(() => '');
      return `${text}: ${msg}`;
    }
  }
  return null;
}

/** Same Models navigation as the lab A/B, which ran it on all four releases. */
async function goModels(): Promise<void> {
  const chat = new ChatPage();
  const drawer = new DrawerPage();
  const models = new ModelsPage();
  for (let i = 0; i < 3; i++) {
    if (await models.isDisplayed().catch(() => false)) {
      break;
    }
    const byLabel = browser.$(
      '-ios predicate string:label == "Models" AND visible == 1',
    );
    if (await byLabel.isExisting().catch(() => false)) {
      await byLabel.click().catch(() => undefined);
      await browser.pause(1200);
      continue;
    }
    try {
      await chat.openDrawer();
      await drawer.waitForOpen();
      await drawer.navigateToModels();
    } catch (e) {
      console.log(`[metal-load] drawer attempt ${i} failed: ${e}`);
      await browser.pause(1000);
    }
  }
  await models.waitForReady();
}

async function selectCpuDevice(): Promise<void> {
  const settings = new SettingsPage();
  await settings.navigateTo();
  const cpu = byTestId('device-option-cpu');
  const reached =
    (await Gestures.nativeScrollIntoView(cpu)) ||
    (await Gestures.scrollToElement(cpu, 10));
  if (!reached) {
    throw new Error('device-option-cpu not reachable in Settings');
  }
  await browser.pause(700);
  await browser.$(cpu).click();
  await browser.pause(1000);
  mark(
    'cpu_option_value',
    await browser
      .$(cpu)
      .getAttribute('value')
      .catch(() => null),
  );
  await shot('settings-cpu');
}

async function downloadModel(): Promise<void> {
  const models = new ModelsPage();
  const hf = new HFSearchSheet();
  const details = new ModelDetailsSheet();
  await goModels();
  await models.openHuggingFaceSearch();
  await hf.waitForReady();
  // The search field sometimes drops characters under XCUITest; retype.
  let typed = '';
  for (let i = 0; i < 4; i++) {
    await hf.search(REPO_QUERY);
    typed = String(
      (await browser
        .$(Selectors.hfSearch.searchInput)
        .getText()
        .catch(() => '')) || '',
    ).trim();
    if (typed.endsWith(REPO_QUERY)) {
      break;
    }
  }
  mark('search_typed', typed);
  await browser.pause(2500);
  await hf.selectModel(REPO_LABEL);
  await details.waitForReady();
  await details.scrollToFile(FILE);
  await details.tapDownloadForFile(FILE);
  mark('download_start');
  await details.close();
  await hf.close();
  await models.waitForReady();
  await waitForModelDownloaded(FILE, DOWNLOAD_TIMEOUT_MS);
  mark('download_done');
}

/**
 * Resolves 'loaded' when the chat input shows its ready placeholder (the
 * model is selected), 'exited' when the app process is gone, or 'error' when
 * the app shows a load error.
 */
async function waitForLoadOrExit(): Promise<'loaded' | 'exited' | 'error'> {
  const deadline = Date.now() + LOAD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await appIsGone()) {
      return 'exited';
    }
    const input = browser.$(Selectors.chat.input);
    if (await input.isExisting().catch(() => false)) {
      const label =
        String((await input.getAttribute('label').catch(() => '')) || '') +
        String((await input.getAttribute('value').catch(() => '')) || '');
      if (/type your message/i.test(label)) {
        return 'loaded';
      }
    }
    const err = await loadErrorText();
    if (err) {
      mark('load_error', err);
      return 'error';
    }
    await browser.pause(500);
  }
  throw new Error(`no load, exit or error within ${LOAD_TIMEOUT_MS}ms`);
}

async function sendPrompt(): Promise<void> {
  const chat = new ChatPage();
  await chat.sendMessage(PROMPT);
  // A send tap right after a load is sometimes swallowed; re-tap if the
  // prompt is still in the input.
  for (let i = 0; i < 3; i++) {
    await browser.pause(2000);
    const v = String(
      (await browser
        .$(Selectors.chat.input)
        .getText()
        .catch(() => '')) || '',
    ).trim();
    if (!new RegExp(`\\b${PROMPT}$`).test(v)) {
      break;
    }
    mark(`send_retap_${i}`);
    await browser
      .$(Selectors.chat.sendButton)
      .click()
      .catch(() => undefined);
  }
}

async function waitForReplyOrExit(): Promise<'replied' | 'exited'> {
  const run = waitForInferenceComplete(REPLY_TIMEOUT_MS).then(t => ({
    kind: 'replied' as const,
    timing: t,
  }));
  const exit = (async () => {
    const deadline = Date.now() + REPLY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await appIsGone()) {
        return {kind: 'exited' as const, timing: ''};
      }
      await browser.pause(2000);
    }
    return new Promise<never>(() => undefined);
  })();
  const result = await Promise.race([run, exit]);
  if (result.kind === 'replied') {
    mark('reply_timing', result.timing);
  }
  return result.kind;
}

async function snapshot(label: string): Promise<void> {
  try {
    await triggerSnapshot(label);
    mark(`snap_${label}`);
  } catch (e) {
    mark(`snap_${label}_failed`, (e as Error).message);
  }
}

async function collectLogs(): Promise<void> {
  ensureDir(OUTPUT_DIR);
  try {
    const entries = (await driver.getLogs('syslog')) as Array<{
      message: string;
    }>;
    const lines = entries.map(e => e.message);
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'metal-load-syslog.txt'),
      lines.join('\n'),
    );
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'metal-load-syslog-ggml.txt'),
      lines.filter(l => GGML_LINE.test(l)).join('\n'),
    );
    mark('syslog_lines', lines.length);
  } catch (e) {
    mark('syslog_failed', (e as Error).message);
  }
  try {
    const crashes = (await driver.getLogs('crashlog')) as Array<{
      message: string;
    }>;
    crashes.forEach((c, i) => {
      const name = `metal-load-crash-${i}.ips`;
      fs.writeFileSync(path.join(OUTPUT_DIR, name), c.message);
      report.crashReports.push(name);
    });
    mark('crash_reports', crashes.length);
  } catch (e) {
    mark('crashlog_failed', (e as Error).message);
  }
  try {
    // App container read; works only when the installed signature allows it.
    const b64 = (await driver.execute('mobile: pullFile', {
      remotePath: `@${BUNDLE_ID}/Documents/memory-snapshots.json`,
    })) as unknown as string;
    const json = Buffer.from(b64, 'base64').toString('utf8');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'metal-load-memory.json'), json);
    report.memorySnapshots = JSON.parse(json);
  } catch (e) {
    mark('memory_pull_failed', (e as Error).message);
  }
  writeReport();
}

describe('Metal load probe', function () {
  this.timeout(
    DOWNLOAD_TIMEOUT_MS + LOAD_TIMEOUT_MS + REPLY_TIMEOUT_MS + 5 * 60 * 1000,
  );

  before(async () => {
    report.platformVersion = (driver.capabilities as any).platformVersion;
    report.device = await driver
      .execute('mobile: deviceInfo')
      .catch(e => String(e));
    const apps = (await driver
      .execute('mobile: listApps', {applicationType: 'User'})
      .catch(() => ({}))) as Record<string, any>;
    const app = apps[BUNDLE_ID] || {};
    report.app = {
      version: app.CFBundleShortVersionString,
      build: app.CFBundleVersion,
    };
    writeReport();
  });

  after(async () => {
    if (report.outcome?.startsWith('app_exited')) {
      await browser.pause(CRASH_REPORT_SETTLE_MS);
    }
    await collectLogs();
  });

  it(`loads ${FILE} with device option "${DEVICE_OPTION}" and replies`, async () => {
    try {
      await probe();
    } catch (e) {
      report.error = (e as Error).message;
      if (await appIsGone()) {
        report.outcome =
          report.stage === 'reply'
            ? 'app_exited_during_reply'
            : 'app_exited_during_load';
      } else {
        report.outcome =
          report.stage === 'reply' ? 'loaded_no_reply' : 'setup_failed';
        await shot(`failed-${report.stage}`);
      }
    } finally {
      mark('outcome', report.outcome);
    }
    expect(report.outcome).toBe('replied');
  });
});

async function probe(): Promise<void> {
  stage('app_ready');
  await new ChatPage().waitForReady(60000);
  await snapshot('launch');

  if (DEVICE_OPTION === 'cpu') {
    stage('select_cpu');
    await selectCpuDevice();
  } else if (DEVICE_OPTION !== 'auto') {
    throw new Error(
      `METAL_LOAD_DEVICE must be auto or cpu, got ${DEVICE_OPTION}`,
    );
  }

  stage('download');
  await downloadModel();
  await snapshot('before_load');

  stage('load');
  const card = browser.$(Selectors.modelCard.cardContainer(FILE));
  await card.waitForDisplayed({timeout: 20000});
  const loadBtn = card.$(Selectors.modelCard.loadButtonElement);
  await loadBtn.waitForDisplayed({timeout: 15000});
  await loadBtn.click();
  mark('load_tap');
  await dismissPerformanceWarningIfPresent();
  const loaded = await waitForLoadOrExit();
  mark('load_result', loaded);
  if (loaded === 'exited') {
    report.outcome = 'app_exited_during_load';
    return;
  }
  if (loaded === 'error') {
    report.outcome = 'load_error_shown';
    await shot('load-error');
    return;
  }
  await snapshot('after_load');
  await shot('loaded');

  stage('reply');
  await sendPrompt();
  const replied = await waitForReplyOrExit();
  if (replied === 'exited') {
    report.outcome = 'app_exited_during_reply';
    return;
  }
  report.outcome = 'replied';
  await snapshot('after_reply');
  await shot('replied');
}
