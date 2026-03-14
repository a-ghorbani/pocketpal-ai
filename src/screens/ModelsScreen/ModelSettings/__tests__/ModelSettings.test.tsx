import React from 'react';

import {render, fireEvent, act} from '../../../../../jest/test-utils';

import {ModelSettings} from '../ModelSettings';

describe('ModelSettings', () => {
  const defaultTemplate = {
    name: 'Default Template',
    addBosToken: true,
    addEosToken: true,
    addGenerationPrompt: true,
    bosToken: '<|START|>',
    eosToken: '<|END|>',
    chatTemplate: 'User: {{prompt}}\nAssistant:',
    systemPrompt: 'You are a helpful assistant',
  };

  const mockProps = {
    modelName: 'test-model',
    chatTemplate: defaultTemplate,
    stopWords: [] as string[],
    onChange: jest.fn(),
    onStopWordsChange: jest.fn(),
    onCompletionSettingsChange: jest.fn(),
    onModelNameChange: jest.fn(),
    isActive: false,
    onFocus: jest.fn(),
  };

  beforeEach(() => {
    // Reset all properties to initial values
    mockProps.chatTemplate = {...defaultTemplate};
    mockProps.stopWords = [];
    mockProps.isActive = false;

    // Create fresh mocks for all function props
    mockProps.onChange = jest.fn();
    mockProps.onStopWordsChange = jest.fn();

    jest.clearAllMocks();
  });

  it('renders correctly with initial props', () => {
    const {getByText, getByPlaceholderText} = render(
      <ModelSettings {...mockProps} />,
    );

    expect(getByText('BOS')).toBeTruthy();
    expect(getByText('EOS')).toBeTruthy();
    expect(getByText('Add Generation Prompt')).toBeTruthy();
    expect(getByPlaceholderText('BOS Token')).toBeTruthy();
    expect(getByPlaceholderText('EOS Token')).toBeTruthy();
  });

  it('allows editing model name input', async () => {
    const {getByDisplayValue} = render(<ModelSettings {...mockProps} />);

    // Find the model name input by its current value
    const modelNameInput = getByDisplayValue('test-model');

    // Verify input is NOT disabled (can be edited)
    expect(modelNameInput.props.editable).not.toBe(false);

    // Simulate user typing
    await act(async () => {
      fireEvent.changeText(modelNameInput, 'My Custom Name');
    });

    // Verify the change handler was called
    expect(mockProps.onModelNameChange).toHaveBeenCalledWith('My Custom Name');
  });

  it('handles BOS token changes', async () => {
    const {getByPlaceholderText} = render(<ModelSettings {...mockProps} />);

    const bosInput = getByPlaceholderText('BOS Token');
    await act(async () => {
      fireEvent.changeText(bosInput, '<|NEW_START|>');
    });

    expect(mockProps.onChange).toHaveBeenCalledWith(
      'bosToken',
      '<|NEW_START|>',
    );
  });

  it('handles EOS token changes', async () => {
    const {getByPlaceholderText} = render(<ModelSettings {...mockProps} />);

    const eosInput = getByPlaceholderText('EOS Token');
    await act(async () => {
      fireEvent.changeText(eosInput, '<|NEW_END|>');
    });

    expect(mockProps.onChange).toHaveBeenCalledWith('eosToken', '<|NEW_END|>');
  });

  it('toggles BOS switch correctly', async () => {
    const {getByTestId} = render(<ModelSettings {...mockProps} />);

    const bosSwitch = getByTestId('BOS-switch');

    await act(async () => {
      fireEvent(bosSwitch, 'valueChange', false);
    });

    expect(mockProps.onChange).toHaveBeenCalledWith('addBosToken', false);
  });

  it('updates template changes inline', async () => {
    const {getByTestId} = render(<ModelSettings {...mockProps} />);

    const templateInput = getByTestId('template-editor-input');
    const newTemplate = 'New Template Content';
    await act(async () => {
      fireEvent.changeText(templateInput, newTemplate);
    });

    expect(mockProps.onChange).toHaveBeenCalledWith(
      'chatTemplate',
      newTemplate,
    );
  });

  it('handles system prompt changes', async () => {
    const {getByTestId} = render(<ModelSettings {...mockProps} />);

    const systemPromptInput = getByTestId('system-prompt-input');
    const newPrompt = 'New system prompt';
    await act(async () => {
      fireEvent.changeText(systemPromptInput, newPrompt);
    });
    await act(async () => {
      fireEvent(systemPromptInput, 'blur');
    });

    expect(mockProps.onChange).toHaveBeenCalledWith('systemPrompt', newPrompt);
  });

  it('shows the prompt template section inline', () => {
    const {getByText, getByTestId} = render(<ModelSettings {...mockProps} />);

    expect(getByText('Prompt Template')).toBeTruthy();
    expect(getByTestId('template-editor-input')).toBeTruthy();
  });

  it('handles stop words additions and removals', () => {
    const {getByTestId} = render(<ModelSettings {...mockProps} />);

    // Test adding new stop word
    const stopInput = getByTestId('stop-input');
    fireEvent.changeText(stopInput, 'newstop');
    fireEvent(stopInput, 'submitEditing');

    expect(mockProps.onStopWordsChange).toHaveBeenCalledWith(['newstop']);

    // Mock existing stop words
    mockProps.stopWords = ['<stop1>'];
    const {getAllByRole} = render(<ModelSettings {...mockProps} />);

    // Test removing stop word using chip close button
    const closeButtons = getAllByRole('button', {name: /close/i});
    fireEvent.press(closeButtons[0]);

    expect(mockProps.onStopWordsChange).toHaveBeenCalledWith([]);
  });
});
