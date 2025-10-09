import React from 'react';

import {LlamaContext} from '@pocketpalai/llama.rn';
import {
  render as baseRender,
  fireEvent,
  act,
  waitFor,
} from '../../../../jest/test-utils';
import {ChatScreen} from '../ChatScreen';

import {chatSessionStore, modelStore} from '../../../store';

import {l10n} from '../../../utils/l10n';
import {mockContextModel} from '../../../../jest/fixtures/models';

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {withBottomSheetProvider: true, ...options});

describe('ChatScreen', () => {
  let llamaRN;

  beforeEach(() => {
    jest.clearAllMocks();
    llamaRN = require('@pocketpalai/llama.rn');
  });

  it('renders correctly when model is not loaded', () => {
    const {getByPlaceholderText} = render(<ChatScreen />, {
      withNavigation: true,
    });
    expect(getByPlaceholderText(l10n.en.chat.modelNotLoaded)).toBeTruthy();
  });

  it('renders correctly when model is loading', () => {
    modelStore.isContextLoading = true;
    const {getByPlaceholderText} = render(<ChatScreen />, {
      withNavigation: true,
    });
    expect(getByPlaceholderText(l10n.en.chat.loadingModel)).toBeTruthy();
  });

  it('renders correctly when model is loaded', () => {
    modelStore.context = new LlamaContext({
      contextId: 1,
      gpu: false,
      reasonNoGPU: '',
      model: mockContextModel,
    });
    const {getByPlaceholderText} = render(<ChatScreen />, {
      withNavigation: true,
    });
    expect(getByPlaceholderText(l10n.en.chat.typeYourMessage)).toBeTruthy();
  });

  it('handles sending a message', async () => {
    modelStore.context = new LlamaContext({
      contextId: 1,
      gpu: false,
      reasonNoGPU: '',
      model: mockContextModel,
    });
    modelStore.context.completion = jest.fn().mockResolvedValue({
      timings: {predicted_per_token_ms: 10, predicted_per_second: 100},
    });

    const {getByPlaceholderText, getByTestId} = render(<ChatScreen />, {
      withNavigation: true,
    });
    const input = getByPlaceholderText(l10n.en.chat.typeYourMessage);

    await act(async () => {
      fireEvent.changeText(input, 'Hello, PocketPal AI!');
    });

    const sendButton = getByTestId('send-button');
    fireEvent.press(sendButton);

    await waitFor(() => {
      expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalledWith(
        expect.objectContaining({
          author: expect.objectContaining({id: 'y9d7f8pgn'}),
          text: 'Hello, PocketPal AI!',
        }),
      );
    });

    await waitFor(() => {
      expect(modelStore.context).toBeTruthy();
      if (modelStore.context) {
        expect(modelStore.context.completion).toHaveBeenCalled();
      }
    });
  });

  it('handles sending a message failure', async () => {
    modelStore.context = new LlamaContext({
      contextId: 1,
      gpu: false,
      reasonNoGPU: '',
      model: mockContextModel,
    });
    modelStore.context.completion = jest
      .fn()
      .mockRejectedValue(new Error('Completion failed'));

    const {getByPlaceholderText, getByTestId} = render(<ChatScreen />, {
      withNavigation: true,
    });
    const input = getByPlaceholderText(l10n.en.chat.typeYourMessage);

    await act(async () => {
      fireEvent.changeText(input, 'Hello, PocketPal!');
    });

    const sendButton = getByTestId('send-button');
    await act(async () => {
      fireEvent.press(sendButton);
    });

    expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        author: expect.objectContaining({id: 'h3o3lc5xj'}),
        text: 'Completion failed: Completion failed',
        metadata: expect.objectContaining({system: true}),
      }),
    );
  });

  it('renders different message types correctly', async () => {
    modelStore.context = new LlamaContext({
      contextId: 1,
      gpu: false,
      reasonNoGPU: '',
      model: mockContextModel,
    });
    jest
      .spyOn(chatSessionStore, 'currentSessionMessages', 'get')
      .mockReturnValue([
        {
          id: 'unique-message-id-1',
          author: {id: 'y9d7f8pgn'},
          text: 'User message',
          type: 'text',
        },
        {
          id: 'unique-message-id-2',
          author: {id: 'h3o3lc5xj'},
          text: 'Assistant message',
          type: 'text',
        },
        {
          id: 'unique-message-id-3',
          author: {id: 'system'},
          text: 'System message',
          type: 'text',
        },
      ]);

    const {getByText} = render(<ChatScreen />, {
      withNavigation: true,
    });

    expect(getByText('User message')).toBeTruthy();
    expect(getByText('Assistant message')).toBeTruthy();
    expect(getByText('System message')).toBeTruthy();
  });

  it('stops ongoing completion when stop button is pressed', async () => {
    modelStore.context = new llamaRN.LlamaContext({
      contextId: 1,
      gpu: false,
      reasonNoGPU: '',
      model: {},
    });
    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockReturnValue(new Promise(() => {})); // Never resolves
    }

    const {getByPlaceholderText, getByTestId} = render(<ChatScreen />, {
      withNavigation: true,
    });
    const input = getByPlaceholderText(l10n.en.chat.typeYourMessage);

    await act(async () => {
      fireEvent.changeText(input, 'Hello, AI!');
    });

    await act(async () => {
      const sendButton = getByTestId('send-button');
      fireEvent.press(sendButton);
      modelStore.setInferencing(true); // since mock doesn't really set inferencing
    });

    await waitFor(
      () => {
        expect(getByTestId('stop-button')).toBeTruthy();
      },
      {
        timeout: 1000,
      },
    );

    const stopButton = getByTestId('stop-button');
    await act(async () => {
      fireEvent.press(stopButton);
    });

    expect(modelStore.context?.stopCompletion).toHaveBeenCalled();
  });
});
