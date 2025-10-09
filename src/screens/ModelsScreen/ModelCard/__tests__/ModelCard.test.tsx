import React from 'react';
import {Linking, Alert} from 'react-native';

import {render, fireEvent, waitFor, act} from '../../../../../jest/test-utils';
import {
  basicModel,
  downloadedModel,
  downloadingModel,
  largeMemoryModel,
} from '../../../../../jest/fixtures/models';

// Unmock useMemoryCheck for memory warning tests
jest.unmock('../../../../hooks/useMemoryCheck');

import {ModelCard} from '../ModelCard';

import {downloadManager} from '../../../../services/downloads';

import {modelStore, uiStore} from '../../../../store';
import {ModelType} from '../../../../utils/types';

import {l10n} from '../../../../utils/l10n';

jest.useFakeTimers(); // Mock all timers

jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: jest.fn().mockImplementation(() => Promise.resolve()),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  canOpenURL: jest.fn().mockImplementation(() => Promise.resolve(true)),
  getInitialURL: jest.fn().mockImplementation(() => Promise.resolve(null)),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

const customRender = (ui: React.ReactElement, options: any = {}) =>
  render(ui, {withBottomSheetProvider: true, withNavigation: true, ...options});

describe('ModelCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders model details correctly', async () => {
    const {getByText} = customRender(<ModelCard model={basicModel} />);
    await waitFor(() => {
      expect(getByText(basicModel.name)).toBeTruthy();
    });
  });

  it('handles memory warning correctly', async () => {
    const {getByText, getByTestId, queryByText, queryByTestId} = customRender(
      <ModelCard model={largeMemoryModel} />,
    );

    // If the model is downloaded and the device is low on memory, the warning should be displayed.
    await waitFor(() => {
      expect(getByText(l10n.en.memory.shortWarning)).toBeTruthy();
      expect(queryByTestId('memory-warning-snackbar')).toBeNull();
    });

    // Snackbar
    act(() => {
      fireEvent.press(getByTestId('memory-warning-button'));
    });
    await waitFor(() => {
      expect(getByText(l10n.en.common.dismiss)).toBeTruthy();
      expect(queryByTestId('memory-warning-snackbar')).toBeTruthy();
    });
    act(() => {
      fireEvent.press(getByText(l10n.en.common.dismiss));
    });
    await waitFor(() => {
      expect(queryByText(l10n.en.common.dismiss)).toBeNull();
      expect(queryByTestId('memory-warning-snackbar')).toBeNull();
    });
  }, 10000);

  it('handles download overlay and download button correctly', async () => {
    if (!jest.isMockFunction(modelStore.checkSpaceAndDownload)) {
      jest.spyOn(modelStore, 'checkSpaceAndDownload');
    }

    const {getByTestId, queryByTestId} = customRender(
      <ModelCard model={basicModel} />,
    );

    await waitFor(() => {
      expect(getByTestId('download-button')).toBeTruthy();
      expect(queryByTestId('download-progress-bar')).toBeNull();
    });
    const downloadButton = getByTestId('download-button');

    act(() => {
      fireEvent.press(downloadButton);
    });

    expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledWith(
      basicModel.id,
    );
  });

  it('progress bar is shown when downloading', async () => {
    // Mock the isDownloading method to return true for the downloadingModel
    (downloadManager.isDownloading as jest.Mock).mockImplementation(modelId => {
      return modelId === downloadingModel.id;
    });

    // Mock the getDownloadProgress method to return a progress value
    (downloadManager.getDownloadProgress as jest.Mock).mockImplementation(
      modelId => {
        return modelId === downloadingModel.id ? 50 : 0; // 50% progress
      },
    );

    const {getByTestId, queryByTestId, rerender} = customRender(
      <ModelCard model={basicModel} />,
    );

    await waitFor(() => {
      expect(getByTestId('download-button')).toBeTruthy();
      expect(queryByTestId('download-progress-bar')).toBeNull();
    });

    rerender(<ModelCard model={downloadingModel} />);

    await waitFor(() => {
      expect(getByTestId('download-progress-bar')).toBeTruthy();
    });
  });

  it('opens the HuggingFace URL when the icon button is pressed', async () => {
    const {getByTestId} = customRender(<ModelCard model={basicModel} />);

    // First expand the details to see the HuggingFace link
    const expandButton = getByTestId('expand-details-button');
    fireEvent.press(expandButton);

    await waitFor(() => {
      const openButton = getByTestId('open-huggingface-url');
      fireEvent.press(openButton);
    });

    expect(Linking.openURL).toHaveBeenCalledWith(basicModel.hfUrl);
  });

  it('handles model load correctly', async () => {
    const {getByTestId} = customRender(<ModelCard model={downloadedModel} />);

    expect(getByTestId('load-button')).toBeTruthy();

    act(() => {
      fireEvent.press(getByTestId('load-button'));
    });

    expect(modelStore.initContext).toHaveBeenCalledWith(downloadedModel);
    expect(mockNavigate).not.toHaveBeenCalled();

    uiStore.autoNavigatetoChat = true;
    act(() => {
      fireEvent.press(getByTestId('load-button'));
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Chat');
    });
  });

  it('handles model offload', async () => {
    const {getByTestId} = customRender(
      <ModelCard model={downloadedModel} activeModelId={downloadedModel.id} />,
    );

    expect(getByTestId('offload-button')).toBeTruthy();

    act(() => {
      fireEvent.press(getByTestId('offload-button'));
    });

    expect(modelStore.manualReleaseContext).toHaveBeenCalled();
  });

  // Add tests for delete functionality
  describe('Delete functionality', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      jest.spyOn(Alert, 'alert').mockImplementation();
    });

    it('shows delete confirmation for regular models', async () => {
      const {getByTestId} = customRender(<ModelCard model={downloadedModel} />);

      const deleteButton = getByTestId('delete-button');
      fireEvent.press(deleteButton);

      expect(Alert.alert).toHaveBeenCalledWith(
        expect.stringContaining('Delete'),
        expect.stringContaining('delete'),
        expect.arrayContaining([
          expect.objectContaining({text: 'Cancel'}),
          expect.objectContaining({text: 'Delete'}),
        ]),
      );
    });

    it('handles delete confirmation for regular models', async () => {
      (Alert.alert as jest.Mock).mockImplementation(
        (title, message, buttons) => {
          // Simulate pressing "Delete" button
          buttons[1].onPress();
        },
      );

      const {getByTestId} = customRender(<ModelCard model={downloadedModel} />);

      const deleteButton = getByTestId('delete-button');
      fireEvent.press(deleteButton);

      expect(modelStore.deleteModel).toHaveBeenCalledWith(downloadedModel);
    });

    it('shows special confirmation for projection models', async () => {
      const projectionModel = {
        ...downloadedModel,
        modelType: ModelType.PROJECTION,
      };

      const {getByTestId} = customRender(<ModelCard model={projectionModel} />);

      const deleteButton = getByTestId('delete-button');
      fireEvent.press(deleteButton);

      expect(Alert.alert).toHaveBeenCalledWith(
        expect.stringContaining('Delete'),
        expect.stringContaining('projection'),
        expect.arrayContaining([
          expect.objectContaining({text: 'Cancel'}),
          expect.objectContaining({text: 'Delete'}),
        ]),
      );
    });
  });

  // Add tests for download cancellation
  describe('Download cancellation', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('shows cancel button when downloading', async () => {
      (downloadManager.isDownloading as jest.Mock).mockReturnValue(true);

      const {getByTestId} = customRender(
        <ModelCard model={downloadingModel} />,
      );

      await waitFor(() => {
        expect(getByTestId('cancel-button')).toBeTruthy();
      });
    });

    it('handles download cancellation', async () => {
      (downloadManager.isDownloading as jest.Mock).mockReturnValue(true);

      const {getByTestId} = customRender(
        <ModelCard model={downloadingModel} />,
      );

      const cancelButton = getByTestId('cancel-button');
      fireEvent.press(cancelButton);

      expect(modelStore.cancelDownload).toHaveBeenCalledWith(
        downloadingModel.id,
      );
    });
  });

  // Add tests for settings functionality
  describe('Settings functionality', () => {
    const mockOnOpenSettings = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();

      // Reset downloadManager mock to ensure models are not downloading
      (downloadManager.isDownloading as jest.Mock).mockImplementation(
        modelId => {
          return modelId === downloadingModel.id;
        },
      );
    });

    it('calls onOpenSettings when settings button is pressed', async () => {
      const {getByTestId} = customRender(
        <ModelCard
          model={downloadedModel}
          onOpenSettings={mockOnOpenSettings}
        />,
      );

      const settingsButton = getByTestId('settings-button');
      fireEvent.press(settingsButton);

      expect(mockOnOpenSettings).toHaveBeenCalled();
    });
  });

  // Add tests for loading states
  describe('Loading states', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      // Reset modelStore to a clean state
      modelStore.isContextLoading = false;
      modelStore.loadingModel = undefined;
      modelStore.initContext = jest.fn(); // optional: re-mock if necessary

      // Reset downloadManager mock to ensure models are not downloading
      (downloadManager.isDownloading as jest.Mock).mockImplementation(
        modelId => {
          return modelId === downloadingModel.id;
        },
      );
    });

    it('shows loading indicator when model is being loaded', async () => {
      modelStore.isContextLoading = true;
      modelStore.loadingModel = downloadedModel;

      const {getByTestId} = customRender(<ModelCard model={downloadedModel} />);

      await waitFor(() => {
        expect(getByTestId('loading-indicator')).toBeTruthy();
      });
    });

    it('handles model loading errors', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      (modelStore.initContext as jest.Mock).mockRejectedValue(
        new Error('Loading failed'),
      );

      const {getByTestId} = customRender(<ModelCard model={downloadedModel} />);

      const loadButton = getByTestId('load-button');
      fireEvent.press(loadButton);

      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          'Error: Error: Loading failed',
        );
      });

      consoleLogSpy.mockRestore();
    });
  });

  // Add tests for projection model functionality
  describe('Projection model functionality', () => {
    const projectionModel = {
      ...downloadedModel,
      modelType: ModelType.PROJECTION,
      id: 'test/projection-model',
    };

    const visionModel = {
      ...downloadedModel,
      supportsMultimodal: true,
      defaultProjectionModel: projectionModel.id,
    };

    beforeEach(() => {
      jest.clearAllMocks();

      // Reset downloadManager mock to ensure models are not downloading
      (downloadManager.isDownloading as jest.Mock).mockImplementation(
        modelId => {
          return modelId === downloadingModel.id;
        },
      );

      // Mock projection model status
      modelStore.getProjectionModelStatus = jest.fn().mockReturnValue({
        isAvailable: true,
        state: 'available',
      });

      // Mock vision preference
      modelStore.getModelVisionPreference = jest.fn().mockReturnValue(true);
    });

    it('shows vision controls for vision models', async () => {
      const {getByTestId, getByText} = customRender(
        <ModelCard model={visionModel} />,
      );

      // First expand the details to see the vision toggle
      const expandButton = getByTestId('expand-details-button');
      fireEvent.press(expandButton);

      await waitFor(() => {
        expect(getByText('Vision')).toBeTruthy();
      });

      // Vision controls should be visible in the expanded details
      const visionToggle = getByTestId('vision-skill-touchable');
      expect(visionToggle).toBeTruthy();
    });

    it('shows projection model selector for vision models', async () => {
      const {getByTestId} = customRender(<ModelCard model={visionModel} />);
      (modelStore.getCompatibleProjectionModels as jest.Mock) = jest
        .fn()
        .mockReturnValue([projectionModel]);

      // First expand the details to see the projection model selector
      const expandButton = getByTestId('expand-details-button');
      fireEvent.press(expandButton);

      await waitFor(() => {
        expect(getByTestId('projection-model-selector')).toBeTruthy();
      });

      const projectionModelButton = getByTestId(
        'select-projection-model-button',
      );
      fireEvent.press(projectionModelButton);

      expect(modelStore.setDefaultProjectionModel).toHaveBeenCalledWith(
        visionModel.id,
        expect.any(String),
      );
    });

    it('shows projection model warning badge when projection model is missing', async () => {
      const visionModelWithMissingProjection = {
        ...downloadedModel,
        supportsMultimodal: true,
        defaultProjectionModel: 'missing/projection-model',
      };

      // Mock getProjectionModelStatus to return missing state
      modelStore.getProjectionModelStatus = jest.fn().mockReturnValue({
        isAvailable: false,
        state: 'missing',
      });

      // Mock vision preference to be enabled (required for warning to show)
      modelStore.getModelVisionPreference = jest.fn().mockReturnValue(true);

      const {getByTestId} = customRender(
        <ModelCard model={visionModelWithMissingProjection} />,
      );

      // First expand the details to see the projection warning
      const expandButton = getByTestId('expand-details-button');
      fireEvent.press(expandButton);

      await waitFor(() => {
        expect(getByTestId('projection-warning-badge')).toBeTruthy();
      });
    });

    it('handles projection warning badge press to download missing projection model', async () => {
      const visionModelWithMissingProjection = {
        ...downloadedModel,
        supportsMultimodal: true,
        defaultProjectionModel: 'missing/projection-model',
      };

      // Mock getProjectionModelStatus to return missing state
      modelStore.getProjectionModelStatus = jest.fn().mockReturnValue({
        isAvailable: false,
        state: 'missing',
      });

      // Mock vision preference to be enabled (required for warning to show)
      modelStore.getModelVisionPreference = jest.fn().mockReturnValue(true);

      const {getByTestId} = customRender(
        <ModelCard model={visionModelWithMissingProjection} />,
      );

      // First expand the details to see the projection warning
      const expandButton = getByTestId('expand-details-button');
      fireEvent.press(expandButton);

      await waitFor(() => {
        const warningBadge = getByTestId('projection-warning-badge');
        fireEvent.press(warningBadge);
      });

      expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledWith(
        'missing/projection-model',
      );
    });
  });
});
