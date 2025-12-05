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

import {l10n} from '../../utils/l10n';
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
