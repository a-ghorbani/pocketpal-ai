import React from 'react';
import {Alert} from 'react-native';

import {
  render as baseRender,
  fireEvent,
  act,
} from '../../../../../../../jest/test-utils';
import {
  hfModel1,
  createModel,
  mockHFModel1,
  modelsList,
} from '../../../../../../../jest/fixtures/models';

import {ModelFileCard} from '../ModelFileCard';

import {downloadManager} from '../../../../../../services/downloads';

import {modelStore} from '../../../../../../store';

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {withBottomSheetProvider: true, ...options});

describe('ModelFileCard', () => {
  const mockModelFile = {
    rfilename: 'test-model.gguf',
    size: 1000 * 1000 * 500, // 1GB
    oid: 'test-oid',
    canFitInStorage: true,
  };
  let downloadedHFModel;

  beforeEach(() => {
    downloadedHFModel = createModel({
      ...hfModel1,
      isDownloaded: true,
    });
    modelStore.models = modelsList;
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');

    (downloadManager.isDownloading as jest.Mock).mockReset();
  });

  it('renders correctly with initial props', () => {
    const {getByText} = render(
      <ModelFileCard modelFile={mockModelFile} hfModel={mockHFModel1} />,
    );

    expect(getByText('test-model.gguf')).toBeTruthy();
    expect(getByText('500 MB')).toBeTruthy();
  });

  it('handles bookmark toggle when not bookmarked', async () => {
    const {getByTestId} = render(
      <ModelFileCard modelFile={mockModelFile} hfModel={mockHFModel1} />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('bookmark-button'));
    });

    expect(modelStore.addHFModel).toHaveBeenCalledWith(
      mockHFModel1,
      mockModelFile,
    );
  });

  it('shows alert when trying to remove downloaded model', async () => {
    modelStore.models = [downloadedHFModel];

    const {getByTestId} = render(
      <ModelFileCard
        modelFile={downloadedHFModel.hfModelFile!}
        hfModel={downloadedHFModel.hfModel!}
      />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('bookmark-button'));
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Cannot Remove',
      'The model is downloaded. Please delete the file first.',
    );
  });

  it('handles download initiation', async () => {
    const {getByTestId} = render(
      <ModelFileCard
        modelFile={mockHFModel1.siblings[0]}
        hfModel={mockHFModel1}
      />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('download-button'));
    });

    expect(modelStore.downloadHFModel).toHaveBeenCalledWith(
      mockHFModel1,
      mockHFModel1.siblings[0],
      {enableVision: true},
    );
  });

  it('handles download cancellation', async () => {
    modelStore.models = [hfModel1];

    (downloadManager.isDownloading as jest.Mock).mockImplementation(modelId => {
      return modelId === hfModel1.id;
    });
    const {getByTestId} = render(
      <ModelFileCard
        modelFile={hfModel1.hfModelFile!}
        hfModel={hfModel1.hfModel!}
      />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('cancel-button'));
    });

    expect(modelStore.cancelDownload).toHaveBeenCalledWith(hfModel1.id);
  });

  it('disables download button when storage is insufficient', () => {
    const insufficientStorageFile = {
      ...mockModelFile,
      canFitInStorage: false,
    };

    const {getByTestId} = render(
      <ModelFileCard
        modelFile={insufficientStorageFile}
        hfModel={mockHFModel1}
      />,
    );

    expect(
      getByTestId('download-button').props.accessibilityState.disabled,
    ).toBe(true);
  });

  it('shows delete confirmation for downloaded model', async () => {
    modelStore.models = [downloadedHFModel];

    const {getByTestId} = render(
      <ModelFileCard
        modelFile={downloadedHFModel.hfModelFile!}
        hfModel={downloadedHFModel.hfModel!}
      />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('download-button'));
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete Model',
      'Are you sure you want to delete this downloaded model?',
      expect.any(Array),
    );
  });
});
