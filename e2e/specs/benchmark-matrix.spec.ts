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
import {byTestId} from '../helpers/selectors';
import {OUTPUT_DIR} from '../wdio.shared.conf';
import {
  deepLinkLaunch,
  getCommitHash,
  getLlamaRnVersion,
  pullLatestReport,
  pushConfig,
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
    if (!terminal) {
      throw new Error(`No terminal state within ${MAX_WAIT_MS / 60_000} min`);
    }

    const localFile = pullLatestReport(outDir, udid);
    const report = JSON.parse(fs.readFileSync(localFile, 'utf8'));

    // The screen writes the per-cell payload (incl. log_signals and
    // effective_backend, derived in-process via addNativeLogListener); the
    // spec fills the top-level device/soc/commit/llama_rn/os fields the
    // screen has no clean way to know.
    const caps = (driver.capabilities || {}) as Record<string, any>;
    report.device = caps.deviceModel || process.env.E2E_DEVICE_NAME || 'unknown';
    report.soc = process.env.E2E_DEVICE_SOC || null;
    report.os_version =
      caps.platformVersion || process.env.E2E_PLATFORM_VERSION || 'unknown';
    report.commit = getCommitHash();
    report.llama_rn_version = getLlamaRnVersion();
    fs.writeFileSync(localFile, JSON.stringify(report, null, 2));

    if (terminal !== 'complete') throw new Error(`Matrix ended: ${terminal}`);
    if (!report.runs.length) throw new Error('Matrix produced zero rows');
    // Per-row pass gate (round-1 B2). The screen catches per-cell failures,
    // appends a status:'failed' row, then sets terminal='complete', so a
    // matrix where every cell threw still reports `complete` with a full
    // run list. This guard fails the spec when any cell did not complete
    // cleanly, surfacing the failed-cell key + truncated error.
    const failed = report.runs.filter((r: any) => r.status !== 'ok');
    if (failed.length > 0) {
      const summary = failed
        .map(
          (r: any) =>
            `${r.model_id}::${r.quant}::${r.requested_backend}: ` +
            String(r.error ?? r.reason ?? 'unknown').slice(0, 120),
        )
        .join('; ');
      throw new Error(
        `Matrix completed but ${failed.length}/${report.runs.length} cells failed: ${summary}`,
      );
    }
    console.log(`Matrix complete: ${report.runs.length} rows in ${localFile}`);
  });
});
