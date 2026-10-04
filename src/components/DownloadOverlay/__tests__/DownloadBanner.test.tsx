import React from 'react';
import {runInAction} from 'mobx';
import {fireEvent} from '@testing-library/react-native';

import {render} from '../../../../jest/test-utils';
import {createModel} from '../../../../jest/fixtures/models';

import {DownloadBanner} from '../DownloadBanner';
import {modelStore} from '../../../store';
import {downloadManager} from '../../../services/downloads';
import {createErrorState} from '../../../utils/errors';

const failedModel = createModel({
  id: 'failed-model',
  name: 'Failed Model',
  isDownloaded: false,
  progress: 40,
});
const runningModel = createModel({id: 'running-model', name: 'Running Model'});

const failWith = (modelId?: string) =>
  runInAction(() => {
    modelStore.downloadError = createErrorState(
      new Error('stalled'),
      'download',
      'huggingface',
      modelId ? {modelId} : undefined,
    );
  });

const withActiveDownloads = (count: number) =>
  jest.spyOn(modelStore, 'activeDownloads', 'get').mockReturnValue(
    Array.from({length: count}, () => ({
      modelId: runningModel.id,
      model: runningModel,
      progress: 30,
      bytesDownloaded: 0,
      bytesTotal: 0,
      etaLabel: '',
    })) as any,
  );

describe('DownloadBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (downloadManager.isDownloading as jest.Mock).mockReturnValue(false);
    runInAction(() => {
      modelStore.models = [failedModel, runningModel];
      modelStore.downloadError = null;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the failure row with no active downloads', () => {
    failWith(failedModel.id);

    const {getByTestId, getByText} = render(<DownloadBanner />, {
      withNavigation: true,
    });

    expect(getByTestId('download-banner-failed')).toBeTruthy();
    expect(getByText("Failed Model couldn't finish downloading")).toBeTruthy();
    expect(getByTestId('download-banner-retry')).toBeTruthy();
  });

  it('takes precedence over a progress row and counts active downloads', () => {
    withActiveDownloads(2);
    failWith(failedModel.id);

    const {getByTestId, queryByTestId} = render(<DownloadBanner />, {
      withNavigation: true,
    });

    expect(getByTestId('download-banner-failed')).toBeTruthy();
    expect(queryByTestId('download-banner-stop')).toBeNull();
    expect(getByTestId('download-banner-extra-badge')).toHaveTextContent('+2');
  });

  it('retries from the Retry pill', () => {
    failWith(failedModel.id);

    const {getByTestId} = render(<DownloadBanner />, {withNavigation: true});
    fireEvent.press(getByTestId('download-banner-retry'));

    expect(modelStore.retryDownload).toHaveBeenCalledTimes(1);
  });

  it('clears the error from the dismiss control', () => {
    failWith(failedModel.id);

    const {getByTestId} = render(<DownloadBanner />, {withNavigation: true});
    fireEvent.press(getByTestId('download-banner-dismiss'));

    expect(modelStore.clearDownloadError).toHaveBeenCalledTimes(1);
  });

  it('shows no failure row while that model is downloading again', () => {
    (downloadManager.isDownloading as jest.Mock).mockImplementation(
      id => id === failedModel.id,
    );
    failWith(failedModel.id);

    const {queryByTestId} = render(<DownloadBanner />, {withNavigation: true});

    expect(queryByTestId('download-banner-failed')).toBeNull();
  });

  it('shows no failure row for an error without a model', () => {
    failWith();

    const {queryByTestId} = render(<DownloadBanner />, {withNavigation: true});

    expect(queryByTestId('download-banner-failed')).toBeNull();
  });

  it('keeps the progress row when nothing failed', () => {
    withActiveDownloads(1);

    const {getByTestId, queryByTestId} = render(<DownloadBanner />, {
      withNavigation: true,
    });

    expect(getByTestId('download-banner-stop')).toBeTruthy();
    expect(queryByTestId('download-banner-failed')).toBeNull();
  });
});
