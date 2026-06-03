/**
 * HubRunDownloadSheet — the only place a hub/run download can start.
 *
 * Covers: successful resolve shows name/size/quant; cancel starts no download;
 * resolve error shows a Retry affordance; and the confirm contract — confirm
 * calls ModelStore.downloadHFModel with {enableVision:false}.
 */

import React from 'react';

import {render, fireEvent, waitFor, act} from '../../../../jest/test-utils';
import {modelStore} from '../../../store';
import {HubRunDownloadSheet} from '../HubRunDownloadSheet';

// react-native-paper's Button (mode="contained") spreads testID across a
// composite tree; getByTestId returns the host View, which carries no onPress,
// so fireEvent.press on it is a no-op. Press the actual onPress-bearing node.
const pressButton = async (root: any, testID: string) => {
  const targets = root.UNSAFE_root.findAll(
    (n: any) =>
      n.props?.testID === testID && typeof n.props?.onPress === 'function',
  );
  expect(targets.length).toBeGreaterThan(0);
  await act(async () => {
    fireEvent.press(targets[0]);
    await Promise.resolve();
  });
};

// Mock only the resolver; keep the real L10nContext / formatBytes from utils.
jest.mock('../../../utils', () => {
  const actual = jest.requireActual('../../../utils');
  return {
    ...actual,
    resolveHFModelForDownload: jest.fn(),
  };
});

import {resolveHFModelForDownload} from '../../../utils';

const mockResolve = resolveHFModelForDownload as jest.Mock;

const request = {
  repoId: 'author/model',
  filename: 'model.Q4_K_M.gguf',
  source: 'hf',
};

const resolvedPair = {
  hfModel: {id: 'author/model', author: 'author', siblings: []} as any,
  modelFile: {
    rfilename: 'model.Q4_K_M.gguf',
    size: 4 * 1024 * 1024,
    url: 'https://huggingface.co/author/model/resolve/main/model.Q4_K_M.gguf',
  } as any,
};

describe('HubRunDownloadSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the repo id and resolving spinner while resolving', async () => {
    let resolveFn: (v: any) => void = () => {};
    mockResolve.mockReturnValue(
      new Promise(res => {
        resolveFn = res;
      }),
    );

    const {getByTestId} = render(
      <HubRunDownloadSheet request={request} onClose={jest.fn()} />,
      {withBottomSheetProvider: true},
    );

    expect(getByTestId('hub-run-repo-id')).toHaveTextContent('author/model');
    expect(getByTestId('hub-run-resolving')).toBeTruthy();

    // Let it finish so we don't leak an unresolved promise into other tests.
    await waitFor(() => {
      resolveFn(resolvedPair);
    });
  });

  it('shows name, size and quant after a successful resolve', async () => {
    mockResolve.mockResolvedValue(resolvedPair);

    const {getByTestId, getByText} = render(
      <HubRunDownloadSheet request={request} onClose={jest.fn()} />,
      {withBottomSheetProvider: true},
    );

    await waitFor(() => {
      expect(getByTestId('hub-run-ready')).toBeTruthy();
    });

    // filename shown
    expect(getByText('model.Q4_K_M.gguf')).toBeTruthy();
    // quant extracted from filename
    expect(getByText('Q4_K_M')).toBeTruthy();
    // size formatted (4 MB)
    expect(getByText(/MB/)).toBeTruthy();
  });

  it('calls downloadHFModel with {enableVision:false} on confirm', async () => {
    mockResolve.mockResolvedValue(resolvedPair);
    const onClose = jest.fn();

    const result = render(
      <HubRunDownloadSheet request={request} onClose={onClose} />,
      {withBottomSheetProvider: true},
    );

    await waitFor(() => {
      expect(result.getByTestId('hub-run-download')).toBeTruthy();
    });

    await pressButton(result, 'hub-run-download');

    await waitFor(() => {
      expect(modelStore.downloadHFModel).toHaveBeenCalledWith(
        resolvedPair.hfModel,
        resolvedPair.modelFile,
        {enableVision: false},
      );
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('does not start a download when cancelled', async () => {
    mockResolve.mockResolvedValue(resolvedPair);
    const onClose = jest.fn();

    const result = render(
      <HubRunDownloadSheet request={request} onClose={onClose} />,
      {withBottomSheetProvider: true},
    );

    await waitFor(() => {
      expect(result.getByTestId('hub-run-ready')).toBeTruthy();
    });

    await pressButton(result, 'hub-run-cancel');

    expect(modelStore.downloadHFModel).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the error state with Retry when resolve fails', async () => {
    mockResolve.mockRejectedValueOnce(new Error('not found'));

    const {getByTestId, queryByTestId} = render(
      <HubRunDownloadSheet request={request} onClose={jest.fn()} />,
      {withBottomSheetProvider: true},
    );

    await waitFor(() => {
      expect(getByTestId('hub-run-error')).toBeTruthy();
    });

    // Download button is replaced by Retry in the error state.
    expect(queryByTestId('hub-run-download')).toBeNull();
    expect(getByTestId('hub-run-retry')).toBeTruthy();
    expect(modelStore.downloadHFModel).not.toHaveBeenCalled();
  });

  it('retries resolution when Retry is pressed', async () => {
    mockResolve
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(resolvedPair);

    const result = render(
      <HubRunDownloadSheet request={request} onClose={jest.fn()} />,
      {withBottomSheetProvider: true},
    );

    await waitFor(() => {
      expect(result.getByTestId('hub-run-retry')).toBeTruthy();
    });

    await pressButton(result, 'hub-run-retry');

    await waitFor(() => {
      expect(result.getByTestId('hub-run-ready')).toBeTruthy();
    });
    expect(mockResolve).toHaveBeenCalledTimes(2);
  });
});
