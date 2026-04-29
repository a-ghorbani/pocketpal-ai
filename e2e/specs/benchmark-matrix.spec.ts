/**
 * Benchmark Matrix E2E Spec (v2 — BenchmarkRunnerScreen-driven).
 *
 * Drives the in-app BenchmarkRunnerScreen across {models} x {quants} x
 * {backends}. The screen owns the matrix loop, downloads, init/release,
 * peak-memory tracking, and JSON writing. This spec just pushes a config,
 * deep-links the screen, taps Run, polls status, and pulls the JSON.
 *
 *   yarn e2e --platform android --spec benchmark-matrix --skip-build
 *   BENCH_MODELS=qwen3-1.7b BENCH_QUANTS=q4_0 BENCH_BACKENDS=gpu yarn e2e ...
 *   BENCH_MAX_WAIT_MIN=120 yarn e2e ...        # default 60 min
 *
 * Android-only in v1.
 */

import * as fs from 'fs';
import * as path from 'path';

import {getBenchmarkMatrix} from '../fixtures/benchmark-models';
import {
  startCapture,
  deriveLogSignals,
  deriveEffectiveBackend,
} from '../helpers/logcat';
import {byTestId} from '../helpers/selectors';
import {OUTPUT_DIR} from '../wdio.shared.conf';
import {
  deepLinkLaunch,
  getCommitHash,
  getLlamaRnVersion,
  pullLatestReport,
  pushConfig,
  sliceLogcat,
} from '../helpers/bench-runner';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

const MAX_WAIT_MS =
  parseInt(process.env.BENCH_MAX_WAIT_MIN || '60', 10) * 60_000;
const POLL_MS = 5000;

describe('Benchmark Matrix', () => {
  const matrix = getBenchmarkMatrix();
  const udid = process.env.E2E_DEVICE_UDID;
  let outDir: string;

  before(async () => {
    if (!(driver as any).isAndroid) throw new Error('Android-only.');
    if (
      !matrix.models.length ||
      !matrix.quants.length ||
      !matrix.backends.length
    ) {
      throw new Error('BENCH_* filters excluded every cell.');
    }
    outDir = path.join(OUTPUT_DIR, 'benchmarks');
    fs.mkdirSync(outDir, {recursive: true});
    pushConfig(matrix, udid);
    await deepLinkLaunch();
  });

  it('runs the matrix and writes a JSON report', async function (this: Mocha.Context) {
    this.timeout(MAX_WAIT_MS + 60_000);

    const runBtn = await driver.$(byTestId('bench-run-button'));
    await runBtn.waitForDisplayed({timeout: 30_000});

    const capture = startCapture(udid);
    await runBtn.click();

    const status = await driver.$(byTestId('bench-runner-screen-status'));
    const deadline = Date.now() + MAX_WAIT_MS;
    let terminal: string | null = null;
    while (Date.now() < deadline) {
      await browser.pause(POLL_MS);
      const s =
        (await status.getAttribute('content-desc').catch(() => null)) ??
        (await status.getText().catch(() => null));
      if (s === 'complete' || (typeof s === 'string' && s.startsWith('error:'))) {
        terminal = s;
        break;
      }
    }
    const lines = capture.stop();
    if (!terminal) {
      throw new Error(`No terminal state within ${MAX_WAIT_MS / 60_000} min`);
    }

    const localFile = pullLatestReport(outDir, udid);
    const report = JSON.parse(fs.readFileSync(localFile, 'utf8'));

    // The screen writes only the version/platform/timestamp/preseeded/runs
    // fields; the spec fills the device/soc/commit/llama_rn/os fields.
    const caps = (driver.capabilities || {}) as Record<string, any>;
    report.device = caps.deviceModel || process.env.E2E_DEVICE_NAME || 'unknown';
    report.soc = process.env.E2E_DEVICE_SOC || null;
    report.os_version =
      caps.platformVersion || process.env.E2E_PLATFORM_VERSION || 'unknown';
    report.commit = getCommitHash();
    report.llama_rn_version = getLlamaRnVersion();

    for (const row of report.runs) {
      const slice = sliceLogcat(lines, row.timestamp, row.wall_ms ?? 0);
      row.log_signals = deriveLogSignals(slice);
      row.effective_backend = deriveEffectiveBackend(row.log_signals);
    }
    fs.writeFileSync(localFile, JSON.stringify(report, null, 2));

    if (terminal !== 'complete') throw new Error(`Matrix ended: ${terminal}`);
    if (!report.runs.length) throw new Error('Matrix produced zero rows');
    console.log(`Matrix complete: ${report.runs.length} rows in ${localFile}`);
  });
});
