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

  // ---------- Story Test Requirements (Interaction) #1–#6 on AssistantTurn ----------

  describe('AssistantTurn interactions', () => {
    const assistantId = 'assistant';
    const userMsg = {
      id: 'u-1',
      type: 'text' as const,
      text: 'What is 2+2?',
      author: user,
      createdAt: 0,
    };
    const turnSingle = {
      id: 't-1',
      type: 'assistant_turn' as const,
      author: {id: assistantId},
      createdAt: 1,
      steps: [{content: 'It is 4'}],
    };
    const turnMulti = {
      id: 't-2',
      type: 'assistant_turn' as const,
      author: {id: assistantId},
      createdAt: 2,
      steps: [{content: 'Let me calculate that'}, {content: 'The answer is 4'}],
    };

    it('#1 handleCopy(legacy Text) → clipboard contains message.text (regression guard)', () => {
      const {result} = renderHook(() =>
        useMessageActions({
          user,
          messages: [userMsg, turnSingle],
          handleSendPress: mockHandleSendPress,
          setInputText: mockSetInputText,
        }),
      );
      act(() => {
        result.current.handleCopy({
          ...textMessage,
          text: 'classic',
          type: 'text',
        });
      });
      expect(Clipboard.setString).toHaveBeenCalledWith('classic');
    });

    it('#2 handleCopy(single-step AssistantTurn) → clipboard contains step[0].content', () => {
      const {result} = renderHook(() =>
        useMessageActions({
          user,
          messages: [userMsg, turnSingle],
          handleSendPress: mockHandleSendPress,
          setInputText: mockSetInputText,
        }),
      );
      act(() => {
        result.current.handleCopy(turnSingle);
      });
      expect(Clipboard.setString).toHaveBeenCalledWith('It is 4');
    });

    it('#3 handleCopy(multi-step AssistantTurn) → clipboard contains preamble + final answer joined', () => {
      const {result} = renderHook(() =>
        useMessageActions({
          user,
          messages: [userMsg, turnMulti],
          handleSendPress: mockHandleSendPress,
          setInputText: mockSetInputText,
        }),
      );
      act(() => {
        result.current.handleCopy(turnMulti);
      });
      expect(Clipboard.setString).toHaveBeenCalledWith(
        'Let me calculate that\n\nThe answer is 4',
      );
    });

    it('#4 handleEdit(AssistantTurn) → no-op (single source of truth: type === text early return)', () => {
      const {result} = renderHook(() =>
        useMessageActions({
          user,
          messages: [turnSingle],
          handleSendPress: mockHandleSendPress,
          setInputText: mockSetInputText,
        }),
      );
      act(() => {
        result.current.handleEdit(turnSingle);
      });
      expect(chatSessionStore.enterEditMode).not.toHaveBeenCalled();
      expect(mockSetInputText).not.toHaveBeenCalled();
    });

    it('#5 handleTryAgain(AssistantTurn) → walks back to previous user message and resends', async () => {
      // Newer messages first per the chat list convention. The
      // assistant turn id is 't-2'; the user message that triggered it
      // is at a later index.
      const messageList = [turnMulti, userMsg];
      const {result} = renderHook(() =>
        useMessageActions({
          user,
          messages: messageList,
          handleSendPress: mockHandleSendPress,
          setInputText: mockSetInputText,
        }),
      );
      await act(async () => {
        await result.current.handleTryAgain(turnMulti);
      });
      expect(chatSessionStore.removeMessagesFromId).toHaveBeenCalledWith(
        'u-1',
        true,
      );
      expect(mockHandleSendPress).toHaveBeenCalledWith({
        text: 'What is 2+2?',
        type: 'text',
      });
    });

    it('#6 handleTryAgainWith(AssistantTurn) → parameter accepted, same walk-back behavior', async () => {
      const messageList = [turnMulti, userMsg];
      modelStore.activeModelId = 'model-1';
      const {result} = renderHook(() =>
        useMessageActions({
          user,
          messages: messageList,
          handleSendPress: mockHandleSendPress,
          setInputText: mockSetInputText,
        }),
      );
      await act(async () => {
        await result.current.handleTryAgainWith('model-1', turnMulti);
      });
      expect(chatSessionStore.removeMessagesFromId).toHaveBeenCalledWith(
        'u-1',
        true,
      );
      expect(mockHandleSendPress).toHaveBeenCalledWith({
        text: 'What is 2+2?',
        type: 'text',
      });
    });
  });
});
