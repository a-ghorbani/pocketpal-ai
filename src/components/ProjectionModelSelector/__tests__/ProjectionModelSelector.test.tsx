import React from 'react';
import {fireEvent, waitFor} from '@testing-library/react-native';
import {render} from '../../../../jest/test-utils';
import {ProjectionModelSelector} from '../ProjectionModelSelector';
import {createModel} from '../../../../jest/fixtures/models';

// Mock Alert
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

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
});
