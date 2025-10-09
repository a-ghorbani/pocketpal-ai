import React from 'react';
import {Alert} from 'react-native';

import * as RNFS from '@dr.pogodin/react-native-fs';
import DocumentPicker from 'react-native-document-picker';
import {
  fireEvent,
  render as baseRender,
  waitFor,
  act,
} from '../../../../jest/test-utils';

import {ModelsScreen} from '../ModelsScreen';

import {modelStore, uiStore} from '../../../store';
import {
  basicModel,
  downloadedModel,
  hfModel1,
  hfModel2,
} from '../../../../jest/fixtures/models';

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {
    withBottomSheetProvider: true,
    withNavigation: true,
    ...options,
  });

jest.useFakeTimers();

describe('ModelsScreen', () => {
  beforeEach(() => {
    //(useTheme as jest.Mock).mockReturnValue(mockTheme);
    jest.clearAllMocks();
  });

  it('renders correctly', async () => {
    const {getByTestId} = render(<ModelsScreen />);
    expect(getByTestId('flat-list')).toBeTruthy();
    expect(getByTestId('fab-group')).toBeTruthy();
  });

  it('refreshes models on pull-to-refresh', async () => {
    const {getByTestId} = render(<ModelsScreen />);

    const flatList = getByTestId('flat-list');
    const refreshControl = flatList.props.refreshControl;
    await act(async () => {
      refreshControl.props.onRefresh();
    });

    expect(modelStore.refreshDownloadStatuses).toHaveBeenCalled();
  });

  it('opens HF model search when the HF FAB is pressed', async () => {
    const {getByTestId} = render(<ModelsScreen />);

    // Open the FAB group
    const fabGroup = getByTestId('fab-group');
    fireEvent.press(fabGroup);

    // Wait for the FAB group to open and its children to be accessible
    await waitFor(() => {
      const hfFab = getByTestId('hf-fab', {includeHiddenElements: true});
      expect(hfFab).toBeTruthy();
    });
    const hfFab = getByTestId('hf-fab', {includeHiddenElements: true});

    await act(async () => {
      fireEvent.press(hfFab);
    });

    // Verify HFModelSearch is rendered
    await waitFor(() => {
      const hfModelSearch = getByTestId('hf-model-search-view');
      expect(hfModelSearch).toBeTruthy();
    });
  });

  it('adds a local model when the plus FAB is pressed', async () => {
    (DocumentPicker.pick as jest.Mock).mockResolvedValue([
      {
        uri: '/mock/file/path',
        name: 'mockModelFile.bin',
      },
    ]);

    // Mock RNFS.exists to return false for the destination path so no alert is shown
    (RNFS.exists as jest.Mock).mockImplementation(async (path: string) => {
      if (path.includes('/path/to/documents/models/local/mockModelFile.bin')) {
        return false; // File doesn't exist, so no alert will be shown
      }
      return true; // Other paths exist by default
    });

    const {getByTestId} = render(<ModelsScreen />);

    // Open the FAB group
    const fabGroup = getByTestId('fab-group');
    fireEvent.press(fabGroup);

    // Wait for the FAB group to open and its children to be accessible
    await waitFor(() => {
      const localFab = getByTestId('local-fab', {includeHiddenElements: true});
      expect(localFab).toBeTruthy();
    });
    const addLocalModelButton = getByTestId('local-fab', {
      includeHiddenElements: true,
    });

    await act(async () => {
      if (addLocalModelButton) {
        fireEvent.press(addLocalModelButton);
      }
    });

    await waitFor(() => {
      expect(DocumentPicker.pick).toHaveBeenCalled();
      expect(RNFS.copyFile).toHaveBeenCalledWith(
        '/mock/file/path',
        '/path/to/documents/models/local/mockModelFile.bin',
      );
      expect(modelStore.addLocalModel).toHaveBeenCalledWith(
        '/path/to/documents/models/local/mockModelFile.bin',
      );
    });
  });

  it('shows a confirmation alert if file already exists and replaces it', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (DocumentPicker.pick as jest.Mock).mockResolvedValue([
      {
        uri: '/mock/file/path',
        name: 'mockModelFile.bin',
      },
    ]);

    jest.spyOn(Alert, 'alert').mockImplementation((_, __, buttons) => {
      buttons![0].onPress!();
    });

    const {getByTestId} = render(<ModelsScreen />);

    // Open the FAB group
    const fabGroup = getByTestId('fab-group');
    fireEvent.press(fabGroup);

    // Wait for the FAB group to open and its children to be accessible
    await waitFor(() => {
      const localFab = getByTestId('local-fab', {includeHiddenElements: true});
      expect(localFab).toBeTruthy();
    });
    const addLocalModelButton = getByTestId('local-fab', {
      includeHiddenElements: true,
    });

    await act(async () => {
      fireEvent.press(addLocalModelButton);
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
      expect(RNFS.unlink).toHaveBeenCalledWith(
        '/path/to/documents/models/local/mockModelFile.bin',
      );
      expect(RNFS.copyFile).toHaveBeenCalled();
      expect(modelStore.addLocalModel).toHaveBeenCalled();
    });
  });

  it('does not replace or copy the file when user cancels the action', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (DocumentPicker.pick as jest.Mock).mockResolvedValue([
      {
        uri: '/mock/file/path',
        name: 'mockModelFile.bin',
      },
    ]);

    jest.spyOn(Alert, 'alert').mockImplementation((_, __, buttons) => {
      // pressing "Cancel"
      buttons![2].onPress!();
    });

    const {getByTestId} = render(<ModelsScreen />);
    // Open the FAB group
    const fabGroup = getByTestId('fab-group');
    fireEvent.press(fabGroup);

    // Wait for the FAB group to open and its children to be accessible
    await waitFor(() => {
      const localFab = getByTestId('local-fab', {includeHiddenElements: true});
      expect(localFab).toBeTruthy();
    });
    const addLocalModelButton = getByTestId('local-fab', {
      includeHiddenElements: true,
    });

    await act(async () => {
      fireEvent.press(addLocalModelButton);
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
      expect(RNFS.unlink).not.toHaveBeenCalled(); // File should not be unlinked (deleted)
      expect(RNFS.copyFile).not.toHaveBeenCalled(); // File should not be copied
      expect(modelStore.addLocalModel).not.toHaveBeenCalled(); // Model should not be added
    });
  });

  it('keeps both files when user chooses to keep both', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValueOnce(true); // File already exists
    (DocumentPicker.pick as jest.Mock).mockResolvedValue([
      {
        uri: '/mock/file/path',
        name: 'mockModelFile.bin',
      },
    ]);

    jest.spyOn(Alert, 'alert').mockImplementation((_, __, buttons) => {
      // pressing "Keep Both"
      buttons![1].onPress!();
    });

    let counter = 1;
    (RNFS.exists as jest.Mock).mockImplementation(async path => {
      if (path.includes(`mockModelFile_${counter}.bin`)) {
        return false; // Ensure new file doesn't exist
      }
      return true; // Original file exists
    });

    const {getByTestId} = render(<ModelsScreen />);

    // Open the FAB group
    const fabGroup = getByTestId('fab-group');
    fireEvent.press(fabGroup);

    // Wait for the FAB group to open and its children to be accessible
    await waitFor(() => {
      const localFab = getByTestId('local-fab', {includeHiddenElements: true});
      expect(localFab).toBeTruthy();
    });
    const addLocalModelButton = getByTestId('local-fab', {
      includeHiddenElements: true,
    });

    await act(async () => {
      fireEvent.press(addLocalModelButton);
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
      expect(RNFS.unlink).not.toHaveBeenCalled(); // Original file should not be deleted
      expect(RNFS.copyFile).toHaveBeenCalledWith(
        '/mock/file/path',
        `/path/to/documents/models/local/mockModelFile_${counter}.bin`,
      );
      expect(modelStore.addLocalModel).toHaveBeenCalledWith(
        `/path/to/documents/models/local/mockModelFile_${counter}.bin`,
      );
    });
  });

  // Add tests for model filtering and grouping
  describe('Model filtering and grouping', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Set up mock models
      modelStore.models = [downloadedModel, basicModel, hfModel1, hfModel2];
    });

    it('should filter downloaded models when downloaded filter is active', async () => {
      uiStore.pageStates.modelsScreen.filters = ['downloaded'];

      const {getByText, queryByText} = render(<ModelsScreen />);

      await waitFor(() => {
        expect(getByText('downloaded model')).toBeTruthy();
        expect(queryByText('basic model')).toBeNull();
      });
    });

    it('should filter HF models when HF filter is active', async () => {
      uiStore.pageStates.modelsScreen.filters = ['hf'];

      const {getByText, queryByText} = render(<ModelsScreen />);

      // Open the Available to Download group, since hf mocked models are not downloaded.
      const button = getByText('Available to Download');
      fireEvent.press(button);

      await waitFor(() => {
        expect(getByText('hf-model-name-1')).toBeTruthy();
        expect(queryByText('basic model')).toBeNull();
      });
    });

    it('should group models by type when grouped filter is active', async () => {
      uiStore.pageStates.modelsScreen.filters = ['grouped'];

      const {getByText} = render(<ModelsScreen />);

      await waitFor(() => {
        expect(getByText('Test Model Type')).toBeTruthy();
      });
    });

    it('should group models into ready-to-use and available-to-download when not grouped', async () => {
      uiStore.pageStates.modelsScreen.filters = [];

      const {getByText} = render(<ModelsScreen />);

      await waitFor(() => {
        expect(getByText('Ready to Use')).toBeTruthy();
        expect(getByText('Available to Download')).toBeTruthy();
      });
    });

    it('should handle group expansion and collapse', async () => {
      uiStore.pageStates.modelsScreen.filters = [];

      const {getByText, queryByText} = render(<ModelsScreen />);

      // Not downloaded model should not be visible
      await waitFor(() => {
        expect(queryByText('basic model')).toBeNull();
      });

      const availableGroup = getByText('Available to Download');
      fireEvent.press(availableGroup);

      // Not downloaded model should be visible after expanding the group
      await waitFor(() => {
        expect(getByText('basic model')).toBeTruthy();
      });
    });
  });
});
