import {LlamaContext} from 'llama.rn';
import {renderHook, act, waitFor} from '@testing-library/react-native';
import {runInAction} from 'mobx';

import {textMessage} from '../../../jest/fixtures';
import {sessionFixtures} from '../../../jest/fixtures/chatSessions';
import {
  mockBasicModel,
  mockDefaultCompletionParams,
  mockLlamaContextParams,
  modelsList,
} from '../../../jest/fixtures/models';

import {useChatSession} from '../useChatSession';
import {isReadUrlAllowed} from '../../services/talents';

import {
  chatSessionStore,
  modelStore,
  palStore,
  serverStore,
  ttsStore,
  uiStore,
} from '../../store';

import {l10n} from '../../locales';
import {assistant} from '../../utils/chat';
import {ModelOrigin} from '../../utils/types';
import type {RouterFailure} from '../../utils/routerState';
import {RemoteModelRequestWithdrawnError} from '../../utils/errors';

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

  describe('remote model readiness', () => {
    const readiness = () =>
      modelStore.ensureActiveRemoteModelReady as jest.Mock;

    /** Enough turns for the send path to reach the readiness call. */
    const settleMicrotasks = async () => {
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
    };

    it('holds the send until the server reports the model ready', async () => {
      let reportReady: (outcome: string) => void = () => {};
      readiness().mockReturnValueOnce(
        new Promise<string>(resolve => {
          reportReady = resolve;
        }),
      );

      const {result} = renderHook(() =>
        useChatSession({current: null}, textMessage.author, mockAssistant),
      );

      let send: Promise<void> = Promise.resolve();
      await act(async () => {
        send = result.current.handleSendPress(textMessage);
        await settleMicrotasks();
      });

      expect(readiness()).toHaveBeenCalled();
      expect(modelStore.context?.completion).not.toHaveBeenCalled();

      await act(async () => {
        reportReady('ready');
        await send;
      });

      expect(modelStore.context?.completion).toHaveBeenCalled();
    });

    const bindTo = (reason?: RouterFailure) => {
      modelStore.activeRemoteBinding = {
        modelId: 'srv-1/alpha',
        serverId: 'srv-1',
        remoteModelId: 'alpha',
        url: 'http://desktop:8080',
      } as any;
      serverStore.routerReasons = reason ? {'srv-1/alpha': reason} : {};
    };

    afterEach(() => {
      modelStore.activeRemoteBinding = undefined;
      serverStore.routerReasons = {};
    });

    it('sends nothing and renders the record the operation left', async () => {
      readiness().mockResolvedValueOnce('failed');
      bindTo({cause: 'load-failed'});

      const {result} = renderHook(() =>
        useChatSession({current: null}, textMessage.author, mockAssistant),
      );

      await act(async () => {
        await result.current.handleSendPress(textMessage);
      });

      expect(modelStore.context?.completion).not.toHaveBeenCalled();
      expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalledWith(
        expect.objectContaining({
          text: l10n.en.settings.routerModels.loadFailed,
          author: assistant,
          metadata: {system: true},
        }),
      );
    });

    // Stopping the load is the user's own act, so they know why the turn did
    // not run. Recognised as an outcome, not guessed at from a missing record.
    it('sends nothing and says nothing when the user withdrew the request', async () => {
      readiness().mockResolvedValueOnce('withdrawn');
      bindTo(undefined);

      const {result} = renderHook(() =>
        useChatSession({current: null}, textMessage.author, mockAssistant),
      );

      await act(async () => {
        await result.current.handleSendPress(textMessage);
      });

      expect(modelStore.context?.completion).not.toHaveBeenCalled();
      expect(
        chatSessionStore.addMessageToCurrentSession,
      ).not.toHaveBeenCalledWith(
        expect.objectContaining({metadata: {system: true}}),
      );
    });

    // A failure that left no record is not a withdrawal: the turn is still
    // waiting and is owed an account of why it stopped.
    it('sends nothing and names the wait when a failure left no record', async () => {
      readiness().mockResolvedValueOnce('failed');
      bindTo(undefined);

      const {result} = renderHook(() =>
        useChatSession({current: null}, textMessage.author, mockAssistant),
      );

      await act(async () => {
        await result.current.handleSendPress(textMessage);
      });

      expect(modelStore.context?.completion).not.toHaveBeenCalled();
      expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalledWith(
        expect.objectContaining({
          text: l10n.en.settings.routerModels.waitStopped,
          metadata: {system: true},
        }),
      );
    });
  });

  // The engine refuses a turn whose readiness request the user withdrew. That
  // is a decision the catch makes about the error it caught, never about the
  // error's message being empty: an absence has more than one cause, and the
  // other one is a native throw that would then vanish in silence.
  describe('a completion refused because the request was withdrawn', () => {
    const rejectWith = (error: Error) => {
      if (modelStore.context) {
        modelStore.context.completion = jest.fn().mockRejectedValueOnce(error);
      }
    };

    const send = async () => {
      const {result} = renderHook(() =>
        useChatSession({current: null}, textMessage.author, mockAssistant),
      );
      await act(async () => {
        await result.current.handleSendPress(textMessage);
      });
    };

    it('says nothing at all', async () => {
      rejectWith(new RemoteModelRequestWithdrawnError());

      await send();

      expect(
        chatSessionStore.addMessageToCurrentSession,
      ).not.toHaveBeenCalledWith(
        expect.objectContaining({metadata: {system: true}}),
      );
    });

    it('still reports an unrelated error that happens to carry no message', async () => {
      rejectWith(new Error(''));

      await send();

      expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalledWith(
        expect.objectContaining({
          text: `${l10n.en.chat.completionFailed}${l10n.en.errors.unexpectedError}`,
          author: assistant,
        }),
      );
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

  it('maps the speculative draft-context failure to friendly copy', async () => {
    // Low-RAM devices throw this at first completion; the raw native string
    // must not reach the chat.
    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockRejectedValueOnce(new Error('failed to create MTP draft context'));
    }

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        text: l10n.en.chat.speculativeInitFailed,
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

  it('emits multimodal warning when user sends an image but multimodal is disabled', async () => {
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

  it('sends an image on a remote model whose probe reported vision', async () => {
    runInAction(() => {
      modelStore.models = [
        {
          id: 'srv-1/gemma-4-e2b',
          origin: ModelOrigin.REMOTE,
          serverId: 'srv-1',
          remoteModelId: 'gemma-4-e2b',
        } as any,
      ];
      modelStore.activeModelId = 'srv-1/gemma-4-e2b';
      serverStore.remoteCaps = {'srv-1/gemma-4-e2b': {supportsVision: true}};
    });
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

    const sent = (modelStore.engine!.completion as jest.Mock).mock
      .calls[0][0] as {messages: Array<{role: string; content: any}>};
    const lastUser = [...sent.messages].reverse().find(m => m.role === 'user')!;
    expect(lastUser.content).toEqual(
      expect.arrayContaining([
        {type: 'image_url', image_url: {url: 'file:///photo.jpg'}},
      ]),
    );

    const warnings = (uiStore.setChatWarning as jest.Mock).mock.calls;
    expect(
      warnings.some(call =>
        JSON.stringify(call[0]).includes(l10n.en.chat.multimodalNotEnabled),
      ),
    ).toBe(false);

    runInAction(() => {
      serverStore.remoteCaps = {};
      modelStore.activeModelId = undefined;
    });
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

  describe('search grounding', () => {
    const webSearchTool = {
      type: 'function',
      function: {name: 'web_search', description: '', parameters: {}},
    };

    const activateSearchTools = async () => {
      const baseSettings =
        await chatSessionStore.getCurrentCompletionSettings();
      (
        chatSessionStore.getCurrentCompletionSettings as jest.Mock
      ).mockResolvedValueOnce({...baseSettings, tools: [webSearchTool]});
    };

    const useSessionWithPal = (systemPrompt: string) => {
      const pal = {
        id: 'search-pal-id',
        type: 'local' as const,
        name: 'Search Pal',
        systemPrompt,
        parameters: {},
        parameterSchema: [],
        isSystemPromptChanged: false,
        useAIPrompt: false,
        source: 'local' as const,
      };
      palStore.pals = [pal];
      chatSessionStore.sessions = [
        {
          id: 'search-session-id',
          activePalId: pal.id,
          title: 'Search Session',
          date: new Date().toISOString().split('T')[0],
          messages: [],
          completionSettings: mockDefaultCompletionParams,
          settingsSource: 'pal' as const,
        },
      ];
      chatSessionStore.activeSessionId = 'search-session-id';
      return pal;
    };

    const captureMessages = () => {
      const captured: {messages: any[]} = {messages: []};
      if (modelStore.context) {
        modelStore.context.completion = jest
          .fn()
          .mockImplementation((params, _onData) => {
            captured.messages = params.messages || [];
            return Promise.resolve({timings: {total: 100}, usage: {}});
          });
      }
      return captured;
    };

    const send = async () => {
      const {result} = renderHook(() =>
        useChatSession({current: null}, textMessage.author, mockAssistant),
      );
      await act(async () => {
        await result.current.handleSendPress(textMessage);
      });
    };

    // Strict templates reject a second system message ("must be at the
    // beginning"), so grounding folds into the pal's system message.
    it('sends exactly one system message carrying both the pal prompt and the grounding', async () => {
      const pal = useSessionWithPal('You are a research assistant.');
      await activateSearchTools();
      const captured = captureMessages();

      await send();

      const systemMessages = captured.messages.filter(
        msg => msg.role === 'system',
      );
      expect(systemMessages).toHaveLength(1);

      const today = new Date().toISOString().slice(0, 10);
      expect(systemMessages[0].content).toContain(
        'You are a research assistant.',
      );
      expect(systemMessages[0].content).toContain(`Today's date is ${today}`);
      expect(systemMessages[0].content).toContain('web_search');

      // Composition happens at assembly time only.
      expect(pal.systemPrompt).toBe('You are a research assistant.');
    });

    it('sends the grounding as the sole system message when the pal has no system prompt', async () => {
      useSessionWithPal('');
      await activateSearchTools();
      const captured = captureMessages();

      await send();

      const systemMessages = captured.messages.filter(
        msg => msg.role === 'system',
      );
      expect(systemMessages).toHaveLength(1);

      const today = new Date().toISOString().slice(0, 10);
      expect(systemMessages[0].content).toContain(`Today's date is ${today}`);
      expect(systemMessages[0].content).toContain('web_search');
    });

    it('leaves the pal system message alone when no search tools are active', async () => {
      useSessionWithPal('You are a research assistant.');
      const captured = captureMessages();

      await send();

      const systemMessages = captured.messages.filter(
        msg => msg.role === 'system',
      );
      expect(systemMessages).toHaveLength(1);
      expect(systemMessages[0].content).toBe('You are a research assistant.');
    });

    it('seeds the read_url allowlist from URLs the user wrote', async () => {
      useSessionWithPal('');
      await activateSearchTools();
      captureMessages();

      const {result} = renderHook(() =>
        useChatSession({current: null}, textMessage.author, mockAssistant),
      );
      await act(async () => {
        await result.current.handleSendPress({
          ...textMessage,
          text: 'summarize https://user.example.com/doc please',
        });
      });

      expect(isReadUrlAllowed('https://user.example.com/doc')).toBe(true);
      expect(isReadUrlAllowed('https://other.example.com/x')).toBe(false);
    });
  });

  it('omits the search grounding line when no search tools are active', async () => {
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

    expect(
      capturedMessages.some(
        msg =>
          msg.role === 'system' &&
          typeof msg.content === 'string' &&
          msg.content.includes("Today's date is"),
      ),
    ).toBe(false);
  });

  describe('TTS streaming wiring', () => {
    beforeEach(() => {
      // Hook is gated on autoSpeakEnabled (default false in the mock);
      // opt in for tests that assert it fires.
      (ttsStore as any).autoSpeakEnabled = true;
    });

    afterEach(() => {
      (ttsStore as any).autoSpeakEnabled = false;
    });

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

    it('skips per-chunk TTS hooks entirely when autoSpeakEnabled is off', async () => {
      // Override the beforeEach default for this single test.
      (ttsStore as any).autoSpeakEnabled = false;

      const finalText = 'one two three';
      if (modelStore.context) {
        modelStore.context.completion = jest
          .fn()
          .mockImplementation(async (_params, onData) => {
            if (onData) {
              onData({token: 'tok', content: 'one '});
              onData({token: 'tok', content: 'one two '});
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

      await act(async () => {
        await result.current.handleSendPress(textMessage);
      });

      expect(ttsStore.onAssistantMessageStart).not.toHaveBeenCalled();
      expect(ttsStore.onAssistantMessageChunk).not.toHaveBeenCalled();
    });
  });
});
