import {LlamaContext} from 'llama.rn';
import {renderHook, act, waitFor} from '@testing-library/react-native';

import {textMessage} from '../../../jest/fixtures';
import {sessionFixtures} from '../../../jest/fixtures/chatSessions';
import {
  mockBasicModel,
  mockDefaultCompletionParams,
  mockLlamaContextParams,
  modelsList,
} from '../../../jest/fixtures/models';

import {useChatSession} from '../useChatSession';

import {
  chatSessionStore,
  modelStore,
  palStore,
  ttsStore,
  uiStore,
} from '../../store';

import {l10n} from '../../locales';
import {assistant} from '../../utils/chat';

const mockAssistant = {
  id: 'h3o3lc5xj',
};

beforeEach(() => {
  // Reset jest mocks' call counts without removing spies
  jest.clearAllMocks();

  // Reset mock stores to a known baseline between tests
  palStore.pals = [] as any;
  chatSessionStore.sessions = sessionFixtures as any;
  chatSessionStore.activeSessionId = 'session-1';

  // Reset model state
  modelStore.models = modelsList as any;
  modelStore.activeModelId = undefined;

  // Fresh mocked context each test
  modelStore.context = new LlamaContext(mockLlamaContextParams);

  // Set up a mock engine that delegates to context.completion
  modelStore.engine = {
    completion: jest.fn((params, onData) => {
      return modelStore.context!.completion(params, onData);
    }),
    stopCompletion: jest.fn(async () => {
      await modelStore.context?.stopCompletion();
    }),
  };
});

// Mock the applyChatTemplate function from utils/chat
const applyChatTemplateSpy = jest
  .spyOn(require('../../utils/chat'), 'applyChatTemplate')
  .mockImplementation(async () => 'mocked prompt');

describe('useChatSession', () => {
  beforeEach(() => {
    applyChatTemplateSpy.mockClear();
  });

  it('should send a message and update the chat session', async () => {
    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalled();
    expect(modelStore.context?.completion).toHaveBeenCalled();
  });

  it('should handle model not loaded scenario', async () => {
    modelStore.context = undefined;
    modelStore.engine = undefined;
    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, assistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    // TODO: fix this test:         "text": "Model not loaded. Please initialize the model.",
    expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalledWith({
      author: assistant,
      createdAt: expect.any(Number),
      id: expect.any(String),
      text: l10n.en.chat.modelNotLoaded,
      type: 'text',
      metadata: {system: true},
    });
  });

  it('should handle general errors during completion', async () => {
    const errorMessage = 'Some general error';
    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockRejectedValueOnce(new Error(errorMessage));
    }

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        text: `Completion failed: ${errorMessage}`,
        author: assistant,
      }),
    );
  });

  it('should reset the conversation', () => {
    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    result.current.handleResetConversation();

    expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        text: l10n.en.chat.conversationReset,
        author: assistant,
      }),
    );
  });

  it('should not stop completion when inferencing is false', () => {
    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    result.current.handleStopPress();

    expect(modelStore.context?.stopCompletion).not.toHaveBeenCalled();
  });

  it('handleStopPress sets isStopping immediately so the UI can gate sends', async () => {
    // Simulate a real in-flight chat: inferencing is true and the
    // engine has been wired (mock above). The stop press should:
    //   - flip isStopping to true (UI feedback + send-button gate)
    //   - leave inferencing alone (cleared later by the runner exit)
    // The cleanup of isStopping happens in the for-await loop, so it
    // is exercised in `should set inferencing correctly during send`.
    modelStore.setInferencing(true);
    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await result.current.handleStopPress();

    expect(chatSessionStore.setIsStopping).toHaveBeenCalledWith(true);
    // inferencing flag is NOT cleared by handleStopPress anymore — the
    // runner's for-await cleanup is the single owner of that.
    const calls = (chatSessionStore.setIsGenerating as jest.Mock).mock.calls;
    expect(calls.find(c => c[0] === false)).toBeUndefined();
  });

  it('should set inferencing correctly during send', async () => {
    let resolveCompletion: (value: any) => void;
    const completionPromise = new Promise(resolve => {
      resolveCompletion = resolve;
    });

    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockImplementation(() => completionPromise);
    }

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    const sendPromise = result.current.handleSendPress(textMessage);

    // Wait until inferencing flips to true (handleSendPress sets it after adding message)
    await waitFor(() => {
      expect(modelStore.inferencing).toBe(true);
    });

    // Complete the mocked completion and wait for the handler to finish
    resolveCompletion!({timings: {total: 100}, usage: {}});
    await act(async () => {
      await sendPromise;
    });
    expect(modelStore.inferencing).toBe(false);
  });

  test.each([
    {systemPrompt: undefined, shouldInclude: false, description: 'undefined'},
    {systemPrompt: '', shouldInclude: false, description: 'empty string'},
    {systemPrompt: '   ', shouldInclude: false, description: 'whitespace-only'},
    {
      systemPrompt: 'You are a helpful assistant',
      shouldInclude: true,
      description: 'valid prompt',
    },
    {
      systemPrompt: '  Trimmed prompt  ',
      shouldInclude: true,
      description: 'prompt with whitespace',
    },
  ])(
    'should handle system prompt for $description',
    async ({systemPrompt, shouldInclude}) => {
      const testModel = {
        ...mockBasicModel,
        id: 'test-model',
        chatTemplate: {...mockBasicModel.chatTemplate, systemPrompt},
      };

      modelStore.models = [testModel];
      modelStore.setActiveModel(testModel.id);

      // Mock the completion function to capture the messages passed to it
      let capturedMessages: any[] = [];
      if (modelStore.context) {
        modelStore.context.completion = jest
          .fn()
          .mockImplementation((params, _onData) => {
            capturedMessages = params.messages || [];
            return Promise.resolve({timings: {total: 100}, usage: {}});
          });
      }

      const {result} = renderHook(() =>
        useChatSession({current: null}, textMessage.author, mockAssistant),
      );

      await act(async () => {
        await result.current.handleSendPress(textMessage);
      });

      if (shouldInclude && systemPrompt?.trim()) {
        // Check that a system message was included in the messages passed to completion
        expect(capturedMessages.some(msg => msg.role === 'system')).toBe(true);
        const systemMessage = capturedMessages.find(
          msg => msg.role === 'system',
        );
        expect(systemMessage.content).toBe(systemPrompt);
      } else {
        // Check that no system message was included
        expect(capturedMessages.some(msg => msg.role === 'system')).toBe(false);
      }
    },
  );

  it('should render parametrized system prompt when pal has parameters', async () => {
    // Create a mock pal with parametrized system prompt
    const mockPal = {
      id: 'test-pal-id',
      type: 'local' as const,
      name: 'Test Pal',
      systemPrompt: 'You are {{name}}, a {{role}} in {{setting}}.',
      parameters: {
        name: 'Gandalf',
        role: 'wizard',
        setting: 'Middle-earth',
      },
      parameterSchema: [
        {key: 'name', type: 'text' as const, label: 'Name', required: true},
        {key: 'role', type: 'text' as const, label: 'Role', required: true},
        {
          key: 'setting',
          type: 'text' as const,
          label: 'Setting',
          required: true,
        },
      ],
      isSystemPromptChanged: false,
      useAIPrompt: false,
      source: 'local' as const,
    };

    // Mock palStore to return our test pal
    palStore.pals = [mockPal];

    // Create a mock session with the pal
    const mockSession = {
      id: 'test-session-id',
      activePalId: 'test-pal-id',
      title: 'Test Session',
      date: new Date().toISOString().split('T')[0], // Format: YYYY-MM-DD
      messages: [],
      completionSettings: mockDefaultCompletionParams,
      settingsSource: 'pal' as const,
    };

    // Mock chatSessionStore to return our test session
    chatSessionStore.sessions = [mockSession];
    chatSessionStore.activeSessionId = 'test-session-id';

    // Mock the completion function to capture the messages passed to it
    let capturedMessages: any[] = [];
    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockImplementation((params, _onData) => {
          capturedMessages = params.messages || [];
          return Promise.resolve({timings: {total: 100}, usage: {}});
        });
    }

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    // Check that a system message was included with the rendered template
    expect(capturedMessages.some(msg => msg.role === 'system')).toBe(true);
    const systemMessage = capturedMessages.find(msg => msg.role === 'system');
    expect(systemMessage.content).toBe(
      'You are Gandalf, a wizard in Middle-earth.',
    );
  });

  // ---------- Step 10 (TASK-20260502-2115): trim ----------
  //
  // Tests that duplicated AgentRunner-level coverage were dropped:
  //
  //   - "should save completionResult with reasoning_content after
  //     completion" (deleted in step 8 commit ad6d8b6) — replaced by
  //     runner reasoning_content tests in
  //     src/services/agent/__tests__/AgentRunner.test.ts and per-step
  //     reasoningContent assertions in chat.test.ts.
  //
  // Tests that exercise hook-specific surface — error rollback, stop
  // semantics, message persistence calls, multimodal warning, and
  // system-prompt construction — are kept above and below.

  it('emits multimodal warning when user sends an image but multimodal is disabled', async () => {
    // modelStore.isMultimodalEnabled is mocked to return false by default
    // (see __mocks__/stores/modelStore.ts). The hook should call
    // uiStore.setChatWarning with the multimodal-not-enabled message.
    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockResolvedValue({text: 'ok', content: 'ok', timings: {}});
    }
    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );
    await act(async () => {
      await result.current.handleSendPress({
        text: 'look at this',
        type: 'text',
        imageUris: ['file:///photo.jpg'],
      });
    });
    expect(uiStore.setChatWarning).toHaveBeenCalled();
    const arg = (uiStore.setChatWarning as jest.Mock).mock.calls[0][0];
    // The warning carries the multimodalNotEnabled message text.
    expect(JSON.stringify(arg)).toContain(l10n.en.chat.multimodalNotEnabled);
  });

  it('should use system prompt as-is when pal has no parameters', async () => {
    // Create a mock pal without parameters
    const mockPal = {
      id: 'test-pal-id-no-params',
      type: 'local' as const,
      name: 'Test Pal No Params',
      systemPrompt: 'You are a helpful assistant.',
      parameters: {},
      parameterSchema: [],
      isSystemPromptChanged: false,
      useAIPrompt: false,
      source: 'local' as const,
    };

    // Mock palStore to return our test pal
    palStore.pals = [mockPal];

    // Create a mock session with the pal
    const mockSession = {
      id: 'test-session-id-no-params',
      activePalId: 'test-pal-id-no-params',
      title: 'Test Session No Params',
      date: new Date().toISOString().split('T')[0], // Format: YYYY-MM-DD
      messages: [],
      completionSettings: mockDefaultCompletionParams,
      settingsSource: 'pal' as const,
    };

    // Mock chatSessionStore to return our test session
    chatSessionStore.sessions = [mockSession];
    chatSessionStore.activeSessionId = 'test-session-id-no-params';

    // Mock the completion function to capture the messages passed to it
    let capturedMessages: any[] = [];
    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockImplementation((params, _onData) => {
          capturedMessages = params.messages || [];
          return Promise.resolve({timings: {total: 100}, usage: {}});
        });
    }

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    // Check that a system message was included with the original prompt
    expect(capturedMessages.some(msg => msg.role === 'system')).toBe(true);
    const systemMessage = capturedMessages.find(msg => msg.role === 'system');
    expect(systemMessage.content).toBe('You are a helpful assistant.');
  });

  describe('TTS streaming wiring', () => {
    it('fires onAssistantMessageStart on first token and onAssistantMessageChunk per delta', async () => {
      const finalText = 'Hello world.';

      if (modelStore.context) {
        modelStore.context.completion = jest
          .fn()
          .mockImplementation(async (_params, onData) => {
            if (onData) {
              // First chunk — should trigger start + first chunk
              onData({token: 'tok', content: 'Hello '});
              // Second chunk — cumulative content; delta is "world."
              onData({token: 'tok', content: 'Hello world.'});
            }
            return {
              timings: {total: 100},
              usage: {},
              text: finalText,
              content: finalText,
              reasoning_content: '',
            };
          });
      }

      const {result} = renderHook(() =>
        useChatSession({current: null}, textMessage.author, mockAssistant),
      );

      await act(async () => {
        await result.current.handleSendPress(textMessage);
      });

      expect(ttsStore.onAssistantMessageStart).toHaveBeenCalledTimes(1);
      expect(ttsStore.onAssistantMessageChunk).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        'Hello ',
        undefined,
      );
      expect(ttsStore.onAssistantMessageChunk).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        'world.',
        undefined,
      );
    });

    it('Case A: forwards reasoning_content deltas and hadReasoning on complete', async () => {
      const finalText = 'Final answer.';

      if (modelStore.context) {
        modelStore.context.completion = jest
          .fn()
          .mockImplementation(async (_params, onData) => {
            if (onData) {
              // Reasoning-only chunks (model thinking).
              onData({token: 'tok', content: '', reasoning_content: 'Let me '});
              onData({
                token: 'tok',
                content: '',
                reasoning_content: 'Let me think.',
              });
              // Real content begins.
              onData({
                token: 'tok',
                content: 'Final answer.',
                reasoning_content: 'Let me think.',
              });
            }
            return {
              timings: {total: 100},
              usage: {},
              text: finalText,
              content: finalText,
              reasoning_content: 'Let me think.',
            };
          });
      }

      const {result} = renderHook(() =>
        useChatSession({current: null}, textMessage.author, mockAssistant),
      );

      await act(async () => {
        await result.current.handleSendPress(textMessage);
      });

      // Reasoning deltas arrive as the 3rd arg with empty content delta.
      expect(ttsStore.onAssistantMessageChunk).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        '',
        'Let me ',
      );
      expect(ttsStore.onAssistantMessageChunk).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        '',
        'think.',
      );
      expect(ttsStore.onAssistantMessageChunk).toHaveBeenNthCalledWith(
        3,
        expect.any(String),
        'Final answer.',
        undefined,
      );
      expect(ttsStore.onAssistantMessageComplete).toHaveBeenCalledWith(
        expect.any(String),
        finalText,
        {hadReasoning: true},
      );
    });

    it('fires ttsStore.onAssistantMessageComplete exactly once after completion', async () => {
      const finalText = 'the-final-text';

      if (modelStore.context) {
        modelStore.context.completion = jest
          .fn()
          .mockImplementation(async (_params, onData) => {
            if (onData) {
              onData({token: 'partial', content: finalText});
            }
            return {
              timings: {total: 100},
              usage: {},
              text: finalText,
              content: finalText,
              reasoning_content: '',
            };
          });
      }

      const {result} = renderHook(() =>
        useChatSession({current: null}, textMessage.author, mockAssistant),
      );

      await act(async () => {
        await result.current.handleSendPress(textMessage);
      });

      expect(ttsStore.onAssistantMessageComplete).toHaveBeenCalledTimes(1);
      expect(ttsStore.onAssistantMessageComplete).toHaveBeenCalledWith(
        expect.any(String),
        finalText,
        {hadReasoning: false},
      );
    });

    it('a throwing onAssistantMessageStart/Chunk does NOT kill the completion stream', async () => {
      const finalText = 'All good, final text.';

      (ttsStore.onAssistantMessageStart as jest.Mock).mockImplementationOnce(
        () => {
          throw new Error('tts start boom');
        },
      );
      (ttsStore.onAssistantMessageChunk as jest.Mock).mockImplementation(() => {
        throw new Error('tts chunk boom');
      });

      if (modelStore.context) {
        modelStore.context.completion = jest
          .fn()
          .mockImplementation(async (_params, onData) => {
            if (onData) {
              onData({token: 'tok', content: 'All good, '});
              onData({token: 'tok', content: finalText});
            }
            return {
              timings: {total: 100},
              usage: {},
              text: finalText,
              content: finalText,
              reasoning_content: '',
            };
          });
      }

      const {result} = renderHook(() =>
        useChatSession({current: null}, textMessage.author, mockAssistant),
      );

      // No throw expected — try/catch wraps the TTS hooks.
      await act(async () => {
        await result.current.handleSendPress(textMessage);
      });

      // Stream completed normally despite the TTS exceptions.
      expect(modelStore.context?.completion).toHaveBeenCalled();
      expect(ttsStore.onAssistantMessageComplete).toHaveBeenCalledWith(
        expect.any(String),
        finalText,
        {hadReasoning: false},
      );
    });

    it('a throwing onAssistantMessageComplete does NOT bubble out of handleSendPress', async () => {
      const finalText = 'done';

      (ttsStore.onAssistantMessageComplete as jest.Mock).mockImplementationOnce(
        () => {
          throw new Error('tts complete boom');
        },
      );

      if (modelStore.context) {
        modelStore.context.completion = jest
          .fn()
          .mockImplementation(async (_params, onData) => {
            if (onData) {
              onData({token: 'tok', content: finalText});
            }
            return {
              timings: {total: 100},
              usage: {},
              text: finalText,
              content: finalText,
              reasoning_content: '',
            };
          });
      }

      const {result} = renderHook(() =>
        useChatSession({current: null}, textMessage.author, mockAssistant),
      );

      await expect(
        act(async () => {
          await result.current.handleSendPress(textMessage);
        }),
      ).resolves.not.toThrow();
    });

    it('does NOT fire onAssistantMessageComplete on error paths', async () => {
      if (modelStore.context) {
        modelStore.context.completion = jest
          .fn()
          .mockRejectedValueOnce(new Error('boom'));
      }

      const {result} = renderHook(() =>
        useChatSession({current: null}, textMessage.author, mockAssistant),
      );

      await act(async () => {
        await result.current.handleSendPress(textMessage);
      });

      expect(ttsStore.onAssistantMessageComplete).not.toHaveBeenCalled();
    });
  });
});
