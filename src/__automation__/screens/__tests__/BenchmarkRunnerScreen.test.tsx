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
      expect(setStatus.mock.calls[setStatus.mock.calls.length - 1][0]).toBe(
        'complete',
      );
    });
  });
});
