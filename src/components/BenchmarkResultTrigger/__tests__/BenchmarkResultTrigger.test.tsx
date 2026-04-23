import React from 'react';

import {render, fireEvent, waitFor} from '../../../../jest/test-utils';

import {BenchmarkResultTrigger} from '../BenchmarkResultTrigger';

import {benchmarkStore, modelStore} from '../../../store';

jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/doc',
  exists: jest.fn().mockResolvedValue(true),
  readDir: jest.fn(),
}));

const RNFS = require('@dr.pogodin/react-native-fs');

describe('BenchmarkResultTrigger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the container and both testID elements', () => {
    const {getByTestId} = render(<BenchmarkResultTrigger />);

    expect(getByTestId('benchmark-result-container')).toBeTruthy();
    expect(getByTestId('benchmark-result-label')).toBeTruthy();
    expect(getByTestId('benchmark-result-value')).toBeTruthy();
  });

  it('read::latest writes JSON.stringify(latestResult) to accessibilityLabel', async () => {
    const {getByTestId} = render(<BenchmarkResultTrigger />);

    fireEvent.changeText(getByTestId('benchmark-result-label'), 'read::latest');

    const expected = JSON.stringify(benchmarkStore.latestResult);
    await waitFor(() => {
      const resultEl = getByTestId('benchmark-result-value');
      expect(resultEl.props.accessibilityLabel).toBe(expected);
    });
  });

  it('read::latest writes "null" when there is no latestResult', async () => {
    const original = benchmarkStore.latestResult;
    // Force latestResult to undefined/null for this test
    (benchmarkStore as any).latestResult = undefined;

    const {getByTestId} = render(<BenchmarkResultTrigger />);

    fireEvent.changeText(getByTestId('benchmark-result-label'), 'read::latest');

    await waitFor(() => {
      const resultEl = getByTestId('benchmark-result-value');
      expect(resultEl.props.accessibilityLabel).toBe('null');
    });

    // restore
    (benchmarkStore as any).latestResult = original;
  });

  it('read::initSettings writes JSON.stringify(contextInitParams)', async () => {
    const {getByTestId} = render(<BenchmarkResultTrigger />);

    fireEvent.changeText(
      getByTestId('benchmark-result-label'),
      'read::initSettings',
    );

    const expected = JSON.stringify(modelStore.contextInitParams);
    await waitFor(() => {
      const resultEl = getByTestId('benchmark-result-value');
      expect(resultEl.props.accessibilityLabel).toBe(expected);
    });
  });

  it('list::models returns JSON array of .gguf basenames under hf/', async () => {
    RNFS.exists.mockResolvedValueOnce(true);
    RNFS.readDir
      .mockResolvedValueOnce([
        {
          path: '/mock/doc/models/hf/bartowski',
          name: 'bartowski',
          isDirectory: () => true,
          isFile: () => false,
        },
      ])
      .mockResolvedValueOnce([
        {
          path: '/mock/doc/models/hf/bartowski/Qwen_Qwen3-1.7B-GGUF',
          name: 'Qwen_Qwen3-1.7B-GGUF',
          isDirectory: () => true,
          isFile: () => false,
        },
      ])
      .mockResolvedValueOnce([
        {
          name: 'Qwen_Qwen3-1.7B-Q4_0.gguf',
          isDirectory: () => false,
          isFile: () => true,
        },
        {name: 'README.md', isDirectory: () => false, isFile: () => true},
      ]);

    const {getByTestId} = render(<BenchmarkResultTrigger />);

    fireEvent.changeText(getByTestId('benchmark-result-label'), 'list::models');

    await waitFor(() => {
      const resultEl = getByTestId('benchmark-result-value');
      expect(resultEl.props.accessibilityLabel).toBe(
        JSON.stringify(['Qwen_Qwen3-1.7B-Q4_0.gguf']),
      );
    });
  });

  it('list::models returns [] when the hf/ root does not exist', async () => {
    RNFS.exists.mockResolvedValueOnce(false);

    const {getByTestId} = render(<BenchmarkResultTrigger />);

    fireEvent.changeText(getByTestId('benchmark-result-label'), 'list::models');

    await waitFor(() => {
      const resultEl = getByTestId('benchmark-result-value');
      expect(resultEl.props.accessibilityLabel).toBe('[]');
    });
  });

  it('ignores text that is not a command', async () => {
    const {getByTestId} = render(<BenchmarkResultTrigger />);

    // Prime with a known state so we can detect any unintended mutation
    fireEvent.changeText(
      getByTestId('benchmark-result-label'),
      'read::initSettings',
    );
    const primed = JSON.stringify(modelStore.contextInitParams);
    await waitFor(() => {
      expect(
        getByTestId('benchmark-result-value').props.accessibilityLabel,
      ).toBe(primed);
    });

    fireEvent.changeText(getByTestId('benchmark-result-label'), 'random text');

    // Give async processing a chance to run, then assert label unchanged
    await new Promise(r => setTimeout(r, 50));
    expect(getByTestId('benchmark-result-value').props.accessibilityLabel).toBe(
      primed,
    );
  });

  it('is hidden: absolute position, 44x44, transparent background', () => {
    const {getByTestId} = render(<BenchmarkResultTrigger />);
    const container = getByTestId('benchmark-result-container');

    expect(container.props.style).toEqual(
      expect.objectContaining({
        position: 'absolute',
        backgroundColor: 'transparent',
        width: 44,
        height: 44,
      }),
    );
  });
});
