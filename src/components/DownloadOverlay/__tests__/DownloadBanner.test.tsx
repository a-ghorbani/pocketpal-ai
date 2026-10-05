import React from 'react';
import {runInAction} from 'mobx';
import {fireEvent} from '@testing-library/react-native';

import {render} from '../../../../jest/test-utils';
import {createModel} from '../../../../jest/fixtures/models';

import {DownloadBanner} from '../DownloadBanner';
import {modelStore, palStore, uiStore} from '../../../store';
import {downloadManager} from '../../../services/downloads';
import {createErrorState} from '../../../utils/errors';
import {ROUTES} from '../../../utils/navigationConstants';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({navigate: mockNavigate}),
  };
});

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

const withActiveDownloads = (count: number, bytesTotal = 0) =>
  jest.spyOn(modelStore, 'activeDownloads', 'get').mockReturnValue(
    Array.from({length: count}, () => ({
      modelId: runningModel.id,
      model: runningModel,
      progress: 30,
      bytesDownloaded: 0,
      bytesTotal,
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
      palStore.pals = [];
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
    expect(getByText("Download didn't finish")).toBeTruthy();
    expect(getByText('Failed Model')).toBeTruthy();
    expect(getByTestId('download-banner-retry')).toBeTruthy();
  });

  it('names a failed pal download after the pal, like the progress row', () => {
    runInAction(() => {
      palStore.pals = [
        {
          id: 'pal-1',
          name: 'Pip',
          source: 'local',
          defaultModel: failedModel,
        } as any,
      ];
    });
    failWith(failedModel.id);

    const {getByText, queryByText} = render(<DownloadBanner />, {
      withNavigation: true,
    });

    expect(getByText('Pip')).toBeTruthy();
    expect(queryByText('Failed Model')).toBeNull();
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

  it('opens the Models screen from the failure row body', () => {
    failWith(failedModel.id);

    const {getByLabelText} = render(<DownloadBanner />, {withNavigation: true});
    fireEvent.press(getByLabelText("Download didn't finish, Failed Model"));

    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.MODELS);
  });

  it('cancels the visible download from the progress row Stop pill', () => {
    withActiveDownloads(1);

    const {getByTestId} = render(<DownloadBanner />, {withNavigation: true});
    fireEvent.press(getByTestId('download-banner-stop'));

    expect(modelStore.cancelDownload).toHaveBeenCalledWith(runningModel.id);
    expect(modelStore.clearDownloadError).not.toHaveBeenCalled();
  });

  it('dismisses only the banner from the progress row', () => {
    withActiveDownloads(1);

    const {getByTestId} = render(<DownloadBanner />, {withNavigation: true});
    fireEvent.press(getByTestId('download-banner-dismiss'));

    expect(uiStore.dismissDownloadBanner).toHaveBeenCalledWith(runningModel.id);
    expect(modelStore.clearDownloadError).not.toHaveBeenCalled();
  });

  it('opens the Models screen from the progress row body', () => {
    withActiveDownloads(1);

    const {getByTestId} = render(<DownloadBanner />, {withNavigation: true});
    fireEvent.press(getByTestId('download-banner'));

    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.MODELS);
  });

  it.each([
    [90 * 1024 * 1024, '90 MB'],
    [3 * 1024 * 1024 * 1024, '3.0 GB'],
  ])('labels a %d-byte download as %s', (bytes, label) => {
    withActiveDownloads(1, bytes);

    const {getByText} = render(<DownloadBanner />, {withNavigation: true});

    expect(getByText(label)).toBeTruthy();
  });
});
