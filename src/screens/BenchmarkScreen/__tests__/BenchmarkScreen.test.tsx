import React from 'react';

import {cloneDeep} from 'lodash';
import {LlamaContext} from '@pocketpalai/llama.rn';

import {submitBenchmark} from '../../../api/benchmark';

import {
  act,
  fireEvent,
  render,
  waitFor,
  waitForElementToBeRemoved,
} from '../../../../jest/test-utils';
import {
  mockResult,
  mockSubmittedResult,
} from '../../../../jest/fixtures/benchmark';

import {BenchmarkScreen} from '../BenchmarkScreen';

import {benchmarkStore, modelStore, uiStore} from '../../../store';
import {mockContextModel} from '../../../../jest/fixtures/models';

jest.mock('../../../api/benchmark', () => ({
  submitBenchmark: jest.fn().mockResolvedValue(undefined),
}));

describe('BenchmarkScreen', () => {
  beforeEach(() => {
    benchmarkStore.results = [
      cloneDeep(mockResult),
      cloneDeep(mockSubmittedResult),
    ];
    jest.clearAllMocks();

    // Reset modelStore state to avoid cross-test leakage
    modelStore.isContextLoading = false;
    modelStore.loadingModel = undefined;
    modelStore.activeModelId = undefined;
    modelStore.context = undefined;

    // Ensure initContext has a resolved default implementation
    (modelStore.initContext as jest.Mock).mockReset?.();
    (modelStore.initContext as jest.Mock).mockResolvedValue(Promise.resolve());
  });

  describe('Model Initialization', () => {
    it('should show loading indicator during model initialization', async () => {
      const initPromise = new Promise(resolve => setTimeout(resolve, 100));
      (modelStore.initContext as jest.Mock).mockReturnValue(initPromise);
      modelStore.isContextLoading = true;
      modelStore.loadingModel = modelStore.models[0];

      const {getByTestId} = render(<BenchmarkScreen />);

      // Verify loading indicator is shown
      expect(getByTestId('loading-indicator-model-init')).toBeDefined();

      // Wait for initialization to complete
      await initPromise;
    });

    it('should hide loading indicator after model initialization completes', async () => {
      // Loading context
      modelStore.isContextLoading = true;
      modelStore.loadingModel = modelStore.models[0];

      const {getByTestId, queryByTestId} = render(<BenchmarkScreen />);
      expect(getByTestId('loading-indicator-model-init')).toBeDefined();

      // Complete loading
      await act(async () => {
        modelStore.isContextLoading = false;
        modelStore.loadingModel = undefined;
      });

      // Verify loading indicator is removed
      await waitFor(
        () => {
          expect(queryByTestId('loading-indicator-model-init')).toBeNull();
        },
        {timeout: 5000},
      );
    });

    it('should show model selector with available models', () => {
      const {getByText} = render(<BenchmarkScreen />);

      // Open model selector
      fireEvent.press(getByText('Select Model'));

      // Verify available models are shown
      modelStore.availableModels.forEach(model => {
        expect(getByText(model.name)).toBeDefined();
      });
    });

    it('should initialize model when selected', async () => {
      const {getByText} = render(<BenchmarkScreen />);
      const modelToSelect = modelStore.availableModels[0];

      // Open model selector and select a model
      fireEvent.press(getByText('Select Model'));
      fireEvent.press(getByText(modelToSelect.name));

      // Verify initContext was called
      expect(modelStore.initContext).toHaveBeenCalledWith(modelToSelect);
    });
  });

  describe('Benchmark Execution', () => {
    it('handles submission of benchmark results', async () => {
      const {getByTestId} = render(<BenchmarkScreen />);

      const submitButton = getByTestId('submit-benchmark-button');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByTestId('share-benchmark-dialog')).toBeDefined();
      });

      const confirmButton = getByTestId(
        'share-benchmark-dialog-confirm-button',
      );
      fireEvent.press(confirmButton);

      await waitFor(() => {
        expect(submitBenchmark).toHaveBeenCalled();
      });
    });

    it('should show benchmark loading indicator during execution', async () => {
      modelStore.activeModelId = modelStore.models[0].id;
      modelStore.context = new LlamaContext({
        contextId: 1,
        gpu: false,
        reasonNoGPU: '',
        model: mockContextModel,
      });

      const {getByText, getByTestId} = render(<BenchmarkScreen />);

      // Start benchmark
      fireEvent.press(getByTestId('start-test-button'));

      expect(getByTestId('loading-indicator-benchmark')).toBeDefined();
      expect(getByText('Please keep this screen open.')).toBeDefined();
    });

    it('should disable start button during benchmark execution', async () => {
      modelStore.activeModelId = modelStore.models[0].id;
      modelStore.context = new LlamaContext({
        contextId: 1,
        gpu: false,
        reasonNoGPU: '',
        model: mockContextModel,
      });
      const {getByTestId} = render(<BenchmarkScreen />);
      const startButton = getByTestId('start-test-button');

      // Start benchmark
      fireEvent.press(startButton);

      console.log(startButton.props.accessibilityState.disabled);
      await waitFor(() => {
        expect(startButton.props.accessibilityState.disabled).toBe(true);
      });
    });
  });

  describe('Memory Usage Tracking', () => {
    beforeAll(() => {});

    it('should display memory usage in results', async () => {
      const result = {
        ...mockResult,
        peakMemoryUsage: {
          total: 8 * 1000 * 1000 * 1000,
          used: 4 * 1000 * 1000 * 1000,
          percentage: 50,
        },
      };
      benchmarkStore.results = [result];

      const {getByText} = render(<BenchmarkScreen />);

      // Verify memory usage display
      expect(getByText('Peak Memory')).toBeDefined();
      expect(getByText('50.0%')).toBeDefined();
      expect(getByText('4 GB / 8 GB')).toBeDefined();
    });
  });

  describe('Advanced Settings', () => {
    it('should apply preset configurations correctly', async () => {
      modelStore.activeModelId = modelStore.models[0].id;
      modelStore.context = new LlamaContext({
        contextId: 1,
        gpu: false,
        reasonNoGPU: '',
        model: mockContextModel,
      });

      const {getByText, getByTestId} = render(<BenchmarkScreen />);

      // Open advanced settings
      fireEvent.press(getByTestId('advanced-settings-button'));
      await waitFor(() =>
        expect(getByTestId('advanced-settings-dialog')).toBeDefined(),
      );

      // Select Fast preset
      fireEvent.press(getByText('Fast'));

      // Verify preset values
      await waitFor(() => {
        const ppSlider = getByTestId('pp-slider');
        const tgSlider = getByTestId('tg-slider');
        expect(ppSlider.props.value).toBe(1);
        expect([0, undefined]).toContain(tgSlider.props.value); // slider could be undefined if it is zero or minimum value?
      });
    });
  });

  describe('Device Info Integration', () => {
    it('renders device info card', () => {
      const {getByText} = render(<BenchmarkScreen />);
      expect(getByText('Device Information')).toBeDefined();
    });

    it('should include device info in benchmark submission', async () => {
      const {getByTestId} = render(<BenchmarkScreen />);

      // Wait for device info to be collected
      await waitFor(() => {
        expect(getByTestId('device-info-card')).toBeDefined();
      });

      // Trigger benchmark submission
      const submitButton = getByTestId('submit-benchmark-button');
      fireEvent.press(submitButton);

      const confirmButton = getByTestId(
        'share-benchmark-dialog-confirm-button',
      );
      fireEvent.press(confirmButton);

      // Verify device info is included in submission
      await waitFor(() => {
        expect(submitBenchmark).toHaveBeenCalledWith(
          expect.objectContaining({
            model: expect.any(String),
            systemName: expect.any(String),
            systemVersion: expect.any(String),
          }),
          expect.any(Object),
        );
      });
    });
  });

  describe('Share Dialog Preferences', () => {
    it('should respect "dont show again" preference when is false', async () => {
      benchmarkStore.results = [
        cloneDeep(mockResult),
        cloneDeep(mockSubmittedResult),
        cloneDeep(mockResult),
      ];
      // Force to show confirm dialog
      uiStore.benchmarkShareDialog.shouldShow = true;

      const {getByTestId, queryByTestId, getAllByTestId} = render(
        <BenchmarkScreen />,
      );

      // Trigger share
      const submitButton = getAllByTestId('submit-benchmark-button')[0];
      fireEvent.press(submitButton);

      // Wait for the dialog to appear
      await waitFor(() => {
        expect(getByTestId('share-benchmark-dialog')).toBeDefined();
      });

      // Set "don't show again"
      const checkbox = getByTestId('dont-show-again-checkbox');
      fireEvent.press(checkbox);

      // Confirm share
      const confirmButton = getByTestId(
        'share-benchmark-dialog-confirm-button',
      );
      fireEvent.press(confirmButton);

      // wait for the submission to be called
      await waitFor(() => {
        expect(submitBenchmark).toHaveBeenCalled();
      });

      await waitForElementToBeRemoved(
        () => getByTestId('share-benchmark-dialog'),
        {
          timeout: 5000,
        },
      );

      // wait for the dialog to be closed
      await waitFor(
        () => {
          expect(queryByTestId('share-benchmark-dialog')).toBeNull();
        },
        {timeout: 5000},
      );

      // Verify preference was saved
      expect(uiStore.setBenchmarkShareDialogPreference).toHaveBeenCalledWith(
        false,
      );

      // Since the store is mock we need to manually set the state
      uiStore.benchmarkShareDialog.shouldShow = false;

      // Share another result
      const submitButton2 = getByTestId('submit-benchmark-button');
      fireEvent.press(submitButton2);

      expect(queryByTestId('share-benchmark-dialog')).toBeNull();
    });

    it('should respect "dont show again" preference when is true', async () => {
      benchmarkStore.results = [
        cloneDeep(mockResult),
        cloneDeep(mockSubmittedResult),
        cloneDeep(mockResult),
      ];
      uiStore.benchmarkShareDialog.shouldShow = true;
      const {getByTestId, queryByTestId, getAllByTestId} = render(
        <BenchmarkScreen />,
      );

      // Trigger share
      const submitButton = getAllByTestId('submit-benchmark-button')[0];
      fireEvent.press(submitButton);

      // Wait for the dialog to appear
      await waitFor(() => {
        expect(getByTestId('share-benchmark-dialog')).toBeDefined();
      });

      // Confirm share
      const confirmButton = getByTestId(
        'share-benchmark-dialog-confirm-button',
      );
      fireEvent.press(confirmButton);

      // wait for the submission to be called
      await waitFor(() => {
        expect(submitBenchmark).toHaveBeenCalled();
      });

      await act(async () => {
        benchmarkStore.results = [mockResult, mockSubmittedResult];
      });

      // wait for the dialog to be closed
      await waitForElementToBeRemoved(
        () => queryByTestId('share-benchmark-dialog'),
        {timeout: 4000},
      );

      // Since the store is mock we need to manually set the state
      uiStore.benchmarkShareDialog.shouldShow = true;

      // Share another result
      const submitButton2 = getByTestId('submit-benchmark-button');
      fireEvent.press(submitButton2);

      await waitFor(() => {
        expect(getByTestId('share-benchmark-dialog')).toBeDefined();
      });
    });

    it('should show raw data in share dialog', async () => {
      const {getByTestId, getByText} = render(<BenchmarkScreen />);

      // Trigger share
      const submitButton = getByTestId('submit-benchmark-button');
      fireEvent.press(submitButton);

      // Show raw data
      const viewRawDataButton = getByTestId(
        'share-benchmark-dialog-view-raw-data-button',
      );
      fireEvent.press(viewRawDataButton);

      // Verify raw data is shown
      await waitFor(() => {
        expect(
          getByTestId('share-benchmark-dialog-raw-data-container'),
        ).toBeDefined();
      });
      expect(getByText(/"deviceInfo":/)).toBeDefined();
      expect(getByText(/"benchmark":/)).toBeDefined();
    });
  });

  describe('Result Management', () => {
    it('renders benchmark results when available', async () => {
      benchmarkStore.results = [mockResult];
      const {getByText} = render(<BenchmarkScreen />);

      await waitFor(() => {
        expect(getByText('Test Results')).toBeDefined();
        expect(getByText(mockResult.modelName)).toBeDefined();
      });
    });

    it('should delete individual result', async () => {
      // Add results to store
      benchmarkStore.results = [mockResult, mockSubmittedResult];

      const {getAllByTestId, getByText} = render(<BenchmarkScreen />);

      // Delete first result
      const deleteButtons = getAllByTestId('delete-result-button');
      fireEvent.press(deleteButtons[0]);

      // Confirm deletion
      fireEvent.press(getByText('Delete'));

      // Verify deletion
      expect(benchmarkStore.removeResult).toHaveBeenCalledWith(
        mockResult.timestamp,
      );
    });

    it('should cancel result deletion', async () => {
      // Add results to store
      benchmarkStore.results = [mockResult];

      const {getAllByTestId, getByText} = render(<BenchmarkScreen />);

      // Attempt to delete result
      const deleteButtons = getAllByTestId('delete-result-button');
      fireEvent.press(deleteButtons[0]);

      // Cancel deletion
      fireEvent.press(getByText('Cancel'));

      // Verify result was not deleted
      expect(benchmarkStore.removeResult).not.toHaveBeenCalled();
    });

    it('allows clearing all results after confirmation', async () => {
      benchmarkStore.results = [mockResult];
      const {getByTestId} = render(<BenchmarkScreen />);

      // Click clear all button
      const clearButton = getByTestId('clear-all-button');
      fireEvent.press(clearButton);

      // Confirm in the dialog
      const confirmButton = getByTestId('clear-all-dialog-confirm-button');
      fireEvent.press(confirmButton);

      expect(benchmarkStore.results.length).toBe(0);
    });

    it('should clear all results', async () => {
      // Add results to store
      benchmarkStore.results = [mockResult, mockSubmittedResult];

      const {getByTestId} = render(<BenchmarkScreen />);

      // Clear all results
      const clearAllButton = getByTestId('clear-all-button');
      fireEvent.press(clearAllButton);

      // Confirm clear all
      const confirmButton = getByTestId('clear-all-dialog-confirm-button');
      fireEvent.press(confirmButton);

      // Verify all results were cleared
      expect(benchmarkStore.clearResults).toHaveBeenCalled();
    });

    it('keeps results if clear all is cancelled', async () => {
      benchmarkStore.results = [mockResult];
      const {getByTestId} = render(<BenchmarkScreen />);

      // Click clear all button
      const clearButton = getByTestId('clear-all-button');
      fireEvent.press(clearButton);

      // Cancel in the dialog
      const cancelButton = getByTestId('clear-all-dialog-cancel-button');
      fireEvent.press(cancelButton);

      expect(benchmarkStore.results.length).toBe(1);
    });
  });
});
