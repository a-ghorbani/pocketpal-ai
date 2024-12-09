import React from 'react';
import {Keyboard} from 'react-native';

import {render, fireEvent, waitFor, act} from '../../../../../jest/test-utils';

import {ModelSettings} from '../ModelSettings';

jest.useFakeTimers(); // Mock all timers

jest.mock('../../CompletionSettings', () => {
  const {Text} = require('react-native');
  return {
    CompletionSettings: () => <Text>CompletionSettings</Text>,
  };
});

describe('ModelSettings', () => {
  const mockProps = {
    chatTemplate: {
      name: 'Default Template',
      addBosToken: true,
      addEosToken: true,
      addGenerationPrompt: true,
      bosToken: '<|START|>',
      eosToken: '<|END|>',
      chatTemplate: 'User: {{prompt}}\nAssistant:',
      systemPrompt: 'You are a helpful assistant',
    },
    completionSettings: {},
    isActive: false,
    onChange: jest.fn(),
    onCompletionSettingsChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Keyboard, 'dismiss');
  });

  it('renders correctly with initial props', () => {
    const {getByText, getByPlaceholderText} = render(
      <ModelSettings {...mockProps} />,
    );

    expect(getByText('Use BOS')).toBeTruthy();
    expect(getByText('Use EOS')).toBeTruthy();
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

  it('toggles chips correctly', async () => {
    const {getByText} = render(<ModelSettings {...mockProps} />);

    const bosChip = getByText('Use BOS');
    await act(async () => {
      fireEvent.press(bosChip);
    });

    expect(mockProps.onChange).toHaveBeenCalledWith('addBosToken', false);
  });

  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('opens and closes the template dialog', async () => {
    const {getByText, queryByText} = render(<ModelSettings {...mockProps} />);

    // Open dialog
    const editButton = getByText('Edit');
    await act(() => {
      fireEvent.press(editButton);
    });

    // Wait for dialog to be visible
    await waitFor(() => {
      expect(getByText('Save')).toBeTruthy();
      expect(getByText('Cancel')).toBeTruthy();
    });

    const cancelButton = getByText('Cancel');
    await act(() => {
      fireEvent.press(cancelButton);
    });

    // Wait for dialog to be hidden
    await waitFor(
      () => {
        expect(queryByText('Save')).toBeNull();
      },
      {
        timeout: 10000,
      },
    );
  }, 15000);

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
      fireEvent.press(getByText('Save'));
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

  it('toggles advanced settings accordion', async () => {
    const {getByText} = render(<ModelSettings {...mockProps} />);

    const accordion = getByText('Generation Settings');
    await act(async () => {
      fireEvent.press(accordion);
    });

    await waitFor(() => {
      expect(getByText('CompletionSettings')).toBeTruthy();
    });
  });
});
