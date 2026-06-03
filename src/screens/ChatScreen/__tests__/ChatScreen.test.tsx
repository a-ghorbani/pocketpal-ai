import React from 'react';
import {runInAction} from 'mobx';

import {LlamaContext} from 'llama.rn';
import {
  render as baseRender,
  fireEvent,
  act,
  waitFor,
} from '../../../../jest/test-utils';
import {ChatScreen} from '../ChatScreen';

import {chatSessionStore, modelStore} from '../../../store';

import {l10n} from '../../../locales';
import {mockLlamaContextParams} from '../../../../jest/fixtures/models';

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {withBottomSheetProvider: true, ...options});

describe('ChatScreen', () => {
  let llamaRN;

  beforeEach(() => {
    jest.clearAllMocks();
    llamaRN = require('llama.rn');
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
    modelStore.context = new LlamaContext(mockLlamaContextParams);
    modelStore.engine = {
      completion: jest.fn((params, onData) =>
        modelStore.context!.completion(params, onData),
      ),
      stopCompletion: jest.fn(),
    };
    const {getByPlaceholderText} = render(<ChatScreen />, {
      withNavigation: true,
    });
    expect(getByPlaceholderText(l10n.en.chat.typeYourMessage)).toBeTruthy();
  });

  it('handles sending a message', async () => {
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
      modelStore.context = new LlamaContext(mockLlamaContextParams);
    });
    modelStore.context!.completion = jest.fn().mockResolvedValue({
      timings: {predicted_per_token_ms: 10, predicted_per_second: 100},
    });
    modelStore.engine = {
      completion: jest.fn((params, onData) =>
        modelStore.context!.completion(params, onData),
      ),
      stopCompletion: jest.fn(),
    };

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
    // Set up an active model for the test
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
      modelStore.context = new LlamaContext(mockLlamaContextParams);
    });
    modelStore.context!.completion = jest
      .fn()
      .mockRejectedValue(new Error('Completion failed'));
    modelStore.engine = {
      completion: jest.fn((params, onData) =>
        modelStore.context!.completion(params, onData),
      ),
      stopCompletion: jest.fn(),
    };

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
    modelStore.context = new LlamaContext(mockLlamaContextParams);
    modelStore.engine = {
      completion: jest.fn((params, onData) =>
        modelStore.context!.completion(params, onData),
      ),
      stopCompletion: jest.fn(),
    };
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
    modelStore.engine = {
      completion: jest.fn((params, onData) =>
        modelStore.context!.completion(params, onData),
      ),
      stopCompletion: jest.fn(),
    };

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

    expect(modelStore.engine?.stopCompletion).toHaveBeenCalled();
  });

  describe('thinking toggle in no-session chat', () => {
    const palStore = require('../../../store').palStore;
    const thinkingPal = {
      id: 'pal-thinking',
      type: 'assistant' as const,
      name: 'Thinker',
      systemPrompt: '',
      parameters: {},
      parameterSchema: [],
      isSystemPromptChanged: false,
      useAIPrompt: false,
      source: 'local' as const,
      completionSettings: {enable_thinking: true},
    };

    let savedModels: any[];

    beforeEach(() => {
      // Inject a thinking-capable model into the mock model list so the
      // `activeModel?.supportsThinking` computed in ChatScreen returns true.
      savedModels = modelStore.models;
      const thinkingModel = {
        ...modelStore.models[0],
        id: 'thinking-model-id',
        supportsThinking: true,
      };
      modelStore.models = [...modelStore.models, thinkingModel];

      runInAction(() => {
        modelStore.activeModelId = 'thinking-model-id';
        modelStore.context = new LlamaContext(mockLlamaContextParams);
        chatSessionStore.activeSessionId = null;
        chatSessionStore.newChatPalId = thinkingPal.id;
        chatSessionStore.newChatThinkingOverride = undefined;
      });
      modelStore.engine = {
        completion: jest.fn(),
        stopCompletion: jest.fn(),
      };
      palStore.pals = [thinkingPal];
    });

    afterEach(() => {
      modelStore.models = savedModels;
      modelStore.activeModelId = undefined;
      jest.restoreAllMocks();
    });

    it('toggle press writes newChatThinkingOverride and does NOT touch newChatCompletionSettings', async () => {
      const setGlobalSpy = jest.spyOn(
        chatSessionStore,
        'setNewChatCompletionSettings',
      );

      const {getByLabelText} = render(<ChatScreen />, {
        withNavigation: true,
      });

      // Initial state: thinkingEnabled defaults true → toggle label is
      // "Disable thinking mode". Tapping it should write `false` into the
      // override field.
      const toggle = getByLabelText('Disable thinking mode');
      await act(async () => {
        fireEvent.press(toggle);
      });

      // Primary signal: override is set to the new value.
      expect(chatSessionStore.newChatThinkingOverride).toBe(false);

      // Negative guard: global no-chat settings were NOT mutated.
      expect(setGlobalSpy).not.toHaveBeenCalled();
    });
  });

  describe('tool-compatibility banner', () => {
    const palStore = require('../../../store').palStore;
    const uiStore = require('../../../store').uiStore;

    const palWithTalents = {
      id: 'pal-with-talents',
      type: 'assistant' as const,
      name: 'Tool Pal',
      systemPrompt: '',
      parameters: {},
      parameterSchema: [],
      isSystemPromptChanged: false,
      useAIPrompt: false,
      source: 'local' as const,
      pact: {talents: [{name: 'calculate'}]},
    };

    const buildContextWithCaps = (caps: {
      defaultTools?: boolean;
      defaultToolCalls?: boolean;
      toolUse?: boolean;
      toolUseCaps?: boolean;
    }) => {
      const ctx = new LlamaContext(mockLlamaContextParams);
      (ctx as any).model = {
        ...mockLlamaContextParams.model,
        chatTemplates: {
          llamaChat: false,
          jinja: {
            default: true,
            defaultCaps: {
              tools: !!caps.defaultTools,
              toolCalls: !!caps.defaultToolCalls,
              systemRole: false,
              parallelToolCalls: false,
            },
            toolUse: !!caps.toolUse,
            toolUseCaps: caps.toolUseCaps
              ? {
                  tools: true,
                  toolCalls: true,
                  systemRole: false,
                  parallelToolCalls: false,
                }
              : undefined,
          },
        },
      };
      return ctx;
    };

    const renderWithToolPal = (ctx: LlamaContext) => {
      runInAction(() => {
        modelStore.activeModelId = 'tool-model-id';
        modelStore.context = ctx;
      });
      palStore.pals = [palWithTalents];
      jest
        .spyOn(require('../../../store').chatSessionStore, 'activePalId', 'get')
        .mockReturnValue(palWithTalents.id);
      return render(<ChatScreen />, {withNavigation: true});
    };

    beforeEach(() => {
      uiStore.setChatWarning.mockClear();
      uiStore.hasWarnedToolCompat.mockReturnValue(false);
    });

    it('does NOT warn when defaultCaps.tools is true (Ministral-style)', () => {
      renderWithToolPal(buildContextWithCaps({defaultTools: true}));
      expect(uiStore.setChatWarning).not.toHaveBeenCalled();
    });

    it('does NOT warn when defaultCaps.toolCalls is true', () => {
      renderWithToolPal(buildContextWithCaps({defaultToolCalls: true}));
      expect(uiStore.setChatWarning).not.toHaveBeenCalled();
    });

    it('does NOT warn when toolUse is true (Qwen3-style)', () => {
      renderWithToolPal(buildContextWithCaps({toolUse: true}));
      expect(uiStore.setChatWarning).not.toHaveBeenCalled();
    });

    it('does NOT warn when toolUseCaps object is present', () => {
      renderWithToolPal(buildContextWithCaps({toolUseCaps: true}));
      expect(uiStore.setChatWarning).not.toHaveBeenCalled();
    });

    it('warns once when all four capability slots are absent', () => {
      renderWithToolPal(buildContextWithCaps({}));
      expect(uiStore.setChatWarning).toHaveBeenCalledTimes(1);
      expect(uiStore.markToolCompatWarned).toHaveBeenCalledWith(
        'tool-model-id',
      );
    });
  });
});
