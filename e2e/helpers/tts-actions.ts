/**
 * E2E TTS profiling helpers.
 *
 * Drives the hidden TTS automation adapter to download, synthesize and
 * release a neural engine so memory can be sampled around each step. Mirrors
 * the platform split in memory.ts:
 * - Android: TextInput setValue (onChangeText fires reliably)
 * - iOS: deep link pocketpal://tts?cmd=...
 *
 * Each command is async and may be long-running (Supertonic download is
 * ~380 MB), so completion is awaited by polling a status file the app writes:
 * - Android: read::status round-trip through a result element
 * - iOS simulator: direct filesystem read via simctl
 */

import {execSync} from 'child_process';
import {byTestId} from './selectors';

declare const driver: WebdriverIO.Browser;

const IOS_BUNDLE_ID = 'ai.pocketpal';
const STATUS_FILENAME = 'tts-command-status.json';

const POLL_INTERVAL_MS = 5000;

interface TtsStatus {
  cmd?: string;
  state?: 'running' | 'done' | 'error';
  detail?: string;
}

async function sendCommand(command: string): Promise<void> {
  const isAndroid = (driver as any).isAndroid;
  if (isAndroid) {
    const input = await driver.$(byTestId('tts-command-input'));
    await input.setValue(command);
  } else {
    const encoded = encodeURIComponent(command);
    await driver.execute('mobile: deepLink', {
      url: `pocketpal://tts?cmd=${encoded}`,
      bundleId: IOS_BUNDLE_ID,
    });
  }
}

async function readStatus(): Promise<TtsStatus> {
  const isAndroid = (driver as any).isAndroid;
  if (isAndroid) {
    const input = await driver.$(byTestId('tts-command-input'));
    await input.setValue('read::status');
    await driver.pause(500);
    const resultEl = await driver.$(byTestId('tts-command-result'));
    let data: string | null = await resultEl.getAttribute('content-desc');
    if (!data || !data.startsWith('{')) {
      data = await resultEl.getText();
    }
    if (!data || !data.startsWith('{')) {
      return {};
    }
    return JSON.parse(data) as TtsStatus;
  }
  // Prefer the explicit UDID — `booted` is ambiguous when several
  // simulators are running at once.
  const target = process.env.E2E_DEVICE_UDID || 'booted';
  const container = execSync(
    `xcrun simctl get_app_container ${target} ${IOS_BUNDLE_ID} data`,
    {encoding: 'utf8', timeout: 5000},
  ).trim();
  const filePath = `${container}/Documents/${STATUS_FILENAME}`;
  try {
    const data = execSync(`cat "${filePath}"`, {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    return data.startsWith('{') ? (JSON.parse(data) as TtsStatus) : {};
  } catch {
    return {};
  }
}

/**
 * Send a command and poll its status file until it leaves the `running`
 * state. Throws on `error` or timeout.
 */
async function runCommand(command: string, timeoutMs: number): Promise<void> {
  await sendCommand(command);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await driver.pause(POLL_INTERVAL_MS);
    const status = await readStatus();
    if (status.cmd === command && status.state === 'done') {
      return;
    }
    if (status.cmd === command && status.state === 'error') {
      throw new Error(`TTS command "${command}" failed: ${status.detail}`);
    }
  }
  throw new Error(`TTS command "${command}" timed out after ${timeoutMs}ms`);
}

/** Download `engine` and leave it ready. */
export async function downloadAndLoadTTSEngine(
  engine: string,
  timeoutMs: number,
): Promise<void> {
  await runCommand(`download::${engine}`, timeoutMs);
}

/** Run one synthesis on `engine`. */
export async function runTTSSynthesis(
  engine: string,
  timeoutMs: number,
): Promise<void> {
  await runCommand(`synthesize::${engine}`, timeoutMs);
}

/** Release the active engine's native resources. */
export async function releaseTTSEngine(timeoutMs: number): Promise<void> {
  await runCommand('release', timeoutMs);
}
