import React, {useCallback, useRef, useState} from 'react';
import {Button, ScrollView, StyleSheet, Text, View} from 'react-native';
import RNDeviceInfo from 'react-native-device-info';
import {addNativeLogListener, toggleNativeLog} from 'llama.rn';
import {observer} from 'mobx-react';

import {modelStore} from '../../store';
import {getDeviceOptions} from '../../utils/deviceSelection';
import type {Model} from '../../utils/types';
import {
  BENCH_LOG_RE,
  deriveEffectiveBackend,
  deriveLogSignals,
  emptyLogSignals,
  type LogSignals,
} from '../logSignals';

// Top-level require keeps RNFS access DCE-friendly (matches MemoryAdapter
// pattern from TASK-20260423-2331 Step 0). The whole module is gated
// behind __E2E__ at every reachable import site (App.tsx, deepLink.ts,
// useDeepLinking.ts), so this require is unreachable in prod.

const RNFS = require('@dr.pogodin/react-native-fs');

// Runtime-referenced marker for the CI bundle-grep — see .github/workflows/ci.yml.
// MUST be referenced INSIDE a runtime branch (not just JSDoc) so Hermes cannot
// DCE the literal as dead code. We log it from onRun below.
const BENCH_RUN_MATRIX = 'BENCH_RUN_MATRIX';

const CONFIG_PATH = `${RNFS.ExternalDirectoryPath}/bench-config.json`;
const reportPath = (timestamp: string) =>
  `${RNFS.ExternalDirectoryPath}/benchmark-report-${timestamp}.json`;

type Status = string; // 'idle' | 'downloading:<f>' | 'running:<i/n>:<...>' | 'complete' | 'error:<msg>'

interface BenchVariant {
  quant: string;
  filename: string;
  /** Optional GGUF size in bytes. Bypasses the pre-flight space check when
   * absent (set to 1). Provide it from bench-config to honour the real
   * disk-space gate; the implementer can fetch it from HF's API if needed. */
  size?: number;
}

interface BenchModelEntry {
  id: string;
  hfModelId: string;
  quants: BenchVariant[];
}

export interface BenchConfig {
  models: BenchModelEntry[];
  backends: Array<'cpu' | 'gpu'>;
  bench?: {pp: number; tg: number; pl: number; nr: number};
}

interface BenchmarkRunRow {
  model_id: string;
  quant: string;
  requested_backend: 'cpu' | 'gpu';
  effective_backend: 'cpu' | 'opencl' | 'cpu+opencl-partial' | 'unknown';
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
  platform: 'android';
  timestamp: string;
  preseeded: boolean;
  bench: {pp: number; tg: number; pl: number; nr: number};
  runs: BenchmarkRunRow[];
}

const DEFAULT_BENCH = {pp: 512, tg: 128, pl: 1, nr: 3};
const TRUNCATE_ERROR = 200; // status string error length
const TRUNCATE_ROW_ERROR = 500; // row.error length
const PEAK_POLL_MS = 1000;

async function loadConfig(): Promise<BenchConfig> {
  const exists = await RNFS.exists(CONFIG_PATH);
  if (!exists) {
    throw new Error('bench-config-missing');
  }
  const raw = await RNFS.readFile(CONFIG_PATH, 'utf8');
  return JSON.parse(raw) as BenchConfig;
}

async function trackPeakMemory(): Promise<{
  total: number;
  used: number;
  percentage: number;
} | null> {
  try {
    const total = await RNDeviceInfo.getTotalMemory();
    const used = await RNDeviceInfo.getUsedMemory();
    return {total, used, percentage: (used / total) * 100};
  } catch {
    return null;
  }
}

/**
 * Run the matrix. Pure-async, takes setStatus as a parameter so that unit
 * tests can drive the state machine without a real React tree.
 *
 * Side effects:
 *   - Updates the screen's status string at every transition.
 *   - Writes the report JSON file after every cell (append-as-you-go).
 *   - Calls modelStore.setDevices / initContext / context.bench / releaseContext.
 *
 * Per-cell error containment: a throw in cell N is captured into the row,
 * status is set to error:<msg>, but the loop continues to cell N+1.
 */
export async function runMatrix(
  config: BenchConfig,
  setStatus: (s: Status) => void,
  setLastCell: (c: {pp?: number; tg?: number; cells?: number}) => void,
): Promise<void> {
  const bench = config.bench ?? DEFAULT_BENCH;

  // Resolve the GPU device name ONCE at run start. Reuses the canonical
  // helper (src/utils/deviceSelection.ts) instead of duplicating the
  // getBackendDevicesInfo() filter logic. Cells with backend:'gpu' fail
  // fast (status:'failed') if no GPU option is returned (e.g.
  // supportsOpenCL=false device).
  let adrenoDevices: string[] | null = null;
  if (config.backends.includes('gpu')) {
    try {
      const opts = await getDeviceOptions();
      const gpu = opts.find(o => o.id === 'gpu');
      adrenoDevices = gpu?.devices ?? null;
    } catch {
      adrenoDevices = null;
    }
  }

  // Build a flat cell list.
  const cells: Array<{
    model: BenchModelEntry;
    variant: BenchVariant;
    backend: 'cpu' | 'gpu';
  }> = [];
  for (const m of config.models) {
    for (const v of m.quants) {
      for (const b of config.backends) {
        cells.push({model: m, variant: v, backend: b});
      }
    }
  }

  // Native log capture is global state in llama.rn — flip it on once for the
  // whole matrix and toggle off in the outer finally so an unexpected throw
  // anywhere in the loop body doesn't leave native logging on for the rest
  // of the app session. Per-cell scoping is done by attaching a fresh
  // listener around each init+bench window.
  await toggleNativeLog(true).catch(() => undefined);
  try {
    const startTimestamp = new Date().toISOString();
    const safeStamp = startTimestamp.replace(/[:.]/g, '-');
    const path = reportPath(safeStamp);
    const report: BenchmarkReport = {
      version: '1.0',
      platform: 'android',
      timestamp: startTimestamp,
      preseeded: true, // pessimistic — flips false on first downloading: transition
      bench,
      runs: [],
    };

    // Write the shell up front so even an early crash leaves a JSON file.
    await RNFS.writeFile(path, JSON.stringify(report, null, 2), 'utf8');

    for (let i = 0; i < cells.length; i++) {
      const {model, variant, backend} = cells[i];
      const tStart = Date.now();
      const tag = `${i + 1}/${cells.length}:${model.id}/${variant.quant}/${backend}`;
      setStatus(`running:${tag}`);

      const rowBase: Pick<
        BenchmarkRunRow,
        'model_id' | 'quant' | 'requested_backend' | 'timestamp'
      > = {
        model_id: model.id,
        quant: variant.quant,
        requested_backend: backend,
        timestamp: new Date().toISOString(),
      };

      // Per-cell log buffer + listener handle. Declared outside the try so the
      // catch path can still surface partial signals (and the finally can
      // detach the listener) when a cell throws mid-init.
      const logBuffer: string[] = [];
      let logSub: {remove: () => void} | null = null;
      // Tracks whether modelStore.initContext resolved for this cell. The
      // finally block uses this to call releaseContext exactly once per
      // initialized cell, regardless of whether bench() then threw.
      let contextInitialized = false;

      try {
        // 1. GPU pre-check: cell fails fast if backend=gpu but no GPU option.
        if (backend === 'gpu' && !adrenoDevices) {
          const row: BenchmarkRunRow = {
            ...rowBase,
            effective_backend: 'unknown',
            pp_avg: null,
            tg_avg: null,
            wall_ms: Date.now() - tStart,
            peak_memory_mb: null,
            log_signals: emptyLogSignals(),
            init_settings: {},
            status: 'failed',
            error: 'GPU device not available',
          };
          report.runs.push(row);
          await RNFS.writeFile(path, JSON.stringify(report, null, 2), 'utf8');
          continue;
        }

        // 2. Resolve / download the model file.
        let resolvedModel = modelStore.models.find(
          (mm: Model) => mm.filename === variant.filename && mm.isDownloaded,
        );
        if (!resolvedModel) {
          report.preseeded = false;
          setStatus(`downloading:${variant.filename}`);
          // Strategy: rely on the existing app download path. The screen
          // pushes a minimal HuggingFaceModel + ModelFile descriptor into
          // modelStore, kicks off the download via downloadHFModel, and
          // polls modelStore.models for isDownloaded=true.
          const hfModel = {
            _id: model.hfModelId,
            id: model.hfModelId,
            author: model.hfModelId.split('/')[0] ?? 'unknown',
            gated: false,
            inference: '',
            lastModified: '',
            likes: 0,
            trendingScore: 0,
            private: false,
            sha: '',
            downloads: 0,
            tags: [],
            library_name: '',
            createdAt: '',
            model_id: model.hfModelId,
            siblings: [{rfilename: variant.filename} as any],
          } as any;
          // url is REQUIRED — hfAsModel reads modelFile.url into model.downloadUrl,
          // and ModelStore.checkSpaceAndDownload early-returns when !downloadUrl,
          // silently never starting the download. Construct the canonical HF
          // resolve URL inline; if the bench-config ever needs a different host
          // (private repo, mirror, etc.) we'd take it from the variant instead.
          // size is REQUIRED — hasEnoughSpace returns false for size <= 0
          // (malformed model), and DownloadManager.startDownload then throws
          // "Not enough storage space". The variant.size from bench-config
          // wins; otherwise fall back to 1 to bypass the pre-check (the actual
          // download will fail late if the device is genuinely full).
          const modelFile = {
            rfilename: variant.filename,
            size: variant.size ?? 1,
            url: `https://huggingface.co/${model.hfModelId}/resolve/main/${variant.filename}`,
          } as any;
          // Clear stale download error so we only observe failures from THIS
          // cell's download. The matrix is serial so one error slot is enough.
          modelStore.clearDownloadError?.();
          await modelStore.downloadHFModel(hfModel, modelFile);
          // Status updates with download progress: poll modelStore.models for
          // the entry and surface percentage. The DownloadManager updates
          // model.progress as bytes arrive; we read it on each poll tick.
          // We also watch modelStore.downloadError so a failed download fails
          // the cell within ~500 ms instead of burning the full 30-min deadline.
          const progressFilename = variant.filename;
          const downloadDeadline = Date.now() + 30 * 60 * 1000;
          while (Date.now() < downloadDeadline) {
            const entry = modelStore.models.find(
              (m: Model) => m.filename === progressFilename,
            );
            if (entry?.isDownloaded) {
              resolvedModel = entry;
              break;
            }
            const dlErr = (modelStore as any).downloadError;
            if (dlErr) {
              const reason =
                dlErr?.message ??
                dlErr?.error?.message ??
                JSON.stringify(dlErr).slice(0, TRUNCATE_ERROR);
              throw new Error(`download-failed:${progressFilename}:${reason}`);
            }
            const pct = entry?.progress ?? 0;
            setStatus(`downloading:${progressFilename} ${Math.round(pct)}%`);
            await new Promise(r => setTimeout(r, 500));
          }
          if (!resolvedModel) {
            throw new Error(`download-timeout:${progressFilename}`);
          }
          setStatus(`running:${tag}`);
        }

        // 3. Programmatic tier switch.
        const cellDevices: string[] =
          backend === 'cpu' ? ['CPU'] : (adrenoDevices as string[]);
        modelStore.setDevices(cellDevices);

        // 3a. Attach native-log listener so the cell's load output (the same
        // lines that show up in `adb logcat`) lands in `logBuffer`. The
        // BENCH_LOG_RE pre-filter keeps the buffer bounded for long runs.
        logSub = addNativeLogListener((_level, text) => {
          if (BENCH_LOG_RE.test(text)) {
            logBuffer.push(text);
          }
        });

        // 4. Init context (mutex-serialized inside ModelStore).
        await modelStore.initContext(resolvedModel);
        contextInitialized = true;

        // 5. Snapshot init settings AFTER initContext (they may have been
        // touched by initContext's quant-aware tweaks).
        const initSettings = JSON.parse(
          JSON.stringify(modelStore.contextInitParams),
        );

        // 6. Peak memory tracking.
        let peakMemory: {
          total: number;
          used: number;
          percentage: number;
        } | null = null;
        const memInterval = setInterval(async () => {
          const cur = await trackPeakMemory();
          if (cur && (!peakMemory || cur.percentage > peakMemory.percentage)) {
            peakMemory = cur;
          }
        }, PEAK_POLL_MS);

        let speedPp: number | undefined;
        let speedTg: number | undefined;
        try {
          const ctx = modelStore.context;
          if (!ctx) {
            throw new Error('context-not-initialized');
          }
          const benchResult = await ctx.bench(
            bench.pp,
            bench.tg,
            bench.pl,
            bench.nr,
          );
          speedPp = benchResult.speedPp;
          speedTg = benchResult.speedTg;
        } finally {
          clearInterval(memInterval);
        }

        // Invariant: status:'ok' rows must always carry non-null pp_avg and
        // tg_avg. If ctx.bench() resolves with either metric undefined (e.g.
        // partial native failure), force the catch path so the row is recorded
        // as 'failed' with an explanatory error string. Without this, the
        // success-row builder below would write status:'ok' pp_avg:null which
        // makes regressions invisible to the compare script.
        if (speedPp == null || speedTg == null) {
          throw new Error(
            `bench returned null metric(s): speedPp=${speedPp}, speedTg=${speedTg}`,
          );
        }

        // Derive backend evidence from the cell's load output. The log
        // listener is detached in the finally block (sole detach site).
        const logSignals = deriveLogSignals(logBuffer);
        const effectiveBackend = deriveEffectiveBackend(logSignals);

        const wall = Date.now() - tStart;
        const peakBytes = peakMemory
          ? (peakMemory as {used: number}).used
          : null;
        const row: BenchmarkRunRow = {
          ...rowBase,
          effective_backend: effectiveBackend,
          pp_avg: speedPp,
          tg_avg: speedTg,
          wall_ms: wall,
          peak_memory_mb:
            typeof peakBytes === 'number'
              ? Math.round((peakBytes / (1024 * 1024)) * 100) / 100
              : null,
          log_signals: logSignals,
          init_settings: initSettings,
          status: 'ok',
        };
        report.runs.push(row);
        await RNFS.writeFile(path, JSON.stringify(report, null, 2), 'utf8');
        setLastCell({
          pp: speedPp,
          tg: speedTg,
          cells: report.runs.length,
        });
      } catch (e) {
        // Salvage whatever load lines we captured before the throw — useful
        // for debugging "why did this cell fail" without re-running. The log
        // listener is detached in the finally block (sole detach site).
        const partialSignals = deriveLogSignals(logBuffer);
        const msg = (e as Error).message ?? 'unknown';
        const short = msg.slice(0, TRUNCATE_ERROR);
        const long = msg.slice(0, TRUNCATE_ROW_ERROR);
        const row: BenchmarkRunRow = {
          ...rowBase,
          effective_backend: deriveEffectiveBackend(partialSignals),
          pp_avg: null,
          tg_avg: null,
          wall_ms: Date.now() - tStart,
          peak_memory_mb: null,
          log_signals: partialSignals,
          init_settings: {},
          status: 'failed',
          error: long,
        };
        report.runs.push(row);
        try {
          await RNFS.writeFile(path, JSON.stringify(report, null, 2), 'utf8');
        } catch {
          // best-effort
        }
        // Per-cell failure: use a non-terminal status so the WDIO spec keeps
        // polling until the loop ends with `complete`. `error:` is reserved
        // for fatal runner failures (caught by onRun's outer try/catch).
        // Without this distinction, a single cell failure would make the spec
        // pull a partial report mid-run while the screen is still iterating.
        setStatus(`cell-failed:${i + 1}/${cells.length}:${short}`);
        // continue to the next cell — per-cell error containment.
      } finally {
        // Sole release site: cells that finished initContext (success path or
        // any throw afterwards) release exactly once. Cells that threw before
        // initContext resolved (e.g. download-timeout, GPU pre-check) skip
        // release because there is no context to release.
        if (contextInitialized) {
          try {
            await (modelStore as any).releaseContext?.();
          } catch {
            // releaseContext throwing should not abort the matrix; the next
            // cell's initContext will tear down the stale context anyway.
          }
        }
        // Sole listener-detach site. Idempotent: no-op when null.
        logSub?.remove();
        logSub = null;
      }
    }

    setStatus('complete');
  } finally {
    await toggleNativeLog(false).catch(() => undefined);
  }
}

interface BenchmarkRunnerScreenProps {
  // Test-only seam: lets unit tests replace the runner with a mock to
  // assert single-flight gating and call counts without driving a real
  // matrix. Production code never passes this prop.
  __runner?: typeof runMatrix;
  __loadConfig?: typeof loadConfig;
}

export const BenchmarkRunnerScreen: React.FC<BenchmarkRunnerScreenProps> =
  observer(({__runner, __loadConfig}) => {
    const [status, setStatus] = useState<Status>('idle');
    const [lastCell, setLastCell] = useState<{
      pp?: number;
      tg?: number;
      cells?: number;
    }>({});
    const runningRef = useRef(false);

    const onRun = useCallback(async () => {
      // Single-flight: ignore taps while a run is in progress.
      if (runningRef.current) {
        return;
      }
      if (
        status !== 'idle' &&
        status !== 'complete' &&
        !status.startsWith('error:')
      ) {
        return;
      }
      runningRef.current = true;
      // Runtime reference to the marker constant — protects against Hermes
      // DCE. Without this, the literal would be stripped from the e2e
      // bundle and the CI grep "must be present" check would falsely pass.
      console.log(`[${BENCH_RUN_MATRIX}] starting matrix run`);
      try {
        const cfg = await (__loadConfig ?? loadConfig)();
        await (__runner ?? runMatrix)(cfg, setStatus, setLastCell);
      } catch (e) {
        const msg = (e as Error).message ?? 'unknown';
        setStatus(`error:${msg.slice(0, TRUNCATE_ERROR)}`);
      } finally {
        runningRef.current = false;
      }
    }, [status, __loadConfig, __runner]);

    const onReset = useCallback(() => {
      if (runningRef.current) {
        return;
      }
      setStatus('idle');
      setLastCell({});
    }, []);

    return (
      <ScrollView
        contentContainerStyle={styles.container}
        testID="bench-runner-screen">
        <Text style={styles.title}>Benchmark Matrix Runner</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Status:</Text>
          <Text testID="bench-runner-screen-status" accessibilityLabel={status}>
            {status}
          </Text>
        </View>
        <View
          testID="bench-runner-screen-result-preview"
          style={styles.preview}>
          <Text>Cells completed: {lastCell.cells ?? 0}</Text>
          <Text>Last pp: {lastCell.pp ?? '-'}</Text>
          <Text>Last tg: {lastCell.tg ?? '-'}</Text>
        </View>
        <View style={styles.buttonRow}>
          <Button
            testID="bench-run-button"
            title="Run benchmark matrix"
            onPress={onRun}
          />
        </View>
        <View style={styles.buttonRow}>
          <Button testID="bench-reset-button" title="Reset" onPress={onReset} />
        </View>
      </ScrollView>
    );
  });

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  label: {
    marginRight: 8,
    fontWeight: 'bold',
  },
  preview: {
    marginTop: 12,
    marginBottom: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: '#cccccc',
  },
  buttonRow: {
    marginVertical: 6,
  },
});
