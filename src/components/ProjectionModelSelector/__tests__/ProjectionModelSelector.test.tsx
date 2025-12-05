import React from 'react';
import {Alert} from 'react-native';

import {fireEvent, waitFor} from '@testing-library/react-native';

import {render} from '../../../../jest/test-utils';
import {createModel} from '../../../../jest/fixtures/models';

import {ProjectionModelSelector} from '../ProjectionModelSelector';

describe('ProjectionModelSelector', () => {
  const mockModel = createModel({
    id: 'test-model-1',
    name: 'Test Vision Model',
    supportsMultimodal: true,
    compatibleProjectionModels: ['proj-model-1', 'proj-model-2'],
    defaultProjectionModel: 'proj-model-1',
  });

  const mockProjectionModel1 = createModel({
    id: 'proj-model-1',
    name: 'Projection Model 1',
    isDownloaded: true,
  });

  const mockProjectionModel2 = createModel({
    id: 'proj-model-2',
    name: 'Projection Model 2',
    isDownloaded: false,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Visibility and Rendering', () => {
    it('should not render for models that do not support multimodal', () => {
      const nonMultimodalModel = createModel({
        id: 'non-multimodal',
        name: 'Regular Model',
        supportsMultimodal: false,
      });

      const {queryByTestId} = render(
        <ProjectionModelSelector model={nonMultimodalModel} />,
      );

      expect(queryByTestId('projection-model-selector')).toBeNull();
    });

    it('should display available projection models to the user', () => {
      const {getByText} = render(
        <ProjectionModelSelector
          model={mockModel}
          context="search"
          availableProjectionModels={[
            mockProjectionModel1,
            mockProjectionModel2,
          ]}
          initialExpanded={true}
        />,
      );

      expect(getByText('Projection Model 1')).toBeTruthy();
      expect(getByText('Projection Model 2')).toBeTruthy();
    });

    it('should show empty state when no compatible models are available', () => {
      const {getByText} = render(
        <ProjectionModelSelector
          model={mockModel}
          context="search"
          availableProjectionModels={[]}
          initialExpanded={true}
        />,
      );

      // Should show "no compatible models" message
      expect(getByText(/no compatible/i)).toBeTruthy();
    });
  });

  describe('Model Selection', () => {
    it('should call onProjectionModelSelect when user selects a model', () => {
      const mockCallback = jest.fn();

      const {getAllByTestId} = render(
        <ProjectionModelSelector
          model={mockModel}
          context="search"
          availableProjectionModels={[mockProjectionModel1]}
          onProjectionModelSelect={mockCallback}
          showDownloadActions={true}
          initialExpanded={true}
        />,
      );

      const selectButtons = getAllByTestId('select-projection-model-button');
      fireEvent.press(selectButtons[0]);

      expect(mockCallback).toHaveBeenCalledWith('proj-model-1');
    });
  });

  describe('Expand/Collapse Behavior', () => {
    it('should toggle expansion when user taps the header', async () => {
      const {getByTestId, queryAllByTestId} = render(
        <ProjectionModelSelector
          model={mockModel}
          context="search"
          availableProjectionModels={[
            mockProjectionModel1,
            mockProjectionModel2,
          ]}
          initialExpanded={true}
        />,
      );

      // Initially expanded - models should be visible
      expect(queryAllByTestId('projection-model-item').length).toBe(2);

      // Tap header to collapse
      const header = getByTestId('projection-model-selector-header');
      fireEvent.press(header);

      // Models should be hidden
      await waitFor(() => {
        expect(queryAllByTestId('projection-model-item').length).toBe(0);
      });
    });

    it('should start expanded when initialExpanded is true', () => {
      const {queryByTestId} = render(
        <ProjectionModelSelector
          model={mockModel}
          context="search"
          availableProjectionModels={[mockProjectionModel1]}
          initialExpanded={true}
        />,
      );

      // Models should be visible
      expect(queryByTestId('projection-model-item')).toBeTruthy();
    });
  });

  describe('Delete Handler Logic', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Spy on Alert.alert
      jest.spyOn(Alert, 'alert');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should prevent deletion of active projection model', () => {
      const {modelStore} = require('../../../store');
      modelStore.activeModelId = 'proj-model-1';
      modelStore.getDownloadedLLMsUsingProjectionModel = jest
        .fn()
        .mockReturnValue([]);

      const {getByTestId} = render(
        <ProjectionModelSelector
          model={mockModel}
          context="search"
          availableProjectionModels={[mockProjectionModel1]}
          showDownloadActions={true}
          initialExpanded={true}
        />,
      );

      // Find and press the delete button
      const deleteButton = getByTestId('delete-projection-model-button');
      fireEvent.press(deleteButton);

      // Verify Alert was called with cannot delete message
      expect(Alert.alert).toHaveBeenCalledWith(
        'Cannot Delete',
        'This projection model is currently active.',
        [{text: 'OK', style: 'default'}],
      );

      // Verify delete was NOT called
      expect(modelStore.deleteModel).not.toHaveBeenCalled();
    });

    it('should show warning when deleting projection model with dependent models', () => {
      const {modelStore} = require('../../../store');
      modelStore.activeModelId = null;

      // Mock dependent models
      const dependentModel = createModel({
        id: 'llm-1',
        name: 'Dependent LLM',
        visionEnabled: true,
      });

      modelStore.getDownloadedLLMsUsingProjectionModel = jest
        .fn()
        .mockReturnValue([dependentModel]);
      modelStore.deleteModel = jest.fn().mockResolvedValue(undefined);

      const {getByTestId} = render(
        <ProjectionModelSelector
          model={mockModel}
          context="search"
          availableProjectionModels={[mockProjectionModel1]}
          showDownloadActions={true}
          initialExpanded={true}
        />,
      );

      // Find and press the delete button
      const deleteButton = getByTestId('delete-projection-model-button');
      fireEvent.press(deleteButton);

      // Verify Alert was called with warning about dependent models
      expect(Alert.alert).toHaveBeenCalledWith(
        'Delete Projection Model',
        expect.stringContaining('Dependent LLM'),
        expect.arrayContaining([
          {text: 'Cancel', style: 'cancel'},
          expect.objectContaining({
            text: 'Delete',
            style: 'destructive',
          }),
        ]),
      );
    });

    it('should disable vision on dependent models before deletion', async () => {
      const {modelStore} = require('../../../store');
      modelStore.activeModelId = null;

      const dependentModel1 = createModel({
        id: 'llm-1',
        name: 'Dependent LLM 1',
        visionEnabled: true,
      });
      const dependentModel2 = createModel({
        id: 'llm-2',
        name: 'Dependent LLM 2',
        visionEnabled: true,
      });

      // Create mock functions and store them
      const mockSetModelVisionEnabled = jest.fn();
      const mockDeleteModel = jest.fn().mockResolvedValue(undefined);

      modelStore.getDownloadedLLMsUsingProjectionModel = jest
        .fn()
        .mockReturnValue([dependentModel1, dependentModel2]);
      modelStore.deleteModel = mockDeleteModel;
      modelStore.setModelVisionEnabled = mockSetModelVisionEnabled;

      // Mock Alert to auto-confirm deletion
      (Alert.alert as jest.Mock).mockImplementation(
        (title: string, message: string, buttons: any[]) => {
          // Find and execute the delete button callback
          const deleteButton = buttons.find(
            (b: any) => b.style === 'destructive',
          );
          if (deleteButton?.onPress) {
            deleteButton.onPress();
          }
        },
      );

      const {getByTestId} = render(
        <ProjectionModelSelector
          model={mockModel}
          context="search"
          availableProjectionModels={[mockProjectionModel1]}
          showDownloadActions={true}
          initialExpanded={true}
        />,
      );

      // Press the delete button to trigger the deletion flow
      const deleteButton = getByTestId('delete-projection-model-button');
      fireEvent.press(deleteButton);

      // Wait for async operations to complete
      await waitFor(() => {
        // Verify setModelVisionEnabled was called for each dependent model
        expect(mockSetModelVisionEnabled).toHaveBeenCalledWith('llm-1', false);
        expect(mockSetModelVisionEnabled).toHaveBeenCalledWith('llm-2', false);
      });

      // Verify deleteModel was called after disabling vision
      expect(mockDeleteModel).toHaveBeenCalledWith(mockProjectionModel1);
    });

    it('should handle deletion errors gracefully', async () => {
      const {modelStore} = require('../../../store');
      modelStore.activeModelId = null;

      const deletionError = new Error('Failed to delete file');
      modelStore.getDownloadedLLMsUsingProjectionModel = jest
        .fn()
        .mockReturnValue([]);
      modelStore.deleteModel = jest.fn().mockRejectedValue(deletionError);

      // Track Alert calls
      const alertCalls: any[] = [];
      (Alert.alert as jest.Mock).mockImplementation(
        (title: string, message: string, buttons: any[]) => {
          alertCalls.push({title, message, buttons});
          const deleteButton = buttons?.find(
            (b: any) => b.style === 'destructive',
          );
          if (deleteButton?.onPress) {
            // Execute the onPress (it will handle the error internally)
            deleteButton.onPress();
          }
        },
      );

      const {getByTestId} = render(
        <ProjectionModelSelector
          model={mockModel}
          context="search"
          availableProjectionModels={[mockProjectionModel1]}
          showDownloadActions={true}
          initialExpanded={true}
        />,
      );

      // Press the delete button
      const deleteButton = getByTestId('delete-projection-model-button');
      fireEvent.press(deleteButton);

      // Wait for error alert to be shown
      await waitFor(() => {
        // First alert is the confirmation dialog
        expect(alertCalls[0].title).toBe('Delete Projection Model');

        // Second alert should be the error message
        expect(alertCalls[1].title).toBe('Cannot Delete');
        expect(alertCalls[1].message).toBe('Failed to delete file');
      });

      // Verify deleteModel was called
      expect(modelStore.deleteModel).toHaveBeenCalled();
    });

    it('should call checkSpaceAndDownload when download button is pressed', () => {
      const {modelStore} = require('../../../store');
      modelStore.checkSpaceAndDownload = jest.fn();

      const notDownloadedModel = createModel({
        id: 'proj-model-3',
        name: 'Not Downloaded Model',
        isDownloaded: false,
        progress: 0,
      });

      const {getByTestId} = render(
        <ProjectionModelSelector
          model={mockModel}
          context="search"
          availableProjectionModels={[notDownloadedModel]}
          showDownloadActions={true}
          initialExpanded={true}
        />,
      );

      // Find and press the download button
      const downloadButton = getByTestId('download-projection-model-button');
      fireEvent.press(downloadButton);

      // Verify checkSpaceAndDownload was called with the correct model ID
      expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledWith(
        'proj-model-3',
      );
    });
  });
});
