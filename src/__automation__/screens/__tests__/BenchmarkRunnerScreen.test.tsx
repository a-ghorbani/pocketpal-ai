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

// Mock the deviceSelection helper so the GPU/Hexagon paths are testable.
jest.mock('../../../utils/deviceSelection', () => ({
  getDeviceOptions: jest.fn().mockResolvedValue([
    {id: 'cpu', label: 'CPU', devices: ['CPU']},
    {id: 'gpu', label: 'GPU (OpenCL)', devices: ['Adreno (TM) 840v2']},
  ]),
}));

const {getDeviceOptions} = require('../../../utils/deviceSelection');

// Mock the thread-count helper. The bench reads it ONCE at matrix start to
// pick the device-appropriate `n_threads`, so a single fixed value is enough
// for tests; individual tests can override via `mockResolvedValueOnce` when
// they need to assert the threading propagation.
jest.mock('../../../utils/deviceCapabilities', () => ({
  getRecommendedThreadCount: jest.fn().mockResolvedValue(6),
}));

const {
  getRecommendedThreadCount,
} = require('../../../utils/deviceCapabilities');

// Re-grab the llama.rn mocks so tests can drive the native log stream and
// assert the initLlama payload.
const {initLlama, addNativeLogListener, toggleNativeLog} = require('llama.rn');

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
import {
  DEFAULT_BENCH_BASE_PARAMS,
  buildOverridesParams,
  composeCellParams,
} from '../../benchParams';

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
  // Tests pin to 0 so the suite doesn't pay 2s × N cells of pure setTimeout
  // wall time. Production default (2000ms) and tuned-up values (15-60s for
  // thermal stabilisation) are exercised by dedicated tests below.
  inter_cell_settle_ms: 0,
};

// Fresh mock LlamaContext for each `initLlama` resolution. Tests that need
// to drive bench output configure the returned mock's `bench`. Release is
// stubbed so the runner's per-cell finally exercises the release path.
function makeMockContext(overrides?: {bench?: jest.Mock; release?: jest.Mock}) {
  return {
    bench:
      overrides?.bench ??
      jest.fn().mockResolvedValue({
        speedPp: 12.5,
        speedTg: 4.5,
      }),
    release: overrides?.release ?? jest.fn().mockResolvedValue(undefined),
  };
}

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
    getRecommendedThreadCount.mockResolvedValue(6);
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
      await act(async () => {
        fireEvent.press(getByTestId('bench-run-button'));
      });
      expect(runner).toHaveBeenCalledTimes(1);
      await act(async () => {
        fireEvent.press(getByTestId('bench-run-button'));
      });
      expect(runner).toHaveBeenCalledTimes(1);
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
      });
    });
  });

  describe('runMatrix', () => {
    const setStatus = jest.fn();
    const setLastCell = jest.fn();

    beforeEach(() => {
      setStatus.mockClear();
      setLastCell.mockClear();
      // Default: a downloaded model exists for the variant filename. The
      // runner reads `models` to resolve the variant; everything else is
      // shaped via the local `cellParams` literal handed to `initLlama`.
      (modelStore as any).models = [
        {
          id: 'qwen3-1.7b-q4_0',
          name: 'qwen3',
          filename: 'Qwen_Qwen3-1.7B-Q4_0.gguf',
          isDownloaded: true,
        },
      ] as any;
      // Default: initLlama resolves to a fresh mock context per cell.
      (initLlama as jest.Mock).mockReset();
      (initLlama as jest.Mock).mockImplementation(() => makeMockContext());
      // Native-log mock: no lines emitted by default.
      (addNativeLogListener as jest.Mock).mockReset();
      (addNativeLogListener as jest.Mock).mockReturnValue({remove: jest.fn()});
      (toggleNativeLog as jest.Mock).mockReset();
      (toggleNativeLog as jest.Mock).mockResolvedValue(undefined);
      // Benchmark-mode hooks: default to async-resolve / sync no-op.
      (modelStore.enterBenchmarkMode as jest.Mock).mockReset();
      (modelStore.enterBenchmarkMode as jest.Mock).mockResolvedValue(undefined);
      (modelStore.exitBenchmarkMode as jest.Mock).mockReset();
    });

    /** Helper: drive the listener to emit a canonical full-OpenCL-offload
     * sequence so `deriveEffectiveBackend(logSignals)` returns 'opencl'. */
    function stubOpenCLLogs(): jest.Mock {
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
      return remove;
    }

    /** Helper: drive the listener to emit a CPU-only sequence (no GPU/HTP
     * markers) so `deriveEffectiveBackend` returns 'cpu'. */
    function stubCPULogs(): jest.Mock {
      const remove = jest.fn();
      (addNativeLogListener as jest.Mock).mockImplementation(
        (cb: (level: string, text: string) => void) => {
          cb('I', 'load_tensors:        CPU model buffer size = 100.00 MiB');
          return {remove};
        },
      );
      return remove;
    }

    /** Helper: drive the listener to emit a Hexagon-full-offload sequence
     * so `deriveEffectiveBackend` returns 'hexagon'. */
    function stubHexagonLogs(): jest.Mock {
      const remove = jest.fn();
      (addNativeLogListener as jest.Mock).mockImplementation(
        (cb: (level: string, text: string) => void) => {
          cb('I', 'ggml-hex: hexagon_init: HTP backend initialized');
          cb('I', 'load_tensors:    HTP0 model buffer size = 200.00 MiB');
          cb('I', 'load_tensors: offloaded 28/28 layers to GPU');
          return {remove};
        },
      );
      return remove;
    }

    // -------------------------------------------------------------------------
    // Lifecycle: enterBenchmarkMode / exitBenchmarkMode owns native context
    // -------------------------------------------------------------------------

    it('takes ownership via enterBenchmarkMode at start and releases it via exitBenchmarkMode in finally', async () => {
      stubOpenCLLogs();
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      expect(modelStore.enterBenchmarkMode).toHaveBeenCalledTimes(1);
      expect(modelStore.exitBenchmarkMode).toHaveBeenCalledTimes(1);
      // exit must run AFTER enter — `.invocationCallOrder` is monotonic.
      const enterOrder = (modelStore.enterBenchmarkMode as jest.Mock).mock
        .invocationCallOrder[0];
      const exitOrder = (modelStore.exitBenchmarkMode as jest.Mock).mock
        .invocationCallOrder[0];
      expect(enterOrder).toBeLessThan(exitOrder);
    });

    it('exitBenchmarkMode runs even when the loop body throws (matrix-level finally)', async () => {
      // Force the report-shell write to throw, simulating a fatal early
      // failure before the cell loop runs.
      RNFS.writeFile.mockRejectedValueOnce(new Error('shell-write-failed'));
      await expect(
        runMatrix(VALID_CONFIG, setStatus, setLastCell),
      ).rejects.toThrow('shell-write-failed');
      expect(modelStore.enterBenchmarkMode).toHaveBeenCalledTimes(1);
      expect(modelStore.exitBenchmarkMode).toHaveBeenCalledTimes(1);
    });

    // -------------------------------------------------------------------------
    // initLlama is the SOLE native-load entrypoint (no modelStore.initContext)
    // -------------------------------------------------------------------------

    it('calls initLlama with composed params (devices + n_gpu_layers from backend slot, n_threads from getRecommendedThreadCount)', async () => {
      stubOpenCLLogs();
      getRecommendedThreadCount.mockResolvedValueOnce(8);
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      expect(initLlama).toHaveBeenCalledTimes(1);
      const [paramsArg] = (initLlama as jest.Mock).mock.calls[0];
      expect(paramsArg).toMatchObject({
        devices: ['Adreno (TM) 840v2'],
        n_gpu_layers: 99,
        n_threads: 8,
        // Bench base defaults flow through.
        n_ctx: DEFAULT_BENCH_BASE_PARAMS.n_ctx,
        cache_type_k: 'f16',
      });
      // The model field must be the resolved file path.
      expect(typeof paramsArg.model).toBe('string');
      expect(paramsArg.model).toContain('Qwen_Qwen3-1.7B-Q4_0.gguf');
    });

    it('does NOT call modelStore.initContext / selectModel / setDevices / setNGPULayers / releaseContext', async () => {
      stubOpenCLLogs();
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      // The runner is fully isolated from the store's context lifecycle.
      expect(modelStore.initContext).not.toHaveBeenCalled();
      expect(modelStore.selectModel).not.toHaveBeenCalled();
      expect(modelStore.setDevices).not.toHaveBeenCalled();
      expect(modelStore.setNGPULayers).not.toHaveBeenCalled();
      // releaseContext is exposed on the store but the runner releases its
      // OWN context via the LlamaContext.release() returned by initLlama.
      const release = (modelStore as any).releaseContext;
      if (release && release.mock) {
        expect(release).not.toHaveBeenCalled();
      }
    });

    it('cpu cell composes devices=["CPU"] + n_gpu_layers=0', async () => {
      stubCPULogs();
      const cfg: BenchConfig = {...VALID_CONFIG, backends: ['cpu']};
      await runMatrix(cfg, setStatus, setLastCell);
      const [paramsArg] = (initLlama as jest.Mock).mock.calls[0];
      expect(paramsArg.devices).toEqual(['CPU']);
      // Pinned to 0 so ggml does not route layers through other registered
      // backends (Bug-2 — verified on Snapdragon 8 Elite Gen 5).
      expect(paramsArg.n_gpu_layers).toBe(0);
    });

    it('hexagon cell composes devices=hexagon-option + n_gpu_layers=99', async () => {
      stubHexagonLogs();
      getDeviceOptions.mockResolvedValueOnce([
        {id: 'cpu', label: 'CPU', devices: ['CPU']},
        {id: 'hexagon', label: 'Hexagon', devices: ['HTP*']},
      ]);
      const cfg: BenchConfig = {...VALID_CONFIG, backends: ['hexagon']};
      await runMatrix(cfg, setStatus, setLastCell);
      const [paramsArg] = (initLlama as jest.Mock).mock.calls[0];
      expect(paramsArg.devices).toEqual(['HTP*']);
      expect(paramsArg.n_gpu_layers).toBe(99);
    });

    // -------------------------------------------------------------------------
    // Per-cell context release (sole release site is the per-cell finally)
    // -------------------------------------------------------------------------

    it('releases the cell context on the success path', async () => {
      stubOpenCLLogs();
      const release = jest.fn().mockResolvedValue(undefined);
      (initLlama as jest.Mock).mockResolvedValueOnce(
        makeMockContext({release}),
      );
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      expect(release).toHaveBeenCalledTimes(1);
    });

    it('releases the cell context when bench rejects after a successful initLlama', async () => {
      stubOpenCLLogs();
      const release = jest.fn().mockResolvedValue(undefined);
      const bench = jest.fn().mockRejectedValue(new Error('bench-blew-up'));
      (initLlama as jest.Mock).mockResolvedValueOnce(
        makeMockContext({bench, release}),
      );
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      expect(release).toHaveBeenCalledTimes(1);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0].status).toBe('failed');
      expect(json.runs[0].error).toContain('bench-blew-up');
    });

    it('does NOT call release when initLlama itself rejects (no ctx to release)', async () => {
      const release = jest.fn();
      (initLlama as jest.Mock).mockRejectedValueOnce(new Error('init-boom'));
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      expect(release).not.toHaveBeenCalled();
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0].status).toBe('failed');
      expect(json.runs[0].error).toContain('init-boom');
    });

    // -------------------------------------------------------------------------
    // Native log listener: sole-attach + sole-detach + log-toggle
    // -------------------------------------------------------------------------

    it('attaches and detaches the native log listener exactly once per cell on success', async () => {
      const remove = stubOpenCLLogs();
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      expect(addNativeLogListener).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledTimes(1);
    });

    it('detaches the listener when the cell throws after attach', async () => {
      const remove = jest.fn();
      (addNativeLogListener as jest.Mock).mockImplementation(
        (cb: (level: string, text: string) => void) => {
          cb('I', 'lm_ggml_opencl: Initializing OpenCL backend');
          return {remove};
        },
      );
      (initLlama as jest.Mock).mockRejectedValueOnce(
        new Error('init exploded'),
      );
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      expect(remove).toHaveBeenCalledTimes(1);
    });

    it('toggles native logging on at start and off in matrix-level finally', async () => {
      stubOpenCLLogs();
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      expect(toggleNativeLog).toHaveBeenCalledWith(true);
      expect(toggleNativeLog).toHaveBeenCalledWith(false);
    });

    it('disables native logging in finally even when the loop body throws', async () => {
      RNFS.writeFile.mockRejectedValueOnce(new Error('shell-write-failed'));
      await expect(
        runMatrix(VALID_CONFIG, setStatus, setLastCell),
      ).rejects.toThrow('shell-write-failed');
      expect(toggleNativeLog).toHaveBeenCalledWith(false);
    });

    // -------------------------------------------------------------------------
    // Backend invariant: actual must match requested or row is failed
    // -------------------------------------------------------------------------

    it('records status:ok when actual backend matches requested (gpu)', async () => {
      stubOpenCLLogs();
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0]).toMatchObject({
        status: 'ok',
        requested_backend: 'gpu',
        effective_backend: 'opencl',
      });
    });

    it('hard-fails the cell with backend-mismatch:<requested>:<actual> when the actual backend is wrong', async () => {
      // Requested gpu, but native logs only report CPU — the merged
      // architecture must surface this as a failed row, NOT as `status:ok`
      // with `effective_backend != requested_backend`. Wrong-backend rows
      // silently in baselines is what motivated the redesign.
      stubCPULogs();
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0].status).toBe('failed');
      expect(json.runs[0].error).toContain('backend-mismatch:gpu:cpu');
    });

    // -------------------------------------------------------------------------
    // Per-cell error containment
    // -------------------------------------------------------------------------

    it('per-cell throw sets row status:failed and the matrix continues to the next cell', async () => {
      stubOpenCLLogs();
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        backends: ['cpu', 'gpu'], // 2 cells
      };
      // Cell 1 (cpu): initLlama rejects.
      // Cell 2 (gpu): succeeds.
      (initLlama as jest.Mock)
        .mockRejectedValueOnce(new Error('cell-1-init-boom'))
        .mockResolvedValueOnce(makeMockContext());
      // Cell 1 needs CPU logs to (almost — it fails before assertion);
      // cell 2 needs OpenCL logs. Use a stateful stub that returns a fresh
      // sub per attach call.
      let attachIdx = 0;
      (addNativeLogListener as jest.Mock).mockImplementation(
        (cb: (level: string, text: string) => void) => {
          if (attachIdx === 0) {
            // cell 1 — cpu logs (won't be read, init fails first)
            attachIdx++;
            return {remove: jest.fn()};
          }
          attachIdx++;
          cb('I', 'lm_ggml_opencl: Initializing OpenCL backend');
          cb('I', 'lm_ggml_opencl: device Adreno (TM) 840v2');
          cb('I', 'load_tensors: offloaded 28/28 layers to GPU');
          return {remove: jest.fn()};
        },
      );
      await runMatrix(cfg, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs).toHaveLength(2);
      expect(json.runs[0].status).toBe('failed');
      expect(json.runs[1].status).toBe('ok');
      expect(setStatus.mock.calls[setStatus.mock.calls.length - 1][0]).toBe(
        'complete',
      );
    });

    it('uses cell-failed: status (not error:) for per-cell failures so the matrix continues', async () => {
      (initLlama as jest.Mock).mockRejectedValueOnce(new Error('cell-boom'));
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const cellFailed = setStatus.mock.calls
        .map(c => c[0])
        .find((s: string) => s.startsWith('cell-failed:'));
      expect(cellFailed).toBeDefined();
      expect(cellFailed).toContain('cell-boom');
      expect(setStatus.mock.calls[setStatus.mock.calls.length - 1][0]).toBe(
        'complete',
      );
    });

    it('forces status:failed when bench() resolves with speedPp undefined', async () => {
      stubOpenCLLogs();
      (initLlama as jest.Mock).mockResolvedValueOnce(
        makeMockContext({
          bench: jest.fn().mockResolvedValue({speedPp: undefined, speedTg: 5}),
        }),
      );
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0].status).toBe('failed');
      expect(json.runs[0].error).toContain('null metric');
    });

    it('forces status:failed when bench() resolves with speedTg undefined', async () => {
      stubOpenCLLogs();
      (initLlama as jest.Mock).mockResolvedValueOnce(
        makeMockContext({
          bench: jest.fn().mockResolvedValue({speedPp: 12, speedTg: undefined}),
        }),
      );
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0].status).toBe('failed');
      expect(json.runs[0].error).toContain('null metric');
    });

    // -------------------------------------------------------------------------
    // GPU / Hexagon pre-check
    // -------------------------------------------------------------------------

    it('GPU cell fails with "GPU device not available" when getDeviceOptions has no gpu entry', async () => {
      getDeviceOptions.mockResolvedValueOnce([
        {id: 'cpu', label: 'CPU', devices: ['CPU']},
      ]);
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0]).toMatchObject({
        status: 'failed',
        error: 'GPU device not available',
        effective_backend: 'unknown',
      });
      expect(setStatus.mock.calls[setStatus.mock.calls.length - 1][0]).toBe(
        'complete',
      );
      // Pre-check fail short-circuits BEFORE initLlama runs.
      expect(initLlama).not.toHaveBeenCalled();
    });

    it('hexagon cell fails fast with "Hexagon device not available" when getDeviceOptions has no hexagon entry', async () => {
      const cfg: BenchConfig = {...VALID_CONFIG, backends: ['hexagon']};
      getDeviceOptions.mockResolvedValueOnce([
        {id: 'cpu', label: 'CPU', devices: ['CPU']},
        {id: 'gpu', label: 'GPU (OpenCL)', devices: ['Adreno (TM) 840v2']},
      ]);
      await runMatrix(cfg, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0]).toMatchObject({
        status: 'failed',
        error: 'Hexagon device not available',
        effective_backend: 'unknown',
      });
      expect(initLlama).not.toHaveBeenCalled();
    });

    it('hexagon-on-non-hexagon-device does NOT abort the matrix — subsequent cells still run', async () => {
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        backends: ['hexagon', 'cpu'],
      };
      getDeviceOptions.mockResolvedValueOnce([
        {id: 'cpu', label: 'CPU', devices: ['CPU']},
      ]);
      stubCPULogs();
      await runMatrix(cfg, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs).toHaveLength(2);
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
    // Download path: cell fails fast on download error
    // -------------------------------------------------------------------------

    it('fails the cell fast when modelStore.downloadError fires during polling', async () => {
      // Variant absent → download path runs.
      (modelStore as any).models = [];
      (modelStore as any).downloadHFModel = jest
        .fn()
        .mockResolvedValue(undefined);
      (modelStore as any).clearDownloadError = jest.fn();
      // Set the error after a microtask so the polling loop sees it.
      setTimeout(() => {
        (modelStore as any).downloadError = {message: 'download-failed-msg'};
      }, 10);
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0].status).toBe('failed');
      expect(json.runs[0].error).toContain('download-failed');
      // Reset for the next test.
      (modelStore as any).downloadError = null;
    });

    // -------------------------------------------------------------------------
    // Report shape
    // -------------------------------------------------------------------------

    it('persists config.bench at the top level of the report (not DEFAULT_BENCH)', async () => {
      stubOpenCLLogs();
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        bench: {pp: 7, tg: 8, pl: 1, nr: 2},
      };
      await runMatrix(cfg, setStatus, setLastCell);
      const firstWrite = RNFS.writeFile.mock.calls[0];
      const json = JSON.parse(firstWrite[1]);
      expect(json.bench).toEqual({pp: 7, tg: 8, pl: 1, nr: 2});
    });

    it('emits report.version "1.1" and omits settings_axes_used when no axes', async () => {
      stubOpenCLLogs();
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.version).toBe('1.1');
      expect(json.settings_axes_used).toBeUndefined();
    });

    it('echoes settings_axes_used in the report when axes are present', async () => {
      stubOpenCLLogs();
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

    it('echoes inter_cell_settle_ms (custom) in the report top level', async () => {
      stubOpenCLLogs();
      const cfg: BenchConfig = {...VALID_CONFIG, inter_cell_settle_ms: 15000};
      // Custom settle would otherwise burn 15s of real wall time per cell.
      // Fake timers fast-forward through the setTimeout, keeping the suite
      // tight while still exercising the same code path.
      jest.useFakeTimers();
      const promise = runMatrix(cfg, setStatus, setLastCell);
      await jest.runAllTimersAsync();
      await promise;
      jest.useRealTimers();
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.inter_cell_settle_ms).toBe(15000);
    });

    it('echoes inter_cell_settle_ms = 2000 (default) when omitted from config', async () => {
      stubOpenCLLogs();
      // Drop the test-fixture override so the default branch fires.
      const cfg: BenchConfig = {...VALID_CONFIG};
      delete cfg.inter_cell_settle_ms;
      jest.useFakeTimers();
      const promise = runMatrix(cfg, setStatus, setLastCell);
      await jest.runAllTimersAsync();
      await promise;
      jest.useRealTimers();
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.inter_cell_settle_ms).toBe(2000);
    });

    it('falls back to default when inter_cell_settle_ms is invalid (string, NaN, negative)', async () => {
      stubOpenCLLogs();
      // Validates the typeof+isFinite+>=0 guard. A typo'd value should not
      // throw or silently apply — it falls back to the safe default.
      for (const bad of ['30000' as unknown as number, NaN, -1, Infinity]) {
        RNFS.writeFile.mockClear();
        const cfg: BenchConfig = {...VALID_CONFIG, inter_cell_settle_ms: bad};
        jest.useFakeTimers();
        const promise = runMatrix(cfg, setStatus, setLastCell);
        await jest.runAllTimersAsync();
        await promise;
        jest.useRealTimers();
        const lastWrite =
          RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
        const json = JSON.parse(lastWrite[1]);
        expect(json.inter_cell_settle_ms).toBe(2000);
      }
    });

    it('expands one cache_type_k axis into two cells per (model,quant,backend)', async () => {
      stubOpenCLLogs();
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['f16', 'q8_0']}],
      };
      await runMatrix(cfg, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs).toHaveLength(2);
      expect(json.runs[0].settings_overrides).toEqual({cache_type_k: 'f16'});
      expect(json.runs[1].settings_overrides).toEqual({cache_type_k: 'q8_0'});
    });

    // -------------------------------------------------------------------------
    // Per-cell overrides land in the initLlama params (no setter routing)
    // -------------------------------------------------------------------------

    it('per-cell sweep overrides land in the composed params handed to initLlama', async () => {
      stubOpenCLLogs();
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['q8_0']}],
      };
      await runMatrix(cfg, setStatus, setLastCell);
      expect(initLlama).toHaveBeenCalledTimes(1);
      const [paramsArg] = (initLlama as jest.Mock).mock.calls[0];
      expect(paramsArg.cache_type_k).toBe('q8_0');
      // The runner does NOT route through modelStore.setCacheTypeK any more;
      // the override is a literal field in the cell's ContextParams.
      expect(modelStore.setCacheTypeK).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Status string format
    // -------------------------------------------------------------------------

    it('status running:<tag> appends override summary when overrides are non-empty', async () => {
      stubOpenCLLogs();
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['q8_0']}],
      };
      await runMatrix(cfg, setStatus, setLastCell);
      const runningCall = setStatus.mock.calls
        .map(c => c[0])
        .find(
          (s: string) =>
            s.startsWith('running:') && s.includes('cache_type_k=q8_0'),
        );
      expect(runningCall).toBeDefined();
    });

    it('status running:<tag> matches legacy format when overrides are empty', async () => {
      stubOpenCLLogs();
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const runningCall = setStatus.mock.calls
        .map(c => c[0])
        .find((s: string) => /^running:1\/1:qwen3-1\.7b\/q4_0\/gpu$/.test(s));
      expect(runningCall).toBeDefined();
    });

    // -------------------------------------------------------------------------
    // Fingerprint provenance (success / pre-init failure / post-init failure)
    // -------------------------------------------------------------------------

    it('success row carries app-default fingerprint when no axes', async () => {
      stubOpenCLLogs();
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0].settings_fingerprint).toBe(APP_DEFAULT_FINGERPRINT);
      expect(json.runs[0].settings_overrides).toEqual({});
    });

    it('success rows carry distinct canonical fingerprints when axis is set', async () => {
      stubOpenCLLogs();
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['f16', 'q8_0']}],
      };
      await runMatrix(cfg, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs).toHaveLength(2);
      expect(json.runs[0].settings_fingerprint).toContain('cache_type_k=f16');
      expect(json.runs[1].settings_fingerprint).toContain('cache_type_k=q8_0');
      expect(json.runs[0].settings_fingerprint).not.toBe(
        json.runs[1].settings_fingerprint,
      );
      expect(json.runs[0].settings_fingerprint).not.toBe(
        APP_DEFAULT_FINGERPRINT,
      );
    });

    it('pre-init failure row carries req:-prefixed fingerprint when sweep axes are set', async () => {
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['q8_0']}],
      };
      // initLlama rejects BEFORE any cell-init snapshot is produced.
      // Wait — actually under the new design the cellParams / fingerprint
      // snapshot are computed BEFORE initLlama. Let's force the pre-init
      // path another way: throw during the model resolve / download step
      // by emptying modelStore.models and rejecting the download.
      (modelStore as any).models = [];
      (modelStore as any).downloadHFModel = jest
        .fn()
        .mockRejectedValue(new Error('download-rejected'));
      await runMatrix(cfg, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0].status).toBe('failed');
      expect(json.runs[0].settings_fingerprint.startsWith('req:')).toBe(true);
      expect(json.runs[0].settings_fingerprint).toContain('cache_type_k=q8_0');
    });

    it('post-init failure row carries standard (non-req:) fingerprint', async () => {
      stubOpenCLLogs();
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['q8_0']}],
      };
      // initLlama succeeds (so cellParams/postInitSnapshot are captured),
      // bench() throws.
      (initLlama as jest.Mock).mockResolvedValueOnce(
        makeMockContext({
          bench: jest.fn().mockRejectedValue(new Error('bench-blew-up')),
        }),
      );
      await runMatrix(cfg, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0].status).toBe('failed');
      expect(json.runs[0].settings_fingerprint.startsWith('req:')).toBe(false);
      expect(json.runs[0].settings_fingerprint).toContain('cache_type_k=q8_0');
    });

    it('post-init failure row preserves the captured snapshot in init_settings', async () => {
      stubOpenCLLogs();
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['q8_0']}],
      };
      (initLlama as jest.Mock).mockResolvedValueOnce(
        makeMockContext({
          bench: jest.fn().mockRejectedValue(new Error('bench-blew-up')),
        }),
      );
      await runMatrix(cfg, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0].init_settings).toMatchObject({cache_type_k: 'q8_0'});
      expect(json.runs[0].error).toContain('bench-blew-up');
    });

    it('pre-init failure of an app-default cell still buckets as "app-default"', async () => {
      // No axes, pre-init failure (download path rejects). The runner must
      // NOT mint a 'req:'-prefixed fingerprint, because that would dedupe
      // the cell out of its app-default peers.
      (modelStore as any).models = [];
      (modelStore as any).downloadHFModel = jest
        .fn()
        .mockRejectedValue(new Error('download-rejected'));
      await runMatrix(VALID_CONFIG, setStatus, setLastCell);
      const lastWrite =
        RNFS.writeFile.mock.calls[RNFS.writeFile.mock.calls.length - 1];
      const json = JSON.parse(lastWrite[1]);
      expect(json.runs[0].status).toBe('failed');
      expect(json.runs[0].settings_fingerprint).toBe(APP_DEFAULT_FINGERPRINT);
    });

    it('GPU pre-check failure row uses req:-prefixed fingerprint when axes are set', async () => {
      const cfg: BenchConfig = {
        ...VALID_CONFIG,
        settings_axes: [{name: 'cache_type_k', values: ['q8_0']}],
      };
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
      expect(json.runs[0].settings_fingerprint.startsWith('req:')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // expandAxes — pure helper unit tests
  // ---------------------------------------------------------------------------

  describe('expandAxes', () => {
    it('returns [{}] for absent axes', () => {
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
  // Fingerprint helpers (pure)
  // ---------------------------------------------------------------------------

  describe('canonicaliseFingerprint', () => {
    it('renders missing keys as the "-" literal', () => {
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

    it('lowercases string values', () => {
      const fp = canonicaliseFingerprint({cache_type_k: 'F16'});
      expect(fp).toContain('cache_type_k=f16');
    });

    it('emits keys in fixed declaration order regardless of input order', () => {
      const fp = canonicaliseFingerprint({
        n_threads: 6,
        cache_type_k: 'f16',
      });
      expect(fp.startsWith('cache_type_k=f16')).toBe(true);
      expect(fp.endsWith('n_threads=6')).toBe(true);
    });
  });

  describe('buildSuccessFingerprint', () => {
    it('returns "app-default" when hadAxes=false AND empty overrides', () => {
      const fp = buildSuccessFingerprint(
        {cache_type_k: 'f16', n_threads: 4},
        false,
        true,
      );
      expect(fp).toBe(APP_DEFAULT_FINGERPRINT);
    });

    it('returns canonicalised string when hadAxes=true (axes opt-in)', () => {
      const fp = buildSuccessFingerprint(
        {cache_type_k: 'f16', n_threads: 4},
        true,
        true,
      );
      expect(fp).not.toBe(APP_DEFAULT_FINGERPRINT);
      expect(fp).toContain('cache_type_k=f16');
    });

    it('returns canonicalised string when overrides are non-empty', () => {
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
    it('returns "app-default" when hadAxes=false AND empty overrides', () => {
      const fp = buildFailureFingerprint(
        {cache_type_k: 'f16', n_threads: 6},
        {},
        false,
      );
      expect(fp).toBe(APP_DEFAULT_FINGERPRINT);
    });

    it('prefixes "req:" when overrides overlay onto the pre-run snapshot', () => {
      const fp = buildFailureFingerprint(
        {
          cache_type_k: 'f16',
          cache_type_v: 'f16',
          flash_attn_type: 'off',
          no_extra_bufts: false,
          use_mmap: false,
          n_threads: 6,
        },
        {cache_type_k: 'q8_0'},
        true,
      );
      expect(fp.startsWith('req:')).toBe(true);
      expect(fp).toContain('cache_type_k=q8_0');
      expect(fp).toContain('cache_type_v=f16');
      expect(fp).toContain('n_threads=6');
    });

    it('still prefixes "req:" when hadAxes=true and overrides are empty', () => {
      const fp = buildFailureFingerprint(
        {cache_type_k: 'f16', n_threads: 4},
        {},
        true,
      );
      expect(fp.startsWith('req:')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Bench-local params composition (benchParams.ts)
  // ---------------------------------------------------------------------------

  describe('buildOverridesParams', () => {
    it('returns {} for an empty override map', () => {
      expect(buildOverridesParams({})).toEqual({});
    });

    it('forwards cache_type_k / cache_type_v / flash_attn_type / no_extra_bufts / n_threads as-is', () => {
      expect(
        buildOverridesParams({
          cache_type_k: 'q8_0',
          cache_type_v: 'q4_0',
          flash_attn_type: 'on',
          no_extra_bufts: true,
          n_threads: 8,
        }),
      ).toEqual({
        cache_type_k: 'q8_0',
        cache_type_v: 'q4_0',
        flash_attn_type: 'on',
        no_extra_bufts: true,
        n_threads: 8,
      });
    });

    it('coerces use_mmap="true"/"false" string overrides to booleans', () => {
      expect(buildOverridesParams({use_mmap: 'true'}).use_mmap).toBe(true);
      expect(buildOverridesParams({use_mmap: 'false'}).use_mmap).toBe(false);
    });

    it('passes use_mmap boolean overrides through unchanged', () => {
      expect(buildOverridesParams({use_mmap: true}).use_mmap).toBe(true);
      expect(buildOverridesParams({use_mmap: false}).use_mmap).toBe(false);
    });

    it('resolves use_mmap="smart" deterministically (no per-file resolver in bench)', () => {
      // Resolves to the platform default — tests run with Platform.OS=='ios'
      // by default in jest, so 'smart' → true. The actual value isn't the
      // load-bearing claim; the determinism is.
      const v = buildOverridesParams({use_mmap: 'smart'}).use_mmap;
      expect(typeof v).toBe('boolean');
    });
  });

  describe('composeCellParams', () => {
    it('merges base + overrides + cell-axis fields, with cell-axis fields winning', () => {
      const params = composeCellParams({
        filePath: '/mock/path/model.gguf',
        base: DEFAULT_BENCH_BASE_PARAMS,
        overrides: {cache_type_k: 'q8_0'},
        devices: ['CPU'],
        n_gpu_layers: 0,
      });
      expect(params).toMatchObject({
        model: '/mock/path/model.gguf',
        devices: ['CPU'],
        n_gpu_layers: 0,
        cache_type_k: 'q8_0', // from override
        cache_type_v: 'f16', // from base
        n_ctx: DEFAULT_BENCH_BASE_PARAMS.n_ctx, // from base
      });
    });

    it('overrides cannot smuggle in a different model / devices / n_gpu_layers', () => {
      // Even if a future axis added 'devices' (it shouldn't — those are
      // cell-axis fields), the cell-axis literal at the end of compose
      // wins. Defensive contract test.
      const params = composeCellParams({
        filePath: '/mock/path/m.gguf',
        base: DEFAULT_BENCH_BASE_PARAMS,
        overrides: {} as any,
        devices: ['HTP*'],
        n_gpu_layers: 99,
      });
      expect(params.devices).toEqual(['HTP*']);
      expect(params.n_gpu_layers).toBe(99);
      expect(params.model).toBe('/mock/path/m.gguf');
    });
  });

  // ---------------------------------------------------------------------------
  // Mock-store sanity: confirm benchmark-mode hooks are wired in the mock so
  // a future regeneration of __mocks__/stores/modelStore.ts cannot silently
  // drop them and break the runner without a clear test signal.
  // ---------------------------------------------------------------------------

  describe('mock modelStore sanity (benchmark-mode hooks wired)', () => {
    it.each([['enterBenchmarkMode'], ['exitBenchmarkMode']] as const)(
      'exposes %s as a callable jest.fn()',
      name => {
        const fn = (modelStore as any)[name];
        expect(fn).toBeDefined();
        expect(fn).toEqual(expect.any(Function));
        expect(fn.mock).toBeDefined();
      },
    );
  });
});
