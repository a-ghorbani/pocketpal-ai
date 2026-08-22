import React from 'react';
import {Linking, Alert} from 'react-native';

import {runInAction} from 'mobx';

import {render, fireEvent, waitFor, act} from '../../../../../jest/test-utils';
import {
  basicModel,
  createModel,
  downloadedModel,
  downloadingModel,
  largeDiskModel,
  largeMemoryModel,
  remoteModel,
  remoteModelSibling,
} from '../../../../../jest/fixtures/models';
import {themeFixtures} from '../../../../../jest/fixtures/theme';
import {routerModelsBody} from '../../../../../jest/fixtures/remoteModelList';

// Unmock useMemoryCheck for memory warning tests
jest.unmock('../../../../hooks/useMemoryCheck');

import {ModelCard} from '../ModelCard';

import {downloadManager} from '../../../../services/downloads';

import {modelStore, uiStore, serverStore} from '../../../../store';
import {ModelType} from '../../../../utils/types';

import {l10n} from '../../../../locales';

jest.useFakeTimers(); // Mock all timers

// Mock Linking - need to spy on the actual Linking object
const mockOpenURL = jest.fn().mockImplementation(() => Promise.resolve());
jest.spyOn(Linking, 'openURL').mockImplementation(mockOpenURL);

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

const customRender = (ui: React.ReactElement, options: any = {}) =>
  render(ui, {withBottomSheetProvider: true, withNavigation: true, ...options});

/**
 * Every `.svg` resolves to the same mock component, so the two header glyphs
 * are told apart by the stroke they are given, not by their type.
 */
const glyphStroke = (glyphWrapper: any): string =>
  glyphWrapper.props.children.props.stroke;

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

  describe('Status badges', () => {
    it('shows the Recommended badge for a device-rule preset not yet downloaded', async () => {
      const model = createModel({
        id: 'rec-1',
        name: 'recommended model',
        isDownloaded: false,
        isLocal: false,
        isRulePreset: true,
      });
      const {getByTestId} = customRender(<ModelCard model={model} />);
      await waitFor(() => {
        expect(getByTestId('badge-recommended')).toBeTruthy();
      });
    });

    it('hides the Recommended badge when the model is not a rule preset', async () => {
      const model = createModel({
        id: 'rec-2',
        name: 'plain model',
        isDownloaded: false,
        isLocal: false,
        isRulePreset: false,
      });
      const {queryByTestId} = customRender(<ModelCard model={model} />);
      await waitFor(() => {
        expect(queryByTestId('badge-recommended')).toBeNull();
      });
    });

    it('hides the Recommended badge once a rule preset is downloaded', async () => {
      const model = createModel({
        id: 'rec-3',
        name: 'downloaded preset',
        isDownloaded: true,
        isLocal: false,
        isRulePreset: true,
      });
      const {queryByTestId} = customRender(<ModelCard model={model} />);
      await waitFor(() => {
        expect(queryByTestId('badge-recommended')).toBeNull();
        // Downloaded models surface the Downloaded badge instead.
        expect(queryByTestId('badge-downloaded')).toBeTruthy();
      });
    });
  });

  describe('Storage advisory', () => {
    it('shows the storage warning when a downloadable model needs more space', async () => {
      const {getByTestId} = customRender(<ModelCard model={largeDiskModel} />);
      await waitFor(() => {
        expect(getByTestId('storage-error-text')).toBeTruthy();
      });
    });

    it('skips the storage warning for remote models', async () => {
      const {getByText, queryByTestId} = customRender(
        <ModelCard model={remoteModel} />,
      );
      await waitFor(() => {
        expect(getByText(remoteModel.name)).toBeTruthy();
      });
      expect(queryByTestId('storage-error-text')).toBeNull();
    });
  });

  it('handles memory warning correctly', async () => {
    const {getByText, getByTestId, queryByText, queryByTestId} = customRender(
      <ModelCard model={largeMemoryModel} />,
    );

    // If the model is downloaded and the device is low on memory, the warning should be displayed.
    // Now uses memoryTight or lowMemory instead of shortWarning
    await waitFor(() => {
      // Should show either "Memory tight" or "Low memory" warning
      const hasTightWarning = queryByText(l10n.en.memory.memoryTight);
      const hasLowMemoryWarning = queryByText(l10n.en.memory.lowMemory);
      expect(hasTightWarning || hasLowMemoryWarning).toBeTruthy();
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

    expect(modelStore.selectModel).toHaveBeenCalledWith(downloadedModel);
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
      modelStore.selectModel = jest.fn(); // optional: re-mock if necessary

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
      (modelStore.selectModel as jest.Mock).mockRejectedValue(
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

  describe('Remote model functionality', () => {
    const mockOnOpenServerDetails = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('renders server name link for remote models', async () => {
      const {getByTestId} = customRender(
        <ModelCard
          model={remoteModel}
          onOpenServerDetails={mockOnOpenServerDetails}
        />,
      );

      await waitFor(() => {
        expect(getByTestId('server-link')).toBeTruthy();
      });
    });

    it('calls onOpenServerDetails when server link is pressed', async () => {
      const {getByTestId} = customRender(
        <ModelCard
          model={remoteModel}
          onOpenServerDetails={mockOnOpenServerDetails}
        />,
      );

      await waitFor(() => {
        const serverLink = getByTestId('server-link');
        fireEvent.press(serverLink);
      });

      expect(mockOnOpenServerDetails).toHaveBeenCalledWith(
        remoteModel.serverId,
      );
    });

    it('shows delete button for remote models', async () => {
      const {getByTestId} = customRender(
        <ModelCard
          model={remoteModel}
          onOpenServerDetails={mockOnOpenServerDetails}
        />,
      );

      await waitFor(() => {
        expect(getByTestId('delete-button')).toBeTruthy();
      });
    });

    it('shows a settings button for remote models', async () => {
      const {getByTestId} = customRender(
        <ModelCard
          model={remoteModel}
          onOpenServerDetails={mockOnOpenServerDetails}
        />,
      );

      await waitFor(() => {
        expect(getByTestId('settings-button')).toBeTruthy();
      });
    });

    it('calls onOpenSettings when the remote settings button is pressed', async () => {
      const mockOnOpenSettings = jest.fn();
      const {getByTestId} = customRender(
        <ModelCard
          model={remoteModel}
          onOpenSettings={mockOnOpenSettings}
          onOpenServerDetails={mockOnOpenServerDetails}
        />,
      );

      fireEvent.press(getByTestId('settings-button'));
      expect(mockOnOpenSettings).toHaveBeenCalled();
    });

    it('shows delete confirmation dialog for remote models', async () => {
      jest.spyOn(Alert, 'alert').mockImplementation();

      const {getByTestId} = customRender(
        <ModelCard
          model={remoteModel}
          onOpenServerDetails={mockOnOpenServerDetails}
        />,
      );

      const deleteButton = getByTestId('delete-button');
      fireEvent.press(deleteButton);

      expect(Alert.alert).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(remoteModel.name),
        expect.arrayContaining([
          expect.objectContaining({style: 'cancel'}),
          expect.objectContaining({style: 'destructive'}),
        ]),
      );
    });

    it('calls removeUserSelectedModel on delete confirmation', async () => {
      (Alert.alert as jest.Mock) = jest
        .fn()
        .mockImplementation((title, message, buttons) => {
          // Simulate pressing the destructive "Delete" button
          const destructiveButton = buttons.find(
            (b: any) => b.style === 'destructive',
          );
          destructiveButton?.onPress();
        });

      const {getByTestId} = customRender(
        <ModelCard
          model={remoteModel}
          onOpenServerDetails={mockOnOpenServerDetails}
        />,
      );

      const deleteButton = getByTestId('delete-button');
      fireEvent.press(deleteButton);

      expect(serverStore.removeUserSelectedModel).toHaveBeenCalledWith(
        remoteModel.serverId,
        remoteModel.remoteModelId,
      );
      expect(serverStore.removeServerIfOrphaned).toHaveBeenCalledWith(
        remoteModel.serverId,
      );
    });
  });

  describe('MTP (speculative) capability skill', () => {
    const mtpModel = createModel({
      id: 'mtp-model',
      name: 'mtp model',
      isDownloaded: true,
      ggufMetadata: {nextn_predict_layers: 1},
    });

    const plainModel = createModel({
      id: 'plain-model',
      name: 'plain model',
      isDownloaded: true,
      ggufMetadata: {nextn_predict_layers: 0},
    });

    // The capabilities line joins labels with ', ' in a single Text node, so a
    // substring match is enough. Escape regex metacharacters in the label
    // ("Speculative (MTP)") before building the matcher.
    const mtpLabelPattern = new RegExp(
      l10n.en.models.modelCapabilities.mtp.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&',
      ),
    );

    it('appends the MTP skill in the expanded details when the model is MTP-capable', async () => {
      const {getByTestId, getByText} = customRender(
        <ModelCard model={mtpModel} />,
      );

      fireEvent.press(getByTestId('expand-details-button'));

      await waitFor(() => {
        expect(getByText(mtpLabelPattern)).toBeTruthy();
      });
    });

    it('omits the MTP skill when the model is not MTP-capable', async () => {
      const {getByTestId, queryByText} = customRender(
        <ModelCard model={plainModel} />,
      );

      fireEvent.press(getByTestId('expand-details-button'));

      await waitFor(() => {
        expect(getByTestId('expand-details-button')).toBeTruthy();
      });
      expect(queryByText(mtpLabelPattern)).toBeNull();
    });
  });
  describe('Remote model capabilities', () => {
    const visionCell = `model-card-vision-capability-${remoteModel.id}`;
    const contextCell = `model-card-context-length-${remoteModel.id}`;
    const headerGlyph = `model-card-vision-${remoteModel.id}`;

    const expand = (getByTestId: any) => {
      act(() => {
        fireEvent.press(getByTestId('expand-details-button'));
      });
    };

    afterEach(() => {
      runInAction(() => {
        serverStore.remoteCaps = {};
      });
    });

    it('offers the expand affordance and opens the details block', async () => {
      const {getByTestId} = customRender(<ModelCard model={remoteModel} />);

      expect(getByTestId('expand-details-button')).toBeTruthy();
      expand(getByTestId);

      await waitFor(() => {
        expect(getByTestId(visionCell)).toBeTruthy();
      });
    });

    it('renders no on-device or local-file value in the expanded block', async () => {
      runInAction(() => {
        serverStore.remoteCaps = {
          [remoteModel.id]: {supportsVision: true, contextLength: 8192},
        };
      });
      const {getByTestId, queryByTestId, queryByText} = customRender(
        <ModelCard model={remoteModel} />,
      );
      expand(getByTestId);

      await waitFor(() => {
        expect(getByTestId(visionCell)).toBeTruthy();
      });

      // The estimator has no local file to measure, so this row would read
      // "Estimated memory: 0 B" — a device claim about someone else's hardware.
      expect(queryByTestId('memory-requirement')).toBeNull();
      // `author` is the server name, already in the header chip.
      expect(queryByText(l10n.en.models.modelCard.labels.author)).toBeNull();
      expect(
        queryByText(l10n.en.models.modelDescription.parameters),
      ).toBeNull();
      expect(
        queryByText(l10n.en.models.modelCard.labels.architecture),
      ).toBeNull();
      expect(queryByTestId('open-huggingface-url')).toBeNull();
      expect(queryByTestId('vision-skill-touchable')).toBeNull();

      expect(getByTestId(contextCell)).toBeTruthy();
      expect(
        queryByText(l10n.en.models.modelCard.labels.visionSupported),
      ).toBeTruthy();
    });

    it('reports vision as unknown, never unsupported, when the server has no /props', async () => {
      const {getByTestId, queryByTestId, queryByText} = customRender(
        <ModelCard model={remoteModel} />,
      );
      expand(getByTestId);

      await waitFor(() => {
        expect(getByTestId(visionCell)).toBeTruthy();
      });

      expect(
        queryByText(l10n.en.models.modelCard.labels.visionUnknown),
      ).toBeTruthy();
      expect(
        queryByText(l10n.en.models.modelCard.labels.visionNotSupported),
      ).toBeNull();
      expect(queryByTestId(contextCell)).toBeNull();
    });

    it('reflects capabilities that land while the card is already open', async () => {
      const {getByTestId, queryByTestId, queryByText} = customRender(
        <ModelCard model={remoteModel} />,
      );
      expand(getByTestId);

      await waitFor(() => {
        expect(
          queryByText(l10n.en.models.modelCard.labels.visionUnknown),
        ).toBeTruthy();
      });
      expect(queryByTestId(contextCell)).toBeNull();

      act(() => {
        runInAction(() => {
          serverStore.remoteCaps = {
            [remoteModel.id]: {supportsVision: true, contextLength: 8192},
          };
        });
      });

      expect(
        queryByText(l10n.en.models.modelCard.labels.visionSupported),
      ).toBeTruthy();
      expect(getByTestId(contextCell)).toBeTruthy();
    });

    it('keeps capability entries per model, not per server', async () => {
      runInAction(() => {
        serverStore.remoteCaps = {
          [remoteModel.id]: {supportsVision: true},
          [remoteModelSibling.id]: {supportsVision: false},
        };
      });
      const {getByTestId, queryByText} = customRender(
        <ModelCard model={remoteModelSibling} />,
      );
      expand(getByTestId);

      await waitFor(() => {
        expect(
          queryByText(l10n.en.models.modelCard.labels.visionNotSupported),
        ).toBeTruthy();
      });
    });

    it('carries the capability value in the accessibility label', async () => {
      runInAction(() => {
        serverStore.remoteCaps = {[remoteModel.id]: {supportsVision: true}};
      });
      const {getByTestId, getAllByLabelText} = customRender(
        <ModelCard model={remoteModel} />,
      );
      expand(getByTestId);

      // Header glyph and expanded cell, reading the same value — the pair is
      // the assertion, since a header that disagreed with the body would
      // otherwise still satisfy a single-match query.
      await waitFor(() => {
        expect(getAllByLabelText('Vision: Supported')).toHaveLength(2);
      });
    });

    it('announces an unresolved capability as unknown in both places', async () => {
      const {getByTestId, getAllByLabelText} = customRender(
        <ModelCard model={remoteModel} />,
      );
      expand(getByTestId);

      await waitFor(() => {
        expect(getAllByLabelText('Vision: Unknown')).toHaveLength(2);
      });
    });

    it('shows the vision glyph without the model ever being activated', () => {
      runInAction(() => {
        serverStore.remoteCaps = {[remoteModel.id]: {supportsVision: true}};
      });
      const {getByTestId} = customRender(<ModelCard model={remoteModel} />);

      expect(glyphStroke(getByTestId(headerGlyph))).toBe(
        themeFixtures.lightTheme.colors.iconModelTypeVision,
      );
    });

    it('keeps the text glyph when the server reports no vision', () => {
      runInAction(() => {
        serverStore.remoteCaps = {[remoteModel.id]: {supportsVision: false}};
      });
      const {getByTestId} = customRender(<ModelCard model={remoteModel} />);

      expect(glyphStroke(getByTestId(headerGlyph))).toBe(
        themeFixtures.lightTheme.colors.onSurfaceVariant,
      );
    });

    describe('capabilities the models list already carried', () => {
      // The card fixture id and the captured row are joined here so the store
      // derivation runs over a real body: `${serverId}/${row.id}` is the key a
      // remote card looks itself up by.
      const rowFor = (id: string, sourceId: string) => ({
        ...(routerModelsBody.data.find(r => r.id === sourceId) as any),
        id,
      });

      const listServer = (serverType?: string, rows?: any[]) => {
        runInAction(() => {
          serverStore.servers = [
            {
              id: remoteModel.serverId!,
              name: 'router',
              url: 'http://localhost:8080',
              serverType,
            },
          ];
          serverStore.serverModels.set(
            remoteModel.serverId!,
            rows ?? [rowFor(remoteModel.remoteModelId!, 'gemma-4-e2b')],
          );
        });
      };

      afterEach(() => {
        runInAction(() => {
          serverStore.servers = [];
          serverStore.serverModels.clear();
        });
      });

      it('states vision and the window without the model ever being activated', async () => {
        listServer('llama.cpp');

        const {getByTestId, queryByText} = customRender(
          <ModelCard model={remoteModel} />,
        );

        expect(glyphStroke(getByTestId(headerGlyph))).toBe(
          themeFixtures.lightTheme.colors.iconModelTypeVision,
        );
        expand(getByTestId);
        await waitFor(() => {
          expect(
            queryByText(l10n.en.models.modelCard.labels.visionSupported),
          ).toBeTruthy();
        });
        expect(getByTestId(contextCell)).toBeTruthy();
        expect(serverStore.fetchRemoteModelCaps).not.toHaveBeenCalled();
      });

      it('says not supported for a sibling the same list describes as text-only', async () => {
        listServer('llama.cpp', [
          rowFor(remoteModel.remoteModelId!, 'gemma-4-e2b'),
          rowFor(remoteModelSibling.remoteModelId!, 'gemma-3-4b'),
        ]);

        const {getByTestId, queryByText} = customRender(
          <ModelCard model={remoteModelSibling} />,
        );
        expand(getByTestId);

        await waitFor(() => {
          expect(
            queryByText(l10n.en.models.modelCard.labels.visionNotSupported),
          ).toBeTruthy();
        });
      });

      it('changes nothing visible when the model is then activated', async () => {
        listServer('llama.cpp');

        const {getByTestId, queryByText} = customRender(
          <ModelCard model={remoteModel} />,
        );
        expand(getByTestId);
        await waitFor(() => {
          expect(getByTestId(contextCell)).toBeTruthy();
        });
        const before = [
          glyphStroke(getByTestId(headerGlyph)),
          getByTestId(visionCell).props.accessibilityLabel,
          getByTestId(contextCell).props.children,
        ];

        act(() => {
          runInAction(() => {
            serverStore.remoteCaps = {
              [remoteModel.id]: {supportsVision: true, contextLength: 8192},
            };
          });
        });

        expect([
          glyphStroke(getByTestId(headerGlyph)),
          getByTestId(visionCell).props.accessibilityLabel,
          getByTestId(contextCell).props.children,
        ]).toEqual(before);
        expect(
          queryByText(l10n.en.models.modelCard.labels.visionSupported),
        ).toBeTruthy();
      });

      it('fills in when the first fetch lands, with no user action', async () => {
        // Cold start: hydration has restored the server but no list yet.
        runInAction(() => {
          serverStore.servers = [
            {
              id: remoteModel.serverId!,
              name: 'router',
              url: 'http://localhost:8080',
              serverType: 'llama.cpp',
            },
          ];
        });

        const {getByTestId, queryByTestId, queryByText} = customRender(
          <ModelCard model={remoteModel} />,
        );
        expand(getByTestId);
        await waitFor(() => {
          expect(
            queryByText(l10n.en.models.modelCard.labels.visionUnknown),
          ).toBeTruthy();
        });
        expect(queryByTestId(contextCell)).toBeNull();

        act(() => {
          runInAction(() => {
            serverStore.serverModels.set(remoteModel.serverId!, [
              rowFor(remoteModel.remoteModelId!, 'gemma-4-e2b'),
            ]);
          });
        });

        expect(
          queryByText(l10n.en.models.modelCard.labels.visionSupported),
        ).toBeTruthy();
        expect(getByTestId(contextCell)).toBeTruthy();
        expect(glyphStroke(getByTestId(headerGlyph))).toBe(
          themeFixtures.lightTheme.colors.iconModelTypeVision,
        );
      });

      it('reads nothing off a server of another type', async () => {
        listServer('Ollama');

        const {getByTestId, queryByTestId, queryByText} = customRender(
          <ModelCard model={remoteModel} />,
        );

        expect(glyphStroke(getByTestId(headerGlyph))).toBe(
          themeFixtures.lightTheme.colors.onSurfaceVariant,
        );
        expand(getByTestId);
        await waitFor(() => {
          expect(
            queryByText(l10n.en.models.modelCard.labels.visionUnknown),
          ).toBeTruthy();
        });
        expect(queryByTestId(contextCell)).toBeNull();
      });
    });

    it('gives every remote card an addressable root', () => {
      const {getByTestId} = customRender(<ModelCard model={remoteModel} />);
      expect(getByTestId(`model-card-${remoteModel.id}`)).toBeTruthy();
    });
  });

  it('renders no vision cell on a local card', async () => {
    const {getByTestId, queryByTestId} = customRender(
      <ModelCard model={downloadedModel} />,
    );

    act(() => {
      fireEvent.press(getByTestId('expand-details-button'));
    });

    await waitFor(() => {
      expect(getByTestId('memory-requirement')).toBeTruthy();
    });
    expect(
      queryByTestId(`model-card-vision-capability-${downloadedModel.filename}`),
    ).toBeNull();
  });

  it('gives a local card no spoken vision stop at all', async () => {
    const {getByTestId, queryAllByLabelText} = customRender(
      <ModelCard model={downloadedModel} />,
    );

    act(() => {
      fireEvent.press(getByTestId('expand-details-button'));
    });

    await waitFor(() => {
      expect(getByTestId('memory-requirement')).toBeTruthy();
    });
    // The local card states vision through the toggle, which is its own
    // labelled control; a second unlabelled-value announcement on the header
    // glyph would be new noise on every text model.
    expect(queryAllByLabelText(/^Vision:/)).toHaveLength(0);
  });
});
