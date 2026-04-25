import Clipboard from '@react-native-clipboard/clipboard';
import {renderHook, act} from '@testing-library/react-hooks';

import {textMessage, user} from '../../../jest/fixtures';
import {createModel} from '../../../jest/fixtures/models';

import {useMessageActions} from '../useMessageActions';

import {chatSessionStore, modelStore} from '../../store';

jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}));

describe('useMessageActions', () => {
  const mockSetInputText = jest.fn();
  const mockHandleSendPress = jest.fn();
  const messages = [
    {
      ...textMessage,
      id: '1',
      text: 'Hello',
      author: user,
    },
    {
      ...textMessage,
      id: '2',
      text: 'Hi there',
      author: {id: 'assistant'},
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('copies message text to clipboard', () => {
    const {result} = renderHook(() =>
      useMessageActions({
        user,
        messages,
        handleSendPress: mockHandleSendPress,
        setInputText: mockSetInputText,
      }),
    );

    act(() => {
      result.current.handleCopy({
        ...textMessage,
        text: 'Copy this text',
        type: 'text',
      });
    });

    expect(Clipboard.setString).toHaveBeenCalledWith('Copy this text');
  });

  it('enters edit mode for user message', () => {
    const {result} = renderHook(() =>
      useMessageActions({
        user,
        messages,
        handleSendPress: mockHandleSendPress,
        setInputText: mockSetInputText,
      }),
    );

    const userMessage = {
      ...textMessage,
      id: 'test-id',
      text: 'Edit this message',
      author: user,
      type: 'text' as const,
    };

    act(() => {
      result.current.handleEdit(userMessage);
    });

    expect(chatSessionStore.enterEditMode).toHaveBeenCalledWith('test-id');
    expect(mockSetInputText).toHaveBeenCalledWith('Edit this message');
  });

  it('does not enter edit mode for assistant message', () => {
    const {result} = renderHook(() =>
      useMessageActions({
        user,
        messages,
        handleSendPress: mockHandleSendPress,
        setInputText: mockSetInputText,
      }),
    );

    const assistantMessage = {
      ...textMessage,
      author: {id: 'assistant'},
      type: 'text' as const,
    };

    act(() => {
      result.current.handleEdit(assistantMessage);
    });

    expect(chatSessionStore.enterEditMode).not.toHaveBeenCalled();
    expect(mockSetInputText).not.toHaveBeenCalled();
  });

  describe('handleTryAgain', () => {
    it('resubmits user message', async () => {
      const {result} = renderHook(() =>
        useMessageActions({
          user,
          messages,
          handleSendPress: mockHandleSendPress,
          setInputText: mockSetInputText,
        }),
      );

      const userMessage = {
        ...textMessage,
        id: '1',
        text: 'Try again with this',
        author: user,
        type: 'text' as const,
      };

      await act(async () => {
        await result.current.handleTryAgain(userMessage);
      });

      expect(chatSessionStore.removeMessagesFromId).toHaveBeenCalledWith(
        '1',
        true,
      );
      expect(mockHandleSendPress).toHaveBeenCalledWith({
        text: 'Try again with this',
        type: 'text',
      });
    });

    it('resubmits last user message when retrying assistant message', async () => {
      const _messages = [
        {
          ...textMessage,
          id: '2',
          text: 'Assistant response',
          author: {id: 'assistant'},
          type: 'text' as const,
        },
        {
          ...textMessage,
          id: '1',
          text: 'User message',
          author: user,
          type: 'text' as const,
        },
      ];

      const {result} = renderHook(() =>
        useMessageActions({
          user,
          messages: _messages,
          handleSendPress: mockHandleSendPress,
          setInputText: mockSetInputText,
        }),
      );

      await act(async () => {
        await result.current.handleTryAgain(_messages[1]);
      });

      expect(chatSessionStore.removeMessagesFromId).toHaveBeenCalledWith(
        '1',
        true,
      );
      expect(mockHandleSendPress).toHaveBeenCalledWith({
        text: 'User message',
        type: 'text',
      });
    });
  });

  describe('handleTryAgainWith', () => {
    it('uses current model if model ID matches', async () => {
      const {result} = renderHook(() =>
        useMessageActions({
          user,
          messages,
          handleSendPress: mockHandleSendPress,
          setInputText: mockSetInputText,
        }),
      );

      modelStore.activeModelId = 'model-1';

      await act(async () => {
        await result.current.handleTryAgainWith('model-1', messages[0]);
      });

      expect(modelStore.selectModel).not.toHaveBeenCalled();
      expect(chatSessionStore.removeMessagesFromId).toHaveBeenCalled();
      expect(mockHandleSendPress).toHaveBeenCalled();
    });

    it('initializes new model if model ID differs', async () => {
      const {result} = renderHook(() =>
        useMessageActions({
          user,
          messages,
          handleSendPress: mockHandleSendPress,
          setInputText: mockSetInputText,
        }),
      );

      modelStore.activeModelId = 'model-1';
      modelStore.models = [
        createModel({id: 'model-2', name: 'Model 2', isDownloaded: true}),
      ];

      await act(async () => {
        await result.current.handleTryAgainWith('model-2', messages[0]);
      });

      expect(modelStore.selectModel).toHaveBeenCalled();
      expect(chatSessionStore.removeMessagesFromId).toHaveBeenCalled();
      expect(mockHandleSendPress).toHaveBeenCalled();
    });
  });
});
