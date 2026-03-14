import React from 'react';

import {render, fireEvent} from '@testing-library/react-native';

import {ChatTemplatePicker} from '../ChatTemplatePicker';

jest.useFakeTimers();

jest.mock('../../../../utils/chat', () => {
  const actual = jest.requireActual('../../../../utils/chat');
  return {
    ...actual,
    chatTemplateOptions: ['template1', 'template2'],
    getChatTemplateDisplayName: (key: string) =>
      key === 'template1' ? 'Template 1' : 'Template 2',
  };
});

describe('ChatTemplatePicker', () => {
  it('renders correctly with initial value', () => {
    const {getByText, getByTestId} = render(
      <ChatTemplatePicker
        selectedTemplateName="template1"
        handleChatTemplateNameChange={jest.fn()}
      />,
    );

    expect(getByText('Base Template:')).toBeTruthy();
    expect(getByTestId('text_input').props.value).toBe('Template 1');
  });

  it('displays the correct templates in the picker', () => {
    const {getByText, getByTestId} = render(
      <ChatTemplatePicker
        selectedTemplateName="template2"
        handleChatTemplateNameChange={jest.fn()}
      />,
    );

    expect(getByText('Base Template:')).toBeTruthy();
    expect(getByTestId('text_input').props.value).toBe('Template 2');
  });

  it('calls handleChatTemplateNameChange when a template is selected', () => {
    const mockHandleChatTemplateNameChange = jest.fn();
    const {getByTestId} = render(
      <ChatTemplatePicker
        selectedTemplateName="template1"
        handleChatTemplateNameChange={mockHandleChatTemplateNameChange}
      />,
    );

    const textInput = getByTestId('text_input');
    fireEvent(textInput, 'onValueChange', 'template2');
    expect(mockHandleChatTemplateNameChange).toHaveBeenCalledWith('template2');
  });
});
