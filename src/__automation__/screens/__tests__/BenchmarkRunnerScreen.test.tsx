import React from 'react';
import {act} from 'react-test-renderer';

import {fireEvent, render, waitFor} from '../../../../jest/test-utils';

import {modelStore} from '../../../store';

// Mock RNFS at the module path the screen imports.
jest.mock('@dr.pogodin/react-native-fs', () => ({
  ExternalDirectoryPath: '/mock/external',
  exists: jest.fn().mockResolvedValue(true),
  readFile: jest.fn(),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

const RNFS = require('@dr.pogodin/react-native-fs');

// Mock the deviceSelection helper so the GPU path is testable.
jest.mock('../../../utils/deviceSelection', () => ({
  getDeviceOptions: jest.fn().mockResolvedValue([
    {id: 'cpu', label: 'CPU', devices: ['CPU']},
    {id: 'gpu', label: 'GPU (OpenCL)', devices: ['Adreno (TM) 840v2']},
  ]),
}));

const {getDeviceOptions} = require('../../../utils/deviceSelection');

// Re-grab the llama.rn mocks so tests can drive the native log stream.
const {addNativeLogListener, toggleNativeLog} = require('llama.rn');

import {
  BenchmarkRunnerScreen,
  runMatrix,
  BenchConfig,
  expandAxes,
  canonicaliseFingerprint,
  buildSuccessFingerprint,
  buildFailureFingerprint,
  APP_DEFAULT_FINGERPRINT,
} from '../BenchmarkRunnerScreen';

const VALID_CONFIG: BenchConfig = {
  models: [
    {
      id: 'qwen3-1.7b',
      hfModelId: 'bartowski/Qwen_Qwen3-1.7B-GGUF',
      quants: [{quant: 'q4_0', filename: 'Qwen_Qwen3-1.7B-Q4_0.gguf'}],
    },
  ],
  backends: ['gpu'],
  bench: {pp: 4, tg: 4, pl: 1, nr: 1},
};

describe('BenchmarkRunnerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    RNFS.exists.mockResolvedValue(true);
    RNFS.readFile.mockResolvedValue(JSON.stringify(VALID_CONFIG));
    RNFS.writeFile.mockResolvedValue(undefined);
    getDeviceOptions.mockResolvedValue([
      {id: 'cpu', label: 'CPU', devices: ['CPU']},
      {id: 'gpu', label: 'GPU (OpenCL)', devices: ['Adreno (TM) 840v2']},
    ]);
  });

  describe('component', () => {
    it('renders with idle status and run/reset buttons', () => {
      const {getByTestId} = render(<BenchmarkRunnerScreen />);
      expect(getByTestId('bench-runner-screen')).toBeTruthy();
      expect(getByTestId('bench-runner-screen-status')).toBeTruthy();
      expect(getByTestId('bench-run-button')).toBeTruthy();
      expect(getByTestId('bench-reset-button')).toBeTruthy();
      expect(getByTestId('bench-runner-screen-result-preview')).toBeTruthy();
    });

    it('status accessibilityLabel matches rendered text (idle)', () => {
      const {getByTestId} = render(<BenchmarkRunnerScreen />);
      const status = getByTestId('bench-runner-screen-status');
      expect(status.props.accessibilityLabel).toBe('idle');
      expect(status.props.children).toBe('idle');
    });

    it('tapping run while idle invokes the runner exactly once', async () => {
      const runner = jest.fn().mockResolvedValue(undefined);
      const loader = jest.fn().mockResolvedValue(VALID_CONFIG);
      const {getByTestId} = render(
        <BenchmarkRunnerScreen __runner={runner} __loadConfig={loader} />,
      );
      await act(async () => {
        fireEvent.press(getByTestId('bench-run-button'));
      });
      expect(loader).toHaveBeenCalledTimes(1);
      expect(runner).toHaveBeenCalledTimes(1);
    });

    it('tapping run while running is a no-op (single-flight)', async () => {
      // Runner that resolves only when we tell it to.
      let resolveRunner: () => void = () => {};
      const runner = jest.fn(
        () =>
          new Promise<void>(r => {
            resolveRunner = r;
          }),
      );
      const loader = jest.fn().mockResolvedValue(VALID_CONFIG);
      const {getByTestId} = render(
        <BenchmarkRunnerScreen __runner={runner} __loadConfig={loader} />,
      );
      // First tap kicks off the run.
      await act(async () => {
        fireEvent.press(getByTestId('bench-run-button'));
      });
      expect(runner).toHaveBeenCalledTimes(1);
      // Second tap while still running is a no-op.
      await act(async () => {
        fireEvent.press(getByTestId('bench-run-button'));
      });
      expect(runner).toHaveBeenCalledTimes(1);
      // Let the run complete to flush state.
      await act(async () => {
        resolveRunner();
      });
    });

    it('reset returns status to idle', async () => {
      const runner = jest.fn(async (_cfg, setStatus) => {
        setStatus('error:test-error');
      });
      const loader = jest.fn().mockResolvedValue(VALID_CONFIG);
      const {getByTestId} = render(
        <BenchmarkRunnerScreen __runner={runner} __loadConfig={loader} />,
      );
      await act(async () => {
        fireEvent.press(getByTestId('bench-run-button'));
      });
      await waitFor(() => {
        expect(
          getByTestId('bench-runner-screen-status').props.accessibilityLabel,
        ).toBe('error:test-error');
      });
      await act(async () => {
        fireEvent.press(getByTestId('bench-reset-button'));
      });
      expect(
        getByTestId('bench-runner-screen-status').props.accessibilityLabel,
      ).toBe('idle');
    });

    it('missing config file sets status error:bench-config-missing', async () => {
      RNFS.exists.mockResolvedValueOnce(false);
      const {getByTestId} = render(<BenchmarkRunnerScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('bench-run-button'));
      });
      await waitFor(() => {
        expect(
          getByTestId('bench-runner-screen-status').props.accessibilityLabel,
        ).toBe('error:bench-config-missing');
      });
    });

    it('malformed config JSON sets status to error:<parse-msg>', async () => {
      RNFS.exists.mockResolvedValueOnce(true);
      RNFS.readFile.mockResolvedValueOnce('this is not json {');
      const {getByTestId} = render(<BenchmarkRunnerScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('bench-run-button'));
      });
      await waitFor(() => {
        const lbl = getByTestId('bench-runner-screen-status').props
          .accessibilityLabel;
        expect(typeof lbl).toBe('string');
        expect(lbl.startsWith('error:')).toBe(true);
        // Don't pin the exact JSON.parse error string — engines vary.
      });
    });
  });

  describe('runMatrix', () => {
    const setStatus = jest.fn();
    const setLastCell = jest.fn();

    beforeEach(() => {
      setStatus.mockClear();
      setLastCell.mockClear();
      // Default: a downloaded model exists for the variant filename.
      (modelStore as any).models = [
        {
          id: 'qwen3-1.7b-q4_0',
          name: 'qwen3',
          filename: 'Qwen_Qwen3-1.7B-Q4_0.gguf',
          isDownloaded: true,
        },
      ] as any;
      (modelStore as any).context = {
        bench: jest.fn().mockResolvedValue({speedPp: 12.5, speedTg: 4.5}),
      };
      (modelStore as any).releaseContext = jest
        .fn()
        .mockResolvedValue(undefined);
      (modelStore as any).contextInitParams = {
        n_ctx: 2048,
        devices: ['Adreno (TM) 840v2'],
      };
      (modelStore.initContext as jest.Mock).mockResolvedValue(undefined);
      (modelStore.setDevices as jest.Mock).mockClear();
      // Default native-log mock: no lines emitted, no-op remove.
      (addNativeLogListener as jest.Mock).mockReset();
      (addNativeLogListener as jest.Mock).mockReturnValue({remove: jest.fn()});
      (toggleNativeLog as jest.Mock).mockReset();
      (toggleNativeLog as jest.Mock).mockResolvedValue(undefined);
    });

    it('runs a single GPU cell to completion and writes a report row', async () => {
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      // Status transitions: running:..., complete (downloaded model
      // → no downloading: transition).
      const statusCalls = setStatus.mock.calls.map(c => c[0]);
      expect(
        statusCalls.some((s: string) => s.startsWith('running:1/1:')),
      ).toBe(true);
      expect(statusCalls[statusCalls.length - 1]).toBe('complete');
      // setDevices called with the resolved Adreno name.
      expect(modelStore.setDevices).toHaveBeenCalledWith(['Adreno (TM) 840v2']);
      expect(modelStore.initContext).toHaveBeenCalled();
      expect(setLastCell).toHaveBeenCalledWith(
        expect.objectContaining({pp: 12.5, tg: 4.5, cells: 1}),
      );
      // Report written at least twice (shell + after cell).
      expect(RNFS.writeFile.mock.calls.length).toBeGreaterThanOrEqual(2);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs).toHaveLength(1);
      expect(json.runs[0]).toMatchObject({
        model_id: 'qwen3-1.7b',
        quant: 'q4_0',
        requested_backend: 'gpu',
        pp_avg: 12.5,
        tg_avg: 4.5,
        status: 'ok',
      });
    });

    it('GPU cell fails with "GPU device not available" when getDeviceOptions has no gpu entry', async () => {
      getDeviceOptions.mockResolvedValueOnce([
        {id: 'cpu', label: 'CPU', devices: ['CPU']},
      ]);
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs).toHaveLength(1);
      expect(json.runs[0]).toMatchObject({
        status: 'failed',
        error: 'GPU device not available',
        effective_backend: 'unknown',
      });
      // Final status should still be complete (per-cell error containment).
      expect(setStatus.mock.calls[setStatus.mock.calls.length - 1][0]).toBe(
        'complete',
      );
    });

    it('derives effective_backend=opencl from native-log listener output', async () => {
      // Stub the listener so it synchronously emits a canonical full-offload
      // GPU log sequence the moment runMatrix attaches.
      const remove = jest.fn();
      (addNativeLogListener as jest.Mock).mockImplementation(
        (cb: (level: string, text: string) => void) => {
          cb('I', 'lm_ggml_opencl: Initializing OpenCL backend');
          cb('I', 'lm_ggml_opencl: device Adreno (TM) 840v2');
          cb('I', 'lm_ggml_opencl: Adreno large buffer enabled');
          cb('I', 'load_tensors: offloaded 28/28 layers to GPU');
          return {remove};
        },
      );
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      expect(toggleNativeLog).toHaveBeenCalledWith(true);
      expect(toggleNativeLog).toHaveBeenCalledWith(false);
      expect(remove).toHaveBeenCalled();
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0]).toMatchObject({
        status: 'ok',
        effective_backend: 'opencl',
      });
      expect(json.runs[0].log_signals).toMatchObject({
        opencl_init: true,
        opencl_device_name: 'Adreno (TM) 840v2',
        large_buffer_enabled: true,
        offloaded_layers: 28,
        total_layers: 28,
      });
    });

    it('listener is detached when a cell throws after attach', async () => {
      const remove = jest.fn();
      (addNativeLogListener as jest.Mock).mockImplementation(
        (cb: (level: string, text: string) => void) => {
          cb('I', 'lm_ggml_opencl: Initializing OpenCL backend');
          return {remove};
        },
      );
      (modelStore.initContext as jest.Mock).mockRejectedValueOnce(
        new Error('init exploded'),
      );
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      // finally is the sole detach site: exactly one remove() per cell, no
      // duplicate from the now-deleted catch-path detach (round-1 C3).
      expect(remove).toHaveBeenCalledTimes(1);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      // Partial signals salvaged from pre-throw lines: opencl_init=true but
      // no offloaded layer count -> effective_backend = 'unknown'.
      expect(json.runs[0]).toMatchObject({
        status: 'failed',
        effective_backend: 'unknown',
      });
      expect(json.runs[0].log_signals.opencl_init).toBe(true);
    });

    it('listener is detached exactly once on the success path (no duplicate from finally)', async () => {
      // Sole-detach-site invariant: when a cell completes cleanly the finally
      // block is the ONLY detach site. The success-path detach at the
      // pre-fix call site was deleted; the catch-path detach was deleted.
      // If a future refactor reintroduces either, this assertion fires.
      const remove = jest.fn();
      (addNativeLogListener as jest.Mock).mockImplementation(
        (cb: (level: string, text: string) => void) => {
          cb('I', 'load_tensors: offloaded 28/28 layers to GPU');
          return {remove};
        },
      );
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      expect(remove).toHaveBeenCalledTimes(1);
    });

    it('per-cell throw sets row status:failed and continues to next cell', async () => {
      const config: BenchConfig = {
        models: [
          {
            id: 'qwen3-1.7b',
            hfModelId: 'bartowski/Qwen_Qwen3-1.7B-GGUF',
            quants: [
              {quant: 'q4_0', filename: 'Qwen_Qwen3-1.7B-Q4_0.gguf'},
              {quant: 'q4_k_m', filename: 'Qwen_Qwen3-1.7B-Q4_K_M.gguf'},
            ],
          },
        ],
        backends: ['gpu'],
      };
      // Two downloaded models for both filenames.
      (modelStore as any).models = [
        {
          id: 'a',
          filename: 'Qwen_Qwen3-1.7B-Q4_0.gguf',
          isDownloaded: true,
        },
        {
          id: 'b',
          filename: 'Qwen_Qwen3-1.7B-Q4_K_M.gguf',
          isDownloaded: true,
        },
      ] as any;
      // First initContext throws, second resolves.
      (modelStore.initContext as jest.Mock)
        .mockRejectedValueOnce(new Error('first cell boom'))
        .mockResolvedValueOnce(undefined);
      await runMatrix(config, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs).toHaveLength(2);
      expect(json.runs[0].status).toBe('failed');
      expect(json.runs[0].error).toContain('first cell boom');
      expect(json.runs[1].status).toBe('ok');
      // Cell 1's initContext rejected, so contextInitialized stayed false and
      // releaseContext is skipped. Cell 2's initContext resolved, so the
      // finally releases exactly once. A future flag-misorder regression
      // (e.g. setting contextInitialized before await initContext) would
      // produce 2 here and trip this assertion.
      expect((modelStore as any).releaseContext).toHaveBeenCalledTimes(1);
      expect(setStatus.mock.calls[setStatus.mock.calls.length - 1][0]).toBe(
        'complete',
      );
    });

    // -------------------------------------------------------------------------
    // C3: per-cell context release in `finally`.
    // -------------------------------------------------------------------------

    it('releases context when bench rejects after a successful initContext', async () => {
      // initContext resolves (so contextInitialized becomes true), then
      // ctx.bench rejects — the `finally` must call releaseContext exactly
      // once and the row must land as failed.
      (modelStore as any).context = {
        bench: jest.fn().mockRejectedValue(new Error('bench exploded')),
      };
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      expect((modelStore as any).releaseContext).toHaveBeenCalledTimes(1);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs).toHaveLength(1);
      expect(json.runs[0]).toMatchObject({
        status: 'failed',
        error: expect.stringContaining('bench exploded'),
      });
    });

    it('does NOT call releaseContext when initContext itself rejects', async () => {
      // No init, no release. The pre-init throw skips release because there
      // is no context to release.
      (modelStore.initContext as jest.Mock).mockRejectedValueOnce(
        new Error('init exploded'),
      );
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      expect((modelStore as any).releaseContext).not.toHaveBeenCalled();
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0]).toMatchObject({
        status: 'failed',
        error: expect.stringContaining('init exploded'),
      });
    });

    // -------------------------------------------------------------------------
    // C1(a) screen-side invariant: status:'ok' rows always have non-null
    // pp_avg AND tg_avg. If ctx.bench resolves with either metric undefined,
    // the row must end up as status:'failed' (catch path).
    // -------------------------------------------------------------------------

    it('forces status:failed when bench() resolves with speedPp undefined', async () => {
      (modelStore as any).context = {
        bench: jest.fn().mockResolvedValue({speedPp: undefined, speedTg: 4.5}),
      };
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs).toHaveLength(1);
      expect(json.runs[0]).toMatchObject({
        status: 'failed',
        pp_avg: null,
        tg_avg: null,
        error: expect.stringContaining('bench returned null metric'),
      });
      // Release still happens because initContext succeeded.
      expect((modelStore as any).releaseContext).toHaveBeenCalledTimes(1);
    });

    it('forces status:failed when bench() resolves with speedTg undefined', async () => {
      (modelStore as any).context = {
        bench: jest.fn().mockResolvedValue({speedPp: 12.5, speedTg: undefined}),
      };
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0]).toMatchObject({
        status: 'failed',
        pp_avg: null,
        tg_avg: null,
        error: expect.stringContaining('bench returned null metric'),
      });
    });

    // -------------------------------------------------------------------------
    // C2 persist: report JSON must include the resolved bench block at the
    // top level, copied from config.bench (NOT the DEFAULT_BENCH fallback).
    // -------------------------------------------------------------------------

    it('persists config.bench at the top level of the report (not DEFAULT_BENCH)', async () => {
      // Use a non-default bench block so a missing copy would surface as
      // DEFAULT_BENCH and fail the assertion.
      const customConfig: BenchConfig = {
        ...VALID_CONFIG,
        bench: {pp: 777, tg: 88, pl: 2, nr: 5},
      };
      await runMatrix(customConfig, setStatus, setLastCell);
      // The shell write at runMatrix start is the first write call; bench is
      // there too. Assert on the most recent write to be robust to either.
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.bench).toEqual({pp: 777, tg: 88, pl: 2, nr: 5});
    });

    // -------------------------------------------------------------------------
    // Per-cell failure status: must be `cell-failed:` (non-terminal for the
    // spec) not `error:` (terminal). The spec breaks polling on `error:`, so
    // a per-cell failure marked as `error:` would make it pull a partial
    // report mid-run.
    // -------------------------------------------------------------------------

    it('uses cell-failed: status (not error:) for per-cell failures so the matrix continues', async () => {
      (modelStore as any).context = {
        bench: jest.fn().mockRejectedValue(new Error('bench-blew-up')),
      };
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const statusCalls = setStatus.mock.calls.map(c => c[0]);
      // Status that surfaces the per-cell failure must NOT start with 'error:'.
      const failureStatus = statusCalls.find((s: string) =>
        s.includes('bench-blew-up'),
      );
      expect(failureStatus).toBeDefined();
      expect(failureStatus.startsWith('error:')).toBe(false);
      expect(failureStatus.startsWith('cell-failed:')).toBe(true);
      // Final status is still 'complete' (loop terminates normally).
      expect(statusCalls[statusCalls.length - 1]).toBe('complete');
    });

    // -------------------------------------------------------------------------
    // Outer try/finally: toggleNativeLog(false) must run even when something
    // throws between toggleNativeLog(true) and the end of the loop. Without
    // this, a fatal error leaves native logging on for the rest of the
    // session.
    // -------------------------------------------------------------------------

    it('disables native logging in finally even when the loop body throws', async () => {
      // Make the report-shell write throw, simulating a fatal early failure.
      RNFS.writeFile.mockRejectedValueOnce(new Error('shell-write-failed'));
      await expect(
        runMatrix(VALID_CONFIG, setStatus, setLastCell),
      ).rejects.toThrow('shell-write-failed');
      expect(toggleNativeLog).toHaveBeenCalledWith(true);
      expect(toggleNativeLog).toHaveBeenCalledWith(false);
    });

    // -------------------------------------------------------------------------
    // Download-error fast-fail: a download failure must surface within one
    // poll tick (~500 ms), not after the 30-min deadline.
    // -------------------------------------------------------------------------

    it('fails the cell fast when modelStore.downloadError fires during polling', async () => {
      // Empty models list at start so the screen takes the download branch.
      (modelStore as any).models = [] as any;
      (modelStore as any).downloadError = null;
      (modelStore as any).clearDownloadError = jest.fn(() => {
        (modelStore as any).downloadError = null;
      });
      (modelStore as any).downloadHFModel = jest.fn(async () => {
        // Simulate the DownloadManager onError handler firing immediately.
        (modelStore as any).downloadError = {
          message: 'connection-reset',
          metadata: {modelId: 'qwen3-1.7b-q4_0'},
        };
      });
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs).toHaveLength(1);
      expect(json.runs[0].status).toBe('failed');
      expect(json.runs[0].error).toContain('download-failed');
      expect(json.runs[0].error).toContain('connection-reset');
      // Verify the previous-error slot was cleared before the download started.
      expect((modelStore as any).clearDownloadError).toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Settings-axes sweep behaviour (WHAT 2, 6.A, 6.B)
    // -------------------------------------------------------------------------

    it('emits report.version "1.1" and omits settings_axes_used when no axes (WHAT 6.A)', async () => {
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.version).toBe('1.1');
      expect(
        Object.prototype.hasOwnProperty.call(json, 'settings_axes_used'),
      ).toBe(false);
    });

    it('echoes settings_axes_used in the report when axes are present', async () => {
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['f16', 'q8_0']}],
      };
      await runMatrix(cfg, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.settings_axes_used).toEqual([
        {name: 'cache_type_k', values: ['f16', 'q8_0']},
      ]);
    });

    it('expands one cache_type_k axis into two cells per (model,quant,backend) (WHAT 6.B)', async () => {
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['f16', 'q8_0']}],
      };
      await runMatrix(cfg, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      // 1 model × 1 quant × 1 backend × 2 cache values = 2 cells.
      expect(json.runs).toHaveLength(2);
      expect(json.runs[0].settings_overrides).toEqual({cache_type_k: 'f16'});
      expect(json.runs[1].settings_overrides).toEqual({cache_type_k: 'q8_0'});
    });

    // -------------------------------------------------------------------------
    // Apply-overrides + restore (WHAT 4c, 4h I4/I5)
    // -------------------------------------------------------------------------

    it('applySettingsOverrides routes through existing setters (I4 — no direct mutation)', async () => {
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['q8_0']}],
      };
      await runMatrix(cfg, setStatus, setLastCell);
      // Setter called for the cell's override.
      expect(modelStore.setCacheTypeK).toHaveBeenCalledWith('q8_0');
    });

    it('apply order: flash_attn_type runs BEFORE cache_type_k (constraint state ready when cache setter runs)', async () => {
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [
          {name: 'cache_type_k', values: ['q8_0']},
          {name: 'flash_attn_type', values: ['on']},
        ],
      };
      await runMatrix(cfg, setStatus, setLastCell);
      // Compute the call ordinals — flash_attn_type's mock `.mock.invocationCallOrder`
      // entry must precede cache_type_k's. (Restore at the end runs the same
      // setters again with the snapshot values, so we check the FIRST call
      // ordinal of each.)
      const flashOrders = (modelStore.setFlashAttnType as jest.Mock).mock
        .invocationCallOrder;
      const cacheOrders = (modelStore.setCacheTypeK as jest.Mock).mock
        .invocationCallOrder;
      expect(flashOrders.length).toBeGreaterThan(0);
      expect(cacheOrders.length).toBeGreaterThan(0);
      expect(flashOrders[0]).toBeLessThan(cacheOrders[0]);
    });

    it('restoreSettingsSnapshot runs in the outer finally on success path (I5)', async () => {
      // Pre-run snapshot derives from contextInitParams set in beforeEach.
      // The default snapshot has only n_ctx + devices; cache_type_k etc are
      // undefined, so restore is a no-op for them. We force a non-empty
      // snapshot to make the assertion non-trivial.
      (modelStore as any).contextInitParams = {
        ...((modelStore as any).contextInitParams ?? {}),
        cache_type_k: 'f16',
        n_threads: 6,
      };
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['q8_0']}],
      };
      await runMatrix(cfg, setStatus, setLastCell);
      // Restore in finally calls the setters again with the snapshot values.
      // The sequence is: apply('q8_0') for the cell, restore('f16') in finally.
      const calls = (modelStore.setCacheTypeK as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(calls[calls.length - 1][0]).toBe('f16');
      const tCalls = (modelStore.setNThreads as jest.Mock).mock.calls;
      // n_threads not in axes -> only restore() ran (or zero calls if not in
      // snapshot). Snapshot had n_threads:6 so restore must have set it.
      expect(tCalls.length).toBeGreaterThanOrEqual(1);
      expect(tCalls[tCalls.length - 1][0]).toBe(6);
    });

    it('restoreSettingsSnapshot runs in the outer finally even when the loop body throws (I5)', async () => {
      (modelStore as any).contextInitParams = {
        ...((modelStore as any).contextInitParams ?? {}),
        n_threads: 6,
      };
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'n_threads', values: [4]}],
      };
      // Make the report-shell write throw, simulating a fatal early failure.
      RNFS.writeFile.mockRejectedValueOnce(new Error('shell-write-failed'));
      await expect(runMatrix(cfg, setStatus, setLastCell)).rejects.toThrow(
        'shell-write-failed',
      );
      // The shell write fails BEFORE any cell-level apply runs, so the only
      // setter activity is the final restore() in the outer finally — which
      // resets n_threads back to the snapshot value (6).
      const tCalls = (modelStore.setNThreads as jest.Mock).mock.calls;
      expect(tCalls[tCalls.length - 1][0]).toBe(6);
    });

    it('mid-cell throw still restores ALL pre-run snapshot values for ALL three cells (I5 — gap-fill)', async () => {
      // I5 says the matrix-level pre-run snapshot is the fixed point for
      // restoration, regardless of which cell threw. The earlier tests
      // exercised:
      //   - clean success path (all cells OK)
      //   - an outer-thrown shell write before any cell ran
      // This gap-fill exercises the in-flight case: 3 cells, the SECOND
      // throws inside the loop body. The OUTER finally must still restore
      // the matrix-level pre-run snapshot — covering keys touched by cells
      // that completed BEFORE the throw, the throwing cell, AND any cells
      // that ran after. Per WHAT §4h I5: "On matrix end (any path),
      // restoreSettingsSnapshot runs."
      (modelStore as any).contextInitParams = {
        ...((modelStore as any).contextInitParams ?? {}),
        cache_type_k: 'f16',
        n_threads: 6,
        use_mmap: 'smart',
      };
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        // Three cells via a single axis with three values; cell 2 throws.
        settings_axes: [
          {name: 'cache_type_k', values: ['q8_0', 'q5_0', 'f16']},
        ],
      };
      // Make initContext for cell 2 (q5_0) reject; cells 1 + 3 succeed.
      (modelStore.initContext as jest.Mock)
        .mockResolvedValueOnce(undefined) // cell 1
        .mockRejectedValueOnce(new Error('cell-2-init-boom'))
        .mockResolvedValueOnce(undefined); // cell 3
      await runMatrix(cfg, setStatus, setLastCell);
      // All three cells ran (per I7 + per-cell containment).
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs).toHaveLength(3);
      expect(json.runs[1].status).toBe('failed');
      // Restoration in the outer finally must call EACH snapshot setter at
      // least once with the pre-run value — covering all three knobs, not
      // just the one being swept. The mid-cell throw is irrelevant: the
      // outer finally restores the full matrix-level snapshot.
      const cacheCalls = (modelStore.setCacheTypeK as jest.Mock).mock.calls;
      expect(cacheCalls[cacheCalls.length - 1][0]).toBe('f16');
      const tCalls = (modelStore.setNThreads as jest.Mock).mock.calls;
      expect(tCalls[tCalls.length - 1][0]).toBe(6);
      const mmapCalls = (modelStore.setUseMmap as jest.Mock).mock.calls;
      expect(mmapCalls[mmapCalls.length - 1][0]).toBe('smart');
    });

    // -------------------------------------------------------------------------
    // Hexagon path (WHAT 4a.7, 4h I7, 6.C)
    // -------------------------------------------------------------------------

    it('hexagon cell fails fast with "Hexagon device not available" when getDeviceOptions has no hexagon entry', async () => {
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        backends: ['hexagon'],
      };
      // getDeviceOptions returns cpu+gpu only — no hexagon option.
      getDeviceOptions.mockResolvedValueOnce([
        {id: 'cpu', label: 'CPU', devices: ['CPU']},
        {id: 'gpu', label: 'GPU (OpenCL)', devices: ['Adreno (TM) 840v2']},
      ]);
      await runMatrix(cfg, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs).toHaveLength(1);
      expect(json.runs[0]).toMatchObject({
        status: 'failed',
        error: 'Hexagon device not available',
        effective_backend: 'unknown',
      });
      // Final status still 'complete' (per-cell error containment, I7).
      expect(setStatus.mock.calls[setStatus.mock.calls.length - 1][0]).toBe(
        'complete',
      );
    });

    it('hexagon cell dispatches HTP* devices when the option is available', async () => {
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        backends: ['hexagon'],
      };
      getDeviceOptions.mockResolvedValueOnce([
        {id: 'cpu', label: 'CPU', devices: ['CPU']},
        {id: 'hexagon', label: 'Hexagon', devices: ['HTP*']},
      ]);
      await runMatrix(cfg, setStatus, setLastCell);
      // setDevices called with the hexagon wildcard.
      expect(modelStore.setDevices).toHaveBeenCalledWith(['HTP*']);
    });

    it('hexagon-on-non-hexagon-device does NOT abort the matrix (I7) — subsequent cells still run', async () => {
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        backends: ['hexagon', 'cpu'],
      };
      getDeviceOptions.mockResolvedValueOnce([
        {id: 'cpu', label: 'CPU', devices: ['CPU']},
      ]);
      await runMatrix(cfg, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs).toHaveLength(2);
      // First cell (hexagon) fails, second (cpu) runs.
      expect(json.runs[0]).toMatchObject({
        requested_backend: 'hexagon',
        status: 'failed',
      });
      expect(json.runs[1]).toMatchObject({
        requested_backend: 'cpu',
        status: 'ok',
      });
    });

    // -------------------------------------------------------------------------
    // Status `<tag>` extension (WHAT 3, 8 D9)
    // -------------------------------------------------------------------------

    it('status running:<tag> appends override summary when overrides are non-empty', async () => {
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['q8_0']}],
      };
      await runMatrix(cfg, setStatus, setLastCell);
      const statusCalls = setStatus.mock.calls.map(c => c[0]);
      const runningCall = statusCalls.find(
        (s: string) =>
          s.startsWith('running:') && s.includes('cache_type_k=q8_0'),
      );
      expect(runningCall).toBeDefined();
    });

    it('status running:<tag> matches legacy format when overrides are empty (no axes)', async () => {
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const statusCalls = setStatus.mock.calls.map(c => c[0]);
      // Legacy format: 'running:1/1:qwen3-1.7b/q4_0/gpu' — no trailing slash.
      const runningCall = statusCalls.find((s: string) =>
        /^running:1\/1:qwen3-1\.7b\/q4_0\/gpu$/.test(s),
      );
      expect(runningCall).toBeDefined();
    });

    // -------------------------------------------------------------------------
    // Row writer: fingerprint wiring (WHAT 4a.4-5, 4i, 4h I1/I2/I3)
    // -------------------------------------------------------------------------

    it('success row carries app-default fingerprint when no axes (WHAT 6.A)', async () => {
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0].settings_fingerprint).toBe('app-default');
      expect(json.runs[0].settings_overrides).toEqual({});
    });

    it('success rows carry distinct canonical fingerprints when axis is set', async () => {
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['f16', 'q8_0']}],
      };
      // Drive the post-init snapshot to reflect the cell's override —
      // the mock setCacheTypeK is a jest.fn() that does NOT mutate
      // contextInitParams, so we simulate the engine's effect by
      // capturing the most recent setCacheTypeK arg and patching
      // contextInitParams via mockImplementation.
      (modelStore.setCacheTypeK as jest.Mock).mockImplementation(
        (v: string) => {
          (modelStore as any).contextInitParams = {
            ...(modelStore as any).contextInitParams,
            cache_type_k: v,
          };
        },
      );
      await runMatrix(cfg, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs).toHaveLength(2);
      // Both rows are status:'ok' so they take the success-fingerprint
      // path — derived from post-init snapshot.
      expect(json.runs[0].settings_fingerprint).toContain('cache_type_k=f16');
      expect(json.runs[1].settings_fingerprint).toContain('cache_type_k=q8_0');
      expect(json.runs[0].settings_fingerprint).not.toBe(
        json.runs[1].settings_fingerprint,
      );
      // Neither is the app-default literal (axes were present).
      expect(json.runs[0].settings_fingerprint).not.toBe('app-default');
    });

    it('pre-init failure row carries req:-prefixed fingerprint when sweep axes are set (WHAT 9c, I3)', async () => {
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['q8_0']}],
      };
      // Force initContext to reject so postInitSnapshot stays null.
      (modelStore.initContext as jest.Mock).mockRejectedValueOnce(
        new Error('init exploded'),
      );
      await runMatrix(cfg, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0].status).toBe('failed');
      expect(json.runs[0].settings_fingerprint.startsWith('req:')).toBe(true);
      expect(json.runs[0].settings_fingerprint).toContain('cache_type_k=q8_0');
    });

    it('post-init failure row carries standard (non-req:) fingerprint (WHAT 9d)', async () => {
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['q8_0']}],
      };
      // initContext succeeds; bench() throws.
      (modelStore.setCacheTypeK as jest.Mock).mockImplementation(
        (v: string) => {
          (modelStore as any).contextInitParams = {
            ...(modelStore as any).contextInitParams,
            cache_type_k: v,
          };
        },
      );
      (modelStore as any).context = {
        bench: jest.fn().mockRejectedValue(new Error('bench-blew-up')),
      };
      await runMatrix(cfg, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0].status).toBe('failed');
      // No 'req:' prefix — the post-init snapshot was available.
      expect(json.runs[0].settings_fingerprint.startsWith('req:')).toBe(false);
      expect(json.runs[0].settings_fingerprint).toContain('cache_type_k=q8_0');
    });

    it('post-init failure row preserves the captured snapshot in init_settings (WHAT 9d — gap-fill)', async () => {
      // WHAT 9d explicitly says: "Snapshot is available; post-init
      // fingerprint is derivable. ... the runner MUST hoist the post-init
      // snapshot capture into a local variable BEFORE the bench step."
      // The implementer's catch path writes `init_settings: postInitSnapshot
      // ?? {}` — the prior tests assert the fingerprint provenance and the
      // listener-detach contract, but no test pins down that init_settings
      // CARRIES the captured snapshot (vs. falling back to the pre-fix
      // empty `{}`). If a future refactor reverts to `init_settings: {}`
      // on the catch path, this assertion fires.
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['q8_0']}],
      };
      // initContext succeeds and the engine effect lands cache_type_k='q8_0'
      // into contextInitParams; bench() then throws so the catch path runs.
      (modelStore.setCacheTypeK as jest.Mock).mockImplementation(
        (v: string) => {
          (modelStore as any).contextInitParams = {
            ...(modelStore as any).contextInitParams,
            cache_type_k: v,
          };
        },
      );
      (modelStore as any).context = {
        bench: jest.fn().mockRejectedValue(new Error('bench-blew-up')),
      };
      await runMatrix(cfg, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0].status).toBe('failed');
      // The captured snapshot must survive into the failure row's
      // init_settings — not be zeroed to `{}`. The post-init snapshot
      // reflects the cell's applied override, so cache_type_k=q8_0 must
      // be visible to operators reading the report.
      expect(json.runs[0].init_settings).not.toEqual({});
      expect(json.runs[0].init_settings).toMatchObject({
        cache_type_k: 'q8_0',
      });
      // Effective_backend on a post-init throw is whatever the partial log
      // signals derived; sanity-check the row still surfaces the bench
      // error message so a regression that swallowed the post-init
      // snapshot AND the error would not pass this test.
      expect(json.runs[0].error).toContain('bench-blew-up');
    });

    it('pre-init failure of an app-default cell still buckets as "app-default" (WHAT 6.C)', async () => {
      // No axes in config; initContext rejects -> we must NOT emit a
      // 'req:'-prefixed fingerprint, because the cell would no longer
      // dedupe with its app-default peers.
      (modelStore.initContext as jest.Mock).mockRejectedValueOnce(
        new Error('init exploded'),
      );
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0].status).toBe('failed');
      expect(json.runs[0].settings_fingerprint).toBe('app-default');
    });

    it('GPU pre-check failure row uses req:-prefixed fingerprint when axes are set', async () => {
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['q8_0']}],
      };
      // No GPU option -> GPU pre-check fails fast.
      getDeviceOptions.mockResolvedValueOnce([
        {id: 'cpu', label: 'CPU', devices: ['CPU']},
      ]);
      await runMatrix(cfg, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0]).toMatchObject({
        status: 'failed',
        error: 'GPU device not available',
      });
      // Sweep axes are active; pre-init failure -> req: fingerprint.
      expect(json.runs[0].settings_fingerprint.startsWith('req:')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // expandAxes — pure helper unit tests (WHAT 2, 4c)
  // ---------------------------------------------------------------------------

  describe('expandAxes', () => {
    it('returns [{}] for absent axes (WHAT 2)', () => {
      expect(expandAxes(undefined)).toEqual([{}]);
    });

    it('returns [{}] for empty axes (defends against producers that emit [])', () => {
      expect(expandAxes([])).toEqual([{}]);
    });

    it('expands a single axis into one cell per value', () => {
      expect(
        expandAxes([{name: 'cache_type_k', values: ['f16', 'q8_0']}]),
      ).toEqual([{cache_type_k: 'f16'}, {cache_type_k: 'q8_0'}]);
    });

    it('expands two axes as the cartesian product, preserving axis order', () => {
      const result = expandAxes([
        {name: 'cache_type_k', values: ['f16', 'q8_0']},
        {name: 'flash_attn_type', values: ['auto', 'on']},
      ]);
      expect(result).toEqual([
        {cache_type_k: 'f16', flash_attn_type: 'auto'},
        {cache_type_k: 'f16', flash_attn_type: 'on'},
        {cache_type_k: 'q8_0', flash_attn_type: 'auto'},
        {cache_type_k: 'q8_0', flash_attn_type: 'on'},
      ]);
    });

    it('handles three axes with mixed value types', () => {
      const result = expandAxes([
        {name: 'cache_type_k', values: ['f16']},
        {name: 'no_extra_bufts', values: [true, false]},
        {name: 'n_threads', values: [4, 8]},
      ]);
      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({
        cache_type_k: 'f16',
        no_extra_bufts: true,
        n_threads: 4,
      });
      expect(result[3]).toEqual({
        cache_type_k: 'f16',
        no_extra_bufts: false,
        n_threads: 8,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Fingerprint helpers (WHAT 4d, 4h I2/I3, 9b, 9c)
  // ---------------------------------------------------------------------------

  describe('canonicaliseFingerprint', () => {
    it('renders missing keys as the "-" literal', () => {
      // iOS does not populate no_extra_bufts; it should land as '-'.
      const fp = canonicaliseFingerprint({
        cache_type_k: 'f16',
        cache_type_v: 'f16',
        flash_attn_type: 'auto',
        use_mmap: 'true',
        n_threads: 4,
      });
      expect(fp).toBe(
        'cache_type_k=f16;cache_type_v=f16;flash_attn_type=auto;no_extra_bufts=-;use_mmap=true;n_threads=4',
      );
    });

    it('coerces booleans to lowercase true/false', () => {
      const fp = canonicaliseFingerprint({no_extra_bufts: true});
      expect(fp).toContain('no_extra_bufts=true');
    });

    it('coerces numbers to decimal strings', () => {
      const fp = canonicaliseFingerprint({n_threads: 8});
      expect(fp).toContain('n_threads=8');
    });

    it('lowercases string values (consistent across casings)', () => {
      const fp = canonicaliseFingerprint({cache_type_k: 'F16'});
      expect(fp).toContain('cache_type_k=f16');
    });

    it('emits keys in fixed declaration order regardless of input order', () => {
      const fp = canonicaliseFingerprint({
        n_threads: 6,
        cache_type_k: 'f16',
      });
      // Cache type comes first, n_threads last.
      expect(fp.startsWith('cache_type_k=f16')).toBe(true);
      expect(fp.endsWith('n_threads=6')).toBe(true);
    });

    it('matches WHAT 4d example: cache_type_k=q8_0 sweep with rest at defaults', () => {
      // WHAT 4d second example, with the same defaults the post-init
      // snapshot would carry on a typical Android run.
      const fp = canonicaliseFingerprint({
        cache_type_k: 'q8_0',
        cache_type_v: 'f16',
        flash_attn_type: 'off',
        no_extra_bufts: false,
        use_mmap: 'false',
        n_threads: 6,
      });
      expect(fp).toBe(
        'cache_type_k=q8_0;cache_type_v=f16;flash_attn_type=off;no_extra_bufts=false;use_mmap=false;n_threads=6',
      );
    });
  });

  describe('buildSuccessFingerprint', () => {
    it('returns the literal "app-default" when hadAxes=false AND empty overrides (WHAT D7/I2)', () => {
      const fp = buildSuccessFingerprint(
        {cache_type_k: 'f16', n_threads: 4}, // post-init snapshot
        false, // hadAxesInConfig
        true, // isEmptyOverrides
      );
      expect(fp).toBe(APP_DEFAULT_FINGERPRINT);
    });

    it('returns the canonicalised string when hadAxes=true (even with empty overrides) — WHAT 9b boundary', () => {
      // The one-value-axis case (BENCH_CACHE_TYPE_K=q8_0 only) produces
      // hadAxes=true but the cell that lands on defaults still emits a
      // canonical fingerprint. The operator opted in to settings-aware
      // reporting, so the legacy `app-default` dedupe is OFF.
      const fp = buildSuccessFingerprint(
        {cache_type_k: 'f16', n_threads: 4},
        true, // hadAxesInConfig
        true, // isEmptyOverrides — but axes exist
      );
      expect(fp).not.toBe(APP_DEFAULT_FINGERPRINT);
      expect(fp).toContain('cache_type_k=f16');
    });

    it('returns the canonicalised string when overrides are non-empty', () => {
      const fp = buildSuccessFingerprint(
        {cache_type_k: 'q8_0', cache_type_v: 'f16', n_threads: 4},
        true,
        false,
      );
      expect(fp).not.toBe(APP_DEFAULT_FINGERPRINT);
      expect(fp).toContain('cache_type_k=q8_0');
    });
  });

  describe('buildFailureFingerprint', () => {
    it('returns "app-default" when hadAxes=false AND empty overrides (failed app-default cell)', () => {
      // WHAT 6.C — failed cell on a no-axes config still buckets with
      // its successful peers as `app-default`. No `req:` prefix.
      const fp = buildFailureFingerprint(
        {cache_type_k: 'f16', n_threads: 6},
        {},
        false,
      );
      expect(fp).toBe(APP_DEFAULT_FINGERPRINT);
    });

    it('prefixes "req:" + canonicalised(merged snapshot+overrides) on the pre-init failure path (WHAT 9c, I3)', () => {
      // WHAT 4d fourth example: failure path, pre-init snapshot has
      // {cache_type_k:'f16',cache_type_v:'f16',flash_attn_type:'off',
      //  no_extra_bufts:false,use_mmap:'smart',n_threads:6},
      // requested overrides {cache_type_k:'q8_0'} — overlay produces a
      // record whose canonicalised form is the WHAT example, prefixed
      // 'req:'.
      const fp = buildFailureFingerprint(
        {
          cache_type_k: 'f16',
          cache_type_v: 'f16',
          flash_attn_type: 'off',
          no_extra_bufts: false,
          use_mmap: 'smart',
          n_threads: 6,
        },
        {cache_type_k: 'q8_0'},
        true,
      );
      expect(fp).toBe(
        'req:cache_type_k=q8_0;cache_type_v=f16;flash_attn_type=off;no_extra_bufts=false;use_mmap=smart;n_threads=6',
      );
    });

    it('still prefixes "req:" when hadAxes=true and overrides are empty (WHAT 9b boundary)', () => {
      const fp = buildFailureFingerprint(
        {cache_type_k: 'f16', n_threads: 4},
        {},
        true,
      );
      expect(fp.startsWith('req:')).toBe(true);
    });

    it('preserves operator intent: use_mmap="smart" stays string-valued in the fingerprint', () => {
      // WHAT 4d explicit: the fingerprint snapshots from
      // `modelStore.contextInitParams` directly, NOT from
      // `getEffectiveContextInitParams` which resolves smart-mmap to a
      // boolean. Two cells where one was set to use_mmap='smart' and
      // the other to use_mmap='true' MUST produce different fingerprints
      // even when resolveUseMmap('smart',filePath) returns true.
      const fpSmart = canonicaliseFingerprint({use_mmap: 'smart'});
      const fpTrue = canonicaliseFingerprint({use_mmap: 'true'});
      expect(fpSmart).not.toEqual(fpTrue);
      expect(fpSmart).toContain('use_mmap=smart');
      expect(fpTrue).toContain('use_mmap=true');
    });
  });

  // ---------------------------------------------------------------------------
  // Mock-store sanity (gap-fill — direct check that the centralised mock
  // exposes the setters the runner depends on as jest.fn()s. This guards
  // against silent regressions if `__mocks__/stores/modelStore.ts` is
  // regenerated without the v1.1 sweep setters; without it, the only
  // signal is failures in the apply-order tests above, which would point
  // at the runner instead of the mock.)
  // ---------------------------------------------------------------------------

  describe('mock modelStore sanity (sweep setters wired)', () => {
    it.each([
      ['setCacheTypeK'],
      ['setCacheTypeV'],
      ['setFlashAttnType'],
      ['setNoExtraBufts'],
      ['setUseMmap'],
      ['setNThreads'],
    ] as const)('exposes %s as a callable jest.fn()', name => {
      const setter = (modelStore as any)[name];
      expect(setter).toBeDefined();
      // jest.fn() instances expose a .mock object — that is the sanity
      // signal here (not jest.isMockFunction, which the mock module loads
      // from its own jest context).
      expect(setter).toEqual(expect.any(Function));
      expect(setter.mock).toBeDefined();
      // Calling the setter is a no-op in the mock; the assertion is that
      // it does not throw and a subsequent inspection sees the call.
      setter('arbitrary-test-value');
      expect(setter).toHaveBeenCalledWith('arbitrary-test-value');
    });
  });
});
