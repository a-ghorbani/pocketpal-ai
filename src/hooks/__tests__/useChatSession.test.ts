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

import {chatSessionStore, modelStore, palStore} from '../../store';

import {l10n} from '../../locales';
import {assistant} from '../../utils/chat';
import {
  talentRegistry,
  registerDefaultTalents,
  resetRegisteredFlag,
} from '../../services/talents';

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

  it('should save completionResult with reasoning_content after completion', async () => {
    const mockReasoningContent = 'Let me think step by step...';
    const mockContent = 'The answer is 42.';

    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockImplementation((_params, onData) => {
          // Simulate streaming with reasoning content
          onData({
            token: 'tok',
            content: mockContent,
            reasoning_content: mockReasoningContent,
          });
          return Promise.resolve({
            text: mockContent,
            reasoning_content: mockReasoningContent,
            timings: {total: 100},
            usage: {},
          });
        });
    }

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    // Verify the final updateMessage call includes completionResult
    expect(chatSessionStore.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        metadata: expect.objectContaining({
          completionResult: {
            reasoning_content: mockReasoningContent,
            content: mockContent,
          },
        }),
      }),
    );
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
});

describe('useChatSession — multi-turn talent dispatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    talentRegistry.reset();
    resetRegisteredFlag();
    registerDefaultTalents();

    chatSessionStore.sessions = sessionFixtures as any;
    chatSessionStore.activeSessionId = 'session-1';
    (chatSessionStore as any).isGenerating = false;
    modelStore.models = modelsList as any;
    modelStore.activeModelId = undefined;
    modelStore.context = new LlamaContext(mockLlamaContextParams);
    modelStore.engine = {
      completion: jest.fn((params, onData) => {
        return modelStore.context!.completion(params, onData);
      }),
      stopCompletion: jest.fn(async () => {
        await modelStore.context?.stopCompletion();
      }),
    };
  });

  afterAll(() => {
    talentRegistry.reset();
    resetRegisteredFlag();
  });

  const setupPalWithTalents = (talentNames: string[]) => {
    const mockPal = {
      id: 'talent-pal',
      type: 'local' as const,
      name: 'Talent Pal',
      systemPrompt: 'You are helpful.',
      pact: {
        talents: talentNames.map(name => ({
          name,
          necessity: 'required' as const,
        })),
      },
      parameters: {},
      parameterSchema: [],
      isSystemPromptChanged: false,
      useAIPrompt: false,
      source: 'local' as const,
    };
    palStore.pals = [mockPal];
    const mockSession = {
      id: 'talent-session',
      activePalId: 'talent-pal',
      title: 'Talent Session',
      date: new Date().toISOString().split('T')[0],
      messages: [],
      completionSettings: mockDefaultCompletionParams,
      settingsSource: 'pal' as const,
    };
    chatSessionStore.sessions = [mockSession];
    chatSessionStore.activeSessionId = 'talent-session';
  };

  it('triggers follow-up completion when calculate talent is called', async () => {
    setupPalWithTalents(['calculate']);

    let callCount = 0;
    const mockCompletion = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          text: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {name: 'calculate', arguments: '{"expression":"2+3"}'},
            },
          ],
          timings: {total: 100},
          usage: {},
        });
      }
      return Promise.resolve({
        text: 'The answer is 5.',
        timings: {total: 50},
        usage: {},
      });
    });
    modelStore.engine = {
      completion: mockCompletion,
      stopCompletion: jest.fn(),
    };

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    // engine.completion should have been called twice (initial + follow-up)
    expect(mockCompletion).toHaveBeenCalledTimes(2);
  });

  it('does NOT trigger follow-up for render_html (self-rendering)', async () => {
    setupPalWithTalents(['render_html']);

    const mockCompletion = jest.fn().mockResolvedValue({
      text: '',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'render_html',
            arguments: '{"html":"<p>Hello</p>","title":"Test"}',
          },
        },
      ],
      timings: {total: 100},
      usage: {},
    });
    modelStore.engine = {
      completion: mockCompletion,
      stopCompletion: jest.fn(),
    };

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    // Only one completion call — no follow-up
    expect(mockCompletion).toHaveBeenCalledTimes(1);
  });

  it('respects max iterations guard (MAX_TOOL_TURNS = 5)', async () => {
    setupPalWithTalents(['calculate']);

    const mockCompletion = jest.fn().mockImplementation(() => {
      return Promise.resolve({
        text: '',
        tool_calls: [
          {
            id: `call_${Date.now()}_${Math.random()}`,
            type: 'function',
            function: {name: 'calculate', arguments: '{"expression":"1+1"}'},
          },
        ],
        timings: {total: 10},
        usage: {},
      });
    });
    modelStore.engine = {
      completion: mockCompletion,
      stopCompletion: jest.fn(),
    };

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    // 1 initial + 5 follow-ups = 6 total
    expect(mockCompletion).toHaveBeenCalledTimes(6);
  });

  it('does not start follow-up when user stopped generation', async () => {
    setupPalWithTalents(['calculate']);

    const mockCompletion = jest.fn().mockImplementation(() => {
      // Simulate user pressing stop after tool execution
      chatSessionStore.setIsGenerating(false);
      return Promise.resolve({
        text: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {name: 'calculate', arguments: '{"expression":"2+3"}'},
          },
        ],
        timings: {total: 100},
        usage: {},
      });
    });
    modelStore.engine = {
      completion: mockCompletion,
      stopCompletion: jest.fn(),
    };

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    // Only 1 call — follow-up skipped because isGenerating was set to false
    expect(mockCompletion).toHaveBeenCalledTimes(1);
  });
});

describe('useChatSession — tool-call generation detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    talentRegistry.reset();
    resetRegisteredFlag();
    registerDefaultTalents();

    chatSessionStore.sessions = sessionFixtures as any;
    chatSessionStore.activeSessionId = 'session-1';
    (chatSessionStore as any).isGenerating = false;
    (chatSessionStore as any).isGeneratingToolCall = false;
    modelStore.models = modelsList as any;
    modelStore.activeModelId = undefined;
    modelStore.context = new LlamaContext(mockLlamaContextParams);
    // Mock getFormattedChat to return a trigger marker
    modelStore.context.getFormattedChat = jest.fn().mockResolvedValue({
      type: 'jinja',
      prompt: 'test',
      grammar_triggers: [{type: 0, value: '<tool_call>', token: 0}],
    });
    modelStore.engine = {
      completion: jest.fn((params, onData) => {
        return modelStore.context!.completion(params, onData);
      }),
      stopCompletion: jest.fn(),
    };
  });

  afterAll(() => {
    talentRegistry.reset();
    resetRegisteredFlag();
  });

  const setupPalWithTalents = (talentNames: string[]) => {
    const mockPal = {
      id: 'trigger-pal',
      type: 'local' as const,
      name: 'Trigger Pal',
      systemPrompt: 'You are helpful.',
      pact: {
        talents: talentNames.map(name => ({
          name,
          necessity: 'required' as const,
        })),
      },
      parameters: {},
      parameterSchema: [],
      isSystemPromptChanged: false,
      useAIPrompt: false,
      source: 'local' as const,
    };
    palStore.pals = [mockPal];
    const mockSession = {
      id: 'trigger-session',
      activePalId: 'trigger-pal',
      title: 'Trigger Session',
      date: new Date().toISOString().split('T')[0],
      messages: [],
      completionSettings: mockDefaultCompletionParams,
      settingsSource: 'pal' as const,
    };
    chatSessionStore.sessions = [mockSession];
    chatSessionStore.activeSessionId = 'trigger-session';
  };

  it('sets isGeneratingToolCall when trigger marker appears in accumulated_text', async () => {
    setupPalWithTalents(['render_html']);

    const mockCompletion = jest.fn().mockImplementation((_params, onData) => {
      // Simulate tool-call tokens: marker in accumulated_text, no tool_calls yet
      onData({
        token: '<tool_call>',
        accumulated_text: '<tool_call>',
      });
      expect(chatSessionStore.setIsGeneratingToolCall).toHaveBeenCalledWith(
        true,
      );

      // Simulate tool_calls arriving (name parsed)
      onData({
        token: '}',
        accumulated_text: '<tool_call>{"name":"render_html","arguments":{}}',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {name: 'render_html', arguments: '{}'},
          },
        ],
      });
      expect(chatSessionStore.setIsGeneratingToolCall).toHaveBeenCalledWith(
        false,
      );

      return Promise.resolve({
        text: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {name: 'render_html', arguments: '{"html":"<p/>"}'},
          },
        ],
        timings: {total: 100},
        usage: {},
      });
    });
    modelStore.engine = {completion: mockCompletion, stopCompletion: jest.fn()};

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });
  });

  it('does NOT set isGeneratingToolCall during normal text streaming', async () => {
    setupPalWithTalents(['render_html']);

    const mockCompletion = jest.fn().mockImplementation((_params, onData) => {
      // Normal text streaming — no trigger marker in accumulated_text
      onData({
        token: 'Hello',
        content: 'Hello',
        accumulated_text: 'Hello',
      });
      onData({
        token: ' world',
        content: 'Hello world',
        accumulated_text: 'Hello world',
      });

      return Promise.resolve({
        text: 'Hello world',
        timings: {total: 100},
        usage: {},
      });
    });
    modelStore.engine = {completion: mockCompletion, stopCompletion: jest.fn()};

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    expect(chatSessionStore.setIsGeneratingToolCall).not.toHaveBeenCalledWith(
      true,
    );
  });

  it('detects trigger marker mid-stream (text then tool call)', async () => {
    setupPalWithTalents(['render_html']);

    const mockCompletion = jest.fn().mockImplementation((_params, onData) => {
      // Text phase — no marker yet
      onData({
        token: 'Let me help',
        content: 'Let me help',
        accumulated_text: 'Let me help',
      });

      // Tool-call phase — marker appears in accumulated_text
      onData({
        token: '<tool_call>',
        content: 'Let me help',
        accumulated_text: 'Let me help\n<tool_call>',
      });
      expect(chatSessionStore.setIsGeneratingToolCall).toHaveBeenCalledWith(
        true,
      );

      return Promise.resolve({
        text: 'Let me help',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {name: 'render_html', arguments: '{"html":"<p/>"}'},
          },
        ],
        timings: {total: 100},
        usage: {},
      });
    });
    modelStore.engine = {completion: mockCompletion, stopCompletion: jest.fn()};

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });
  });

  it('clears isGeneratingToolCall on error (truncated tool call)', async () => {
    setupPalWithTalents(['render_html']);

    const mockCompletion = jest.fn().mockImplementation((_params, onData) => {
      // Marker emitted but model errors before name parses
      onData({
        token: '<tool_call>',
        accumulated_text: '<tool_call>',
      });
      // tool_calls never arrives — error instead
      return Promise.reject(new Error('Model truncated'));
    });
    modelStore.engine = {completion: mockCompletion, stopCompletion: jest.fn()};

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    // Flag must be cleared by the error cleanup path
    expect(chatSessionStore.setIsGeneratingToolCall).toHaveBeenLastCalledWith(
      false,
    );
  });
});
