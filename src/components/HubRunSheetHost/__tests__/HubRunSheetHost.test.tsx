/**
 * HubRunSheetHost — global host for the hub/run route.
 *
 * Covers: a parked request resolves the repo and presents DetailsView (full
 * quant list); a resolve failure shows an error with Retry; dismiss clears the
 * parked request and starts no download (the host never downloads directly —
 * that is owned by ModelFileCard inside DetailsView).
 */

import React from 'react';
import {runInAction} from 'mobx';

import {render, fireEvent, waitFor, act} from '../../../../jest/test-utils';
import {deepLinkStore} from '../../../store';
import {HubRunSheetHost} from '../HubRunSheetHost';

// Press the actual onPress-bearing node (Paper Buttons spread testID across a
// composite tree; the host View carries no onPress).
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

// Mock only the repo resolver; keep the real L10nContext from utils.
jest.mock('../../../utils', () => {
  const actual = jest.requireActual('../../../utils');
  return {
    ...actual,
    resolveHFRepo: jest.fn(),
  };
});

// Stub DetailsView so the test asserts the host presents it, not its internals.
jest.mock('../../../screens/ModelsScreen/HFModelSearch/DetailsView', () => ({
  DetailsView: ({hfModel}: {hfModel: {id: string}}) => {
    const ReactStub = require('react');
    const {Text: RNText} = require('react-native');
    return ReactStub.createElement(
      RNText,
      {testID: 'details-view'},
      hfModel.id,
    );
  },
}));

import {resolveHFRepo} from '../../../utils';

const mockResolveRepo = resolveHFRepo as jest.Mock;

const request = {
  repoId: 'author/model',
  filename: undefined,
  source: 'hf',
};

const resolvedModel = {
  id: 'author/model',
  author: 'author',
  siblings: [
    {
      rfilename: 'model.Q4_K_M.gguf',
      size: 4096,
      url: 'https://huggingface.co/author/model/resolve/main/model.Q4_K_M.gguf',
    },
  ],
} as any;

describe('HubRunSheetHost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      deepLinkStore.pendingHubRun = null;
    });
  });

  it('resolves the repo and presents DetailsView on success', async () => {
    mockResolveRepo.mockResolvedValue(resolvedModel);
    runInAction(() => {
      deepLinkStore.pendingHubRun = request;
    });

    const {getByTestId} = render(<HubRunSheetHost />, {
      withBottomSheetProvider: true,
    });

    await waitFor(() => {
      expect(getByTestId('details-view')).toBeTruthy();
    });
    expect(getByTestId('details-view')).toHaveTextContent('author/model');
    expect(mockResolveRepo).toHaveBeenCalledWith('author/model', undefined);
  });

  it('shows the error state with Retry when resolve fails', async () => {
    mockResolveRepo.mockRejectedValueOnce(new Error('not found'));
    runInAction(() => {
      deepLinkStore.pendingHubRun = request;
    });

    const {getByTestId, queryByTestId} = render(<HubRunSheetHost />, {
      withBottomSheetProvider: true,
    });

    await waitFor(() => {
      expect(getByTestId('hub-run-error')).toBeTruthy();
    });
    expect(queryByTestId('details-view')).toBeNull();
    expect(getByTestId('hub-run-retry')).toBeTruthy();
  });

  it('re-resolves when Retry is pressed', async () => {
    mockResolveRepo
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(resolvedModel);
    runInAction(() => {
      deepLinkStore.pendingHubRun = request;
    });

    const result = render(<HubRunSheetHost />, {
      withBottomSheetProvider: true,
    });

    await waitFor(() => {
      expect(result.getByTestId('hub-run-retry')).toBeTruthy();
    });

    await pressButton(result, 'hub-run-retry');

    await waitFor(() => {
      expect(result.getByTestId('details-view')).toBeTruthy();
    });
    expect(mockResolveRepo).toHaveBeenCalledTimes(2);
  });

  it('clears the parked request on dismiss', async () => {
    mockResolveRepo.mockResolvedValue(resolvedModel);
    runInAction(() => {
      deepLinkStore.pendingHubRun = request;
    });

    const result = render(<HubRunSheetHost />, {
      withBottomSheetProvider: true,
    });

    await waitFor(() => {
      expect(result.getByTestId('details-view')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(result.getByTestId('sheet-close-button'));
      await Promise.resolve();
    });

    expect(deepLinkStore.clearPendingHubRun).toHaveBeenCalled();
  });
});
