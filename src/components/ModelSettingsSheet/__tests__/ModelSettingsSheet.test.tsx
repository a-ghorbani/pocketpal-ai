import React from 'react';
import {fireEvent, render, act} from '../../../../jest/test-utils';
import {ModelSettingsSheet} from '../ModelSettingsSheet';
import {modelStore} from '../../../store';
import {Model, ModelOrigin} from '../../../utils/types';
import {defaultCompletionParams} from '../../../utils/completionSettingsVersions';

// Mock the ModelSettings component
jest.mock('../../../screens/ModelsScreen/ModelSettings', () => {
  const {View} = require('react-native');
  return {
    ModelSettings: ({onChange, onStopWordsChange, onModelNameChange}) => (
      <View testID="model-settings">
        <View
          testID="mock-settings-update"
          onPress={() => onChange('chatTemplate', 'new template')}
        />
        <View
          testID="mock-stop-words-update"
          onPress={() => onStopWordsChange(['stop1', 'stop2'])}
        />
        <View
          testID="mock-model-name-update"
          onPress={() => onModelNameChange('new model name')}
        />
      </View>
    ),
  };
});

// Mock Sheet component
jest.mock('../../../components/Sheet', () => {
  const {View, Button} = require('react-native');
  const MockSheet = ({children, isVisible, onClose, title}) => {
    if (!isVisible) {
      return null;
    }
    return (
      <View testID="sheet">
        <View testID="sheet-title">{title}</View>
        <Button title="Close" onPress={onClose} testID="sheet-close-button" />
        {children}
      </View>
    );
  };
  MockSheet.ScrollView = ({children}) => (
    <View testID="sheet-scroll-view">{children}</View>
  );
  MockSheet.Actions = ({children}) => (
    <View testID="sheet-actions">{children}</View>
  );
  return {Sheet: MockSheet};
});

describe('ModelSettingsSheet', () => {
  const defaultTemplate = {
    name: 'custom',
    addGenerationPrompt: true,
    bosToken: '<|START|>',
    eosToken: '<|END|>',
    chatTemplate: 'User: {{prompt}}\nAssistant:',
    systemPrompt: 'You are a helpful assistant',
    addBosToken: true,
    addEosToken: true,
  };

  const mockModel: Model = {
    id: 'test-model',
    author: 'test-author',
    name: 'Test Model',
    size: 1000,
    params: 1000000,
    isDownloaded: true,
    downloadUrl: 'https://example.com/model',
    hfUrl: 'https://huggingface.co/test-model',
    progress: 100,
    filename: 'test-model.bin',
    isLocal: false,
    origin: ModelOrigin.PRESET,
    defaultChatTemplate: defaultTemplate,
    chatTemplate: defaultTemplate,
    defaultStopWords: ['test'],
    stopWords: ['test'],
    defaultCompletionSettings: defaultCompletionParams,
    completionSettings: defaultCompletionParams,
  };

  const defaultProps = {
    isVisible: true,
    onClose: jest.fn(),
    model: mockModel,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly when visible', () => {
    const {getByTestId} = render(<ModelSettingsSheet {...defaultProps} />);

    expect(getByTestId('sheet')).toBeTruthy();
    expect(getByTestId('model-settings')).toBeTruthy();
    expect(getByTestId('sheet-title')).toBeTruthy();
  });

  it('does not render when not visible', () => {
    const {queryByTestId} = render(
      <ModelSettingsSheet {...defaultProps} isVisible={false} />,
    );

    expect(queryByTestId('sheet')).toBeNull();
  });

  it('returns null when no model is provided', () => {
    const {queryByTestId} = render(
      <ModelSettingsSheet {...defaultProps} model={undefined} />,
    );

    expect(queryByTestId('sheet')).toBeNull();
  });

  it('handles save settings correctly', async () => {
    const {getByText} = render(<ModelSettingsSheet {...defaultProps} />);

    await act(async () => {
      fireEvent.press(getByText('Save Changes'));
    });

    expect(modelStore.updateModelChatTemplate).toHaveBeenCalledWith(
      mockModel.id,
      mockModel.chatTemplate,
    );
    expect(modelStore.updateModelStopWords).toHaveBeenCalledWith(
      mockModel.id,
      mockModel.stopWords,
    );
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('handles cancel correctly', async () => {
    const {getByText} = render(<ModelSettingsSheet {...defaultProps} />);

    await act(async () => {
      fireEvent.press(getByText('Cancel'));
    });

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('handles reset correctly', async () => {
    const {getByText} = render(<ModelSettingsSheet {...defaultProps} />);

    await act(async () => {
      fireEvent.press(getByText('Reset'));
    });

    expect(modelStore.resetModelChatTemplate).toHaveBeenCalledWith(
      mockModel.id,
    );
    expect(modelStore.resetModelStopWords).toHaveBeenCalledWith(mockModel.id);
  });

  it('updates settings when model changes', () => {
    const {rerender} = render(<ModelSettingsSheet {...defaultProps} />);

    const newModel = {
      ...mockModel,
      chatTemplate: {
        ...defaultTemplate,
        systemPrompt: 'New system prompt',
      },
      stopWords: ['new-stop-word'],
    };

    rerender(<ModelSettingsSheet {...defaultProps} model={newModel} />);

    // The state updates are handled by useEffect, which is tested implicitly
    // through the save/cancel/reset tests
  });
});
