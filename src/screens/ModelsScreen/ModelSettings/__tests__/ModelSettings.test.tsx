import React from 'react';
import {Keyboard} from 'react-native';

import {render, fireEvent, waitFor, act} from '../../../../../jest/test-utils';

import {ModelSettings} from '../ModelSettings';
import {mockCompletionParams} from '../../../../../jest/fixtures/models';

jest.useFakeTimers(); // Mock all timers

jest.mock('../../CompletionSettings', () => {
  const {Text} = require('react-native');
  return {
    CompletionSettings: () => <Text>CompletionSettings</Text>,
  };
});

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
    chatTemplate: defaultTemplate,
    stopWords: [],
    onChange: jest.fn(),
    onStopWordsChange: jest.fn(),
    onCompletionSettingsChange: jest.fn(),
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
    jest.spyOn(Keyboard, 'dismiss');
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

  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('opens and closes the template dialog', async () => {
    const {getByText, queryByText} = render(<ModelSettings {...mockProps} />);

    // Open dialog
    await act(() => {
      fireEvent.press(getByText('Edit'));
    });

    // Wait for dialog to be visible
    await waitFor(() => {
      expect(getByText('Close')).toBeTruthy();
    });

    // Press Close button
    await act(() => {
      fireEvent.press(getByText('Close'));
    });

    // Wait for dialog to be hidden
    await waitFor(() => {
      expect(queryByText('Close')).toBeNull();
    });
  });

  it('saves template changes', async () => {
    const {getByText, getByPlaceholderText} = render(
      <ModelSettings {...mockProps} />,
    );

    // Open dialog
    await act(async () => {
      fireEvent.press(getByText('Edit'));
    });

    const templateInput = getByPlaceholderText(
      'Enter your chat template here...',
    );
    const newTemplate = 'New Template Content';
    await act(async () => {
      fireEvent.changeText(templateInput, newTemplate);
    });

    await act(async () => {
      fireEvent.press(getByText('Close'));
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

  it('dismisses keyboard when tapping outside inputs', async () => {
    const {getByTestId} = render(<ModelSettings {...mockProps} />);

    await act(async () => {
      fireEvent(getByTestId('settings-container'), 'press');
    });

    expect(Keyboard.dismiss).toHaveBeenCalled();
  });

  it('handles stop words additions and removals', () => {
    const {getByTestId, getAllByRole} = render(
      <ModelSettings {...mockProps} />,
    );

    // Test adding new stop word
    const stopInput = getByTestId('stop-input');
    fireEvent.changeText(stopInput, 'newstop');
    fireEvent(stopInput, 'submitEditing');

    expect(mockProps.onStopWordsChange).toHaveBeenCalledWith(['newstop']);

    // Test removing stop word
    const closeButtons = getAllByRole('button', {name: /close/i});
    fireEvent.press(closeButtons[0]);

    expect(mockProps.onStopWordsChange).toHaveBeenCalledWith(
      (mockCompletionParams.stop ?? []).filter(word => word !== '<stop1>'),
    );
  });
});
