/**
 * Benchmark Matrix E2E Spec
 *
 * Drives the in-app Benchmark screen across {models} x {quants} x {backends}
 * and writes a canonical JSON report to
 *   e2e/debug-output/benchmarks/benchmark-<device_slug>-<commit>.json
 *
 * Report is written incrementally after every run so a mid-matrix crash
 * preserves completed rows.
 *
 * Usage:
 *   yarn e2e --platform android --spec benchmark-matrix --skip-build
 *   BENCH_MODELS=qwen3-1.7b yarn e2e --platform android --spec benchmark-matrix --skip-build
 *   BENCH_QUANTS=q4_0,q6_k BENCH_BACKENDS=cpu yarn e2e ... --spec benchmark-matrix
 *   MODELS_PRESEEDED=1 yarn e2e ... --spec benchmark-matrix
 *
 * v1 scope: Android only. iOS / Hexagon excluded (follow-ups).
 *
 * Matrix size: 2 models x 8 quants x 2 backends = 32 runs at full scale;
 * env-var filters reduce to a single row for smoke testing.
 */

import * as fs from 'fs';
import * as path from 'path';
import {execSync} from 'child_process';
import {ChatPage} from '../pages/ChatPage';
import {BenchmarkPage} from '../pages/BenchmarkPage';
import {SettingsPage} from '../pages/SettingsPage';
import {
  getBenchmarkMatrix,
  ModelTestConfig,
  ModelQuantVariant,
  TIMEOUTS,
  BenchmarkMatrixBackend,
} from '../fixtures/models';
import {
  downloadAndLoadModelVariant,
  dismissPerformanceWarningIfPresent,
} from '../helpers/model-actions';
import {
  readLatestBenchmark,
  readInitSettings,
  listPreseededModels,
} from '../helpers/benchmark';
import {
  startCapture,
  deriveLogSignals,
  deriveEffectiveBackend,
  LogSignals,
  EffectiveBackend,
} from '../helpers/logcat';
import {OUTPUT_DIR} from '../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

// Per-run timeouts. The spec always trades correctness over speed here.
const BENCH_WAIT_MS = 5 * 60 * 1000; // upper bound per cell (quant + bench)
const BENCH_POLL_MS = 2_000;

interface BenchmarkRun {
  model_id: string;
  quant: string;
  requested_backend: BenchmarkMatrixBackend;
  effective_backend: EffectiveBackend;
  pp_avg: number | null;
  tg_avg: number | null;
  wall_ms: number;
  peak_memory_mb: number | null;
  log_signals: LogSignals;
  init_settings: Record<string, unknown>;
  status: 'ok' | 'skipped' | 'failed';
  reason?: string;
  error?: string;
  timestamp: string;
}

interface BenchmarkReport {
  version: '1.0';
  device: string;
  soc: string | null;
  commit: string;
  llama_rn_version: string;
  platform: 'android';
  os_version: string;
  timestamp: string;
  preseeded: boolean;
  runs: BenchmarkRun[];
}

function getDeviceInfo(): {
  device: string;
  os_version: string;
  soc: string | null;
} {
  const caps = (driver.capabilities || {}) as Record<string, any>;
  return {
    device:
      caps.deviceModel ||
      caps.deviceName ||
      process.env.E2E_DEVICE_NAME ||
      'unknown',
    os_version:
      caps.platformVersion || process.env.E2E_PLATFORM_VERSION || 'unknown',
    // The SoC/chipset isn't exposed via Appium caps; populate from env if the
    // caller knows it (typed directly from device inventory), else null.
    soc: process.env.E2E_DEVICE_SOC || null,
  };
}

function getCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
  } catch {
    return 'unknown';
  }
}

function getLlamaRnVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return (
      pkg.dependencies?.['llama.rn'] ||
      pkg.devDependencies?.['llama.rn'] ||
      'unknown'
    );
  } catch {
    return 'unknown';
  }
}

function slugifyDevice(device: string): string {
  return device
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'unknown-device';
}

function writeReportIncremental(
  reportPath: string,
  report: BenchmarkReport,
): void {
  const dir = path.dirname(reportPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

function buildAdbPushHint(
  missing: string[],
  matrix: {models: ModelTestConfig[]},
): string {
  // Best-effort: show the first missing file's push command as a template.
  // Author/repo inference relies on the fixture's search-query convention.
  const lines: string[] = [];
  lines.push('Missing preseeded GGUFs (MODELS_PRESEEDED=1):');
  for (const f of missing) {
    // Find the owning model entry (if any) to tell the user which subdir
    // the file belongs in on-device.
    const owningModel = matrix.models.find(m =>
      (m.quants ?? []).some(q => q.downloadFile === f),
    );
    const author =
      owningModel?.searchQuery.trim().split(/\s+/)[0] || 'bartowski';
    const repo = owningModel?.selectorText || '<repo>';
    lines.push(`  - ${f}`);
    lines.push(
      `      adb push ${f} /data/local/tmp/ && \\\n` +
        `      adb shell run-as com.pocketpalai mkdir -p files/models/hf/${author}/${repo}-GGUF && \\\n` +
        `      adb shell run-as com.pocketpalai sh -c 'cat /data/local/tmp/${f} > files/models/hf/${author}/${repo}-GGUF/${f}'`,
    );
  }
  lines.push('');
  lines.push('Preseed requires a DEBUG APK (release APK is non-debuggable).');
  lines.push('  cd android && ./gradlew assembleDebug');
  lines.push('  adb install android/app/build/outputs/apk/debug/app-debug.apk');
  return lines.join('\n');
}

describe('Benchmark Matrix', () => {
  const matrix = getBenchmarkMatrix();
  const preseeded = process.env.MODELS_PRESEEDED === '1';

  const deviceInfo = getDeviceInfo();
  const commit = getCommitHash();
  const llamaRnVersion = getLlamaRnVersion();
  const deviceSlug = slugifyDevice(deviceInfo.device);
  const reportPath = path.join(
    OUTPUT_DIR,
    'benchmarks',
    `benchmark-${deviceSlug}-${commit}.json`,
  );

  const report: BenchmarkReport = {
    version: '1.0',
    device: deviceInfo.device,
    soc: deviceInfo.soc,
    commit,
    llama_rn_version: llamaRnVersion,
    platform: 'android',
    os_version: deviceInfo.os_version,
    timestamp: new Date().toISOString(),
    preseeded,
    runs: [],
  };

  let chatPage: ChatPage;
  let benchmarkPage: BenchmarkPage;
  let settingsPage: SettingsPage;

  before(async () => {
    chatPage = new ChatPage();
    benchmarkPage = new BenchmarkPage();
    settingsPage = new SettingsPage();

    if (!(driver as any).isAndroid) {
      throw new Error(
        'benchmark-matrix spec is Android-only in v1 (iOS is a follow-up).',
      );
    }

    await chatPage.waitForReady(TIMEOUTS.appReady);

    if (matrix.models.length === 0) {
      throw new Error(
        'BENCH_MODELS filter excluded every model. Available: ' +
          '(see fixtures/models.ts BENCHMARK_MATRIX_MODELS)',
      );
    }
    if (matrix.quants.length === 0) {
      throw new Error('BENCH_QUANTS filter excluded every quant.');
    }
    if (matrix.backends.length === 0) {
      throw new Error('BENCH_BACKENDS filter excluded every backend.');
    }

    if (preseeded) {
      const present = new Set(await listPreseededModels());
      const missing: string[] = [];
      for (const m of matrix.models) {
        for (const quantKey of matrix.quants) {
          const variant = m.quants?.find(q => q.quant === quantKey);
          if (variant && !present.has(variant.downloadFile)) {
            missing.push(variant.downloadFile);
          }
        }
      }
      if (missing.length > 0) {
        throw new Error(
          'Preseed pre-flight failed.\n' + buildAdbPushHint(missing, matrix),
        );
      }
    }

    // Write the shell report up front so even a crash in the first cell
    // leaves a valid (empty-runs) JSON file.
    writeReportIncremental(reportPath, report);

    console.log('\n=== Benchmark Matrix ===');
    console.log(`  Device:     ${deviceInfo.device}`);
    console.log(`  OS:         ${deviceInfo.os_version}`);
    console.log(`  Commit:     ${commit}`);
    console.log(`  llama.rn:   ${llamaRnVersion}`);
    console.log(`  Preseeded:  ${preseeded ? 'yes' : 'no'}`);
    console.log(
      `  Matrix:     ${matrix.models.length} x ${matrix.quants.length} x ${matrix.backends.length} = ${matrix.models.length * matrix.quants.length * matrix.backends.length} runs`,
    );
    console.log(`  Report:     ${reportPath}`);
    console.log('========================\n');
  });

  it('runs the model x quant x backend matrix', async function (this: Mocha.Context) {
    this.timeout(0); // no Mocha-level cap; per-cell timeout is enforced below.

    let index = 0;
    const total =
      matrix.models.length * matrix.quants.length * matrix.backends.length;

    for (const model of matrix.models) {
      for (const quantKey of matrix.quants) {
        const variant = model.quants?.find(q => q.quant === quantKey);
        if (!variant) {
          const run: BenchmarkRun = {
            model_id: model.id,
            quant: quantKey,
            requested_backend: 'cpu',
            effective_backend: 'unknown',
            pp_avg: null,
            tg_avg: null,
            wall_ms: 0,
            peak_memory_mb: null,
            log_signals: emptyLogSignals(),
            init_settings: {},
            status: 'skipped',
            reason: 'quant_variant_not_defined_for_model',
            timestamp: new Date().toISOString(),
          };
          report.runs.push(run);
          writeReportIncremental(reportPath, report);
          index += matrix.backends.length;
          continue;
        }

        for (const backend of matrix.backends) {
          index++;
          const tag = `[${index}/${total}] ${model.id}/${quantKey}/${backend}`;
          console.log(`\n${tag} — starting`);

          const row = await runCell(
            model,
            variant,
            backend,
            quantKey,
            settingsPage,
            benchmarkPage,
            tag,
          );
          report.runs.push(row);
          writeReportIncremental(reportPath, report);

          console.log(
            `${tag} — status=${row.status} effective=${row.effective_backend} ` +
              `pp=${row.pp_avg ?? 'n/a'} tg=${row.tg_avg ?? 'n/a'} wall=${row.wall_ms}ms`,
          );
        }
      }
    }

    // Final flush.
    writeReportIncremental(reportPath, report);

    // Print a 1-line summary
    const okCount = report.runs.filter(r => r.status === 'ok').length;
    const failCount = report.runs.filter(r => r.status === 'failed').length;
    const skipCount = report.runs.filter(r => r.status === 'skipped').length;
    console.log(
      `\n=== Matrix complete: ${okCount} ok / ${failCount} failed / ${skipCount} skipped of ${report.runs.length} total ===\n`,
    );
  });
});

function emptyLogSignals(): LogSignals {
  return {
    opencl_init: false,
    opencl_device_name: null,
    adreno_gen: null,
    large_buffer_enabled: false,
    large_buffer_unsupported: false,
    offloaded_layers: null,
    total_layers: null,
    raw_matches: [],
  };
}

async function runCell(
  model: ModelTestConfig,
  variant: ModelQuantVariant,
  backend: BenchmarkMatrixBackend,
  quantKey: string,
  settingsPage: SettingsPage,
  benchmarkPage: BenchmarkPage,
  tag: string,
): Promise<BenchmarkRun> {
  const udid = process.env.E2E_DEVICE_UDID;
  const tStart = Date.now();
  const rowBase: Pick<
    BenchmarkRun,
    'model_id' | 'quant' | 'requested_backend' | 'timestamp'
  > = {
    model_id: model.id,
    quant: quantKey,
    requested_backend: backend,
    timestamp: new Date().toISOString(),
  };

  let initSettings: Record<string, unknown> = {};
  let logSignals: LogSignals = emptyLogSignals();
  let effectiveBackend: EffectiveBackend = 'unknown';

  try {
    // 1. Set tier via SegmentedButton. Single tap, no slider driving.
    await settingsPage.navigateTo();
    await settingsPage.setDeviceTier(backend);

    // 2. Assert the resulting init params match the requested tier before we
    // waste a bench run. Catches a regression in handleDeviceSelect.
    initSettings = await readInitSettings();
    const devices = (initSettings.devices as unknown as string[] | undefined) ?? [];
    if (backend === 'cpu') {
      if (!(devices.length === 1 && devices[0] === 'CPU')) {
        throw new Error(
          `${tag}: expected devices=['CPU'] after CPU tier tap, got ${JSON.stringify(devices)}`,
        );
      }
    } else {
      // GPU tier: expect a single non-'CPU' entry (the Adreno name).
      if (!(devices.length >= 1 && devices[0] !== 'CPU')) {
        throw new Error(
          `${tag}: expected non-CPU devices after GPU tier tap, got ${JSON.stringify(devices)}`,
        );
      }
    }

    // 3. Return to Chat so downloadAndLoadModelVariant starts from the
    // expected entry point (same as downloadAndLoadModel).
    const chatPage = new ChatPage();
    const drawerPage = new (await import('../pages/DrawerPage')).DrawerPage();
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToChat();
    await chatPage.waitForReady();

    // 4. Load the model variant (download if missing, else load).
    await downloadAndLoadModelVariant(model, variant);

    // 5. Start logcat capture just before the benchmark.
    const capture = startCapture(udid);

    try {
      // 6. Navigate to Benchmark, start the test.
      await benchmarkPage.navigate();
      await benchmarkPage.startTest();
      await dismissPerformanceWarningIfPresent();

      // 7. Poll for a fresh latestResult. "Fresh" = timestamp strictly newer
      // than any result we've already seen (if any).
      const priorTimestamp = (await readLatestBenchmark())?.timestamp ?? null;

      const deadline = Date.now() + BENCH_WAIT_MS;
      let result = await readLatestBenchmark();
      while (
        (result === null || result.timestamp === priorTimestamp) &&
        Date.now() < deadline
      ) {
        await browser.pause(BENCH_POLL_MS);
        result = await readLatestBenchmark();
      }

      const wall = Date.now() - tStart;
      logSignals = deriveLogSignals(capture.stop());
      effectiveBackend = deriveEffectiveBackend(logSignals);

      if (!result || result.timestamp === priorTimestamp) {
        return {
          ...rowBase,
          effective_backend: effectiveBackend,
          pp_avg: null,
          tg_avg: null,
          wall_ms: wall,
          peak_memory_mb: null,
          log_signals: logSignals,
          init_settings: initSettings,
          status: 'failed',
          reason: 'no_fresh_result_within_timeout',
        };
      }

      const peakBytes = result.peakMemoryUsage?.used;
      return {
        ...rowBase,
        effective_backend: effectiveBackend,
        pp_avg: result.ppAvg ?? null,
        tg_avg: result.tgAvg ?? null,
        wall_ms: result.wallTimeMs ?? wall,
        peak_memory_mb:
          typeof peakBytes === 'number'
            ? Math.round((peakBytes / (1024 * 1024)) * 100) / 100
            : null,
        log_signals: logSignals,
        init_settings: initSettings,
        status: 'ok',
      };
    } finally {
      // Ensure logcat process dies even if a throw above escapes this block.
      try {
        capture.stop();
      } catch {
        // Already stopped.
      }
    }
  } catch (e) {
    return {
      ...rowBase,
      effective_backend: effectiveBackend,
      pp_avg: null,
      tg_avg: null,
      wall_ms: Date.now() - tStart,
      peak_memory_mb: null,
      log_signals: logSignals,
      init_settings: initSettings,
      status: 'failed',
      error: (e as Error).message.slice(0, 500),
    };
  }
}
