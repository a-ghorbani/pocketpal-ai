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
  });
});
