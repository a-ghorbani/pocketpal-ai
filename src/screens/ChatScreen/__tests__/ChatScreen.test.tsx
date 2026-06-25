import React from 'react';
import {runInAction} from 'mobx';

import {LlamaContext} from 'llama.rn';
import {
  render as baseRender,
  fireEvent,
  act,
  waitFor,
  within,
} from '../../../../jest/test-utils';
import {ChatScreen} from '../ChatScreen';

import {
  chatSessionStore,
  modelStore,
  serverStore,
  deepLinkStore,
} from '../../../store';

import {l10n} from '../../../locales';
import {mockLlamaContextParams} from '../../../../jest/fixtures/models';
import {buildReasoningPayload} from '../../../api/openai';
import {ModelOrigin} from '../../../utils/types';

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {withBottomSheetProvider: true, ...options});

// The pill renders the localized effort tier (e.g. 'Low'), not the raw carrier
// token ('low'); map the token through the same table the component uses.
const effortLabels = l10n.en.components.modelSettingsSheet.effortLevels;
const effortLabel = (token: keyof typeof effortLabels) => effortLabels[token];

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
      // Inject a reasoning-capable model so the resolver in ChatScreen reports
      // isReasoning 'yes' and the thinking pill is shown.
      savedModels = modelStore.models;
      const thinkingModel = {
        ...modelStore.models[0],
        id: 'thinking-model-id',
        supportsThinking: true,
        reasoning: {
          isReasoning: 'yes' as const,
          source: 'detected' as const,
          supportsEffort: false,
          effortValues: [],
          effortSource: 'none' as const,
        },
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

describe('ChatScreen — Home-launcher auto-focus consumer', () => {
  const engine = () => ({
    completion: jest.fn(),
    stopCompletion: jest.fn(),
  });

  afterEach(() => {
    runInAction(() => {
      deepLinkStore.autoFocusChat = false;
      modelStore.engine = undefined;
    });
  });

  it('reads and clears the one-shot flag exactly once on arrival (model loaded)', () => {
    runInAction(() => {
      deepLinkStore.autoFocusChat = true;
      modelStore.context = new LlamaContext(mockLlamaContextParams);
      modelStore.engine = engine();
    });
    render(<ChatScreen />, {withNavigation: true});
    expect(deepLinkStore.clearAutoFocusChat).toHaveBeenCalledTimes(1);
  });

  it('clears the flag without engaging focus when no model is loaded', () => {
    runInAction(() => {
      deepLinkStore.autoFocusChat = true;
      modelStore.engine = undefined;
    });
    render(<ChatScreen />, {withNavigation: true});
    // Flag is consumed (cleared) so it cannot leak; no model means no focus.
    expect(deepLinkStore.clearAutoFocusChat).toHaveBeenCalledTimes(1);
  });

  it('clears the flag on a non-launcher arrival (history / deep link)', () => {
    runInAction(() => {
      // History rows and deep links never set the flag; arrival still clears it.
      deepLinkStore.autoFocusChat = false;
      modelStore.context = new LlamaContext(mockLlamaContextParams);
      modelStore.engine = engine();
    });
    render(<ChatScreen />, {withNavigation: true});
    expect(deepLinkStore.clearAutoFocusChat).toHaveBeenCalledTimes(1);
  });
});

describe('ChatScreen reasoning pill visibility', () => {
  let savedModels: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    savedModels = modelStore.models;
    runInAction(() => {
      modelStore.context = new LlamaContext(mockLlamaContextParams);
      serverStore.remoteReasoning = {};
    });
    modelStore.engine = {
      completion: jest.fn(),
      stopCompletion: jest.fn(),
    } as any;
  });

  afterEach(() => {
    modelStore.models = savedModels;
    modelStore.activeModelId = undefined;
  });

  const useModel = (overrides: any) => {
    const model = {...savedModels[0], id: 'pill-model', ...overrides};
    modelStore.models = [...savedModels, model];
    runInAction(() => {
      modelStore.activeModelId = 'pill-model';
    });
  };

  it("shows the pill when isReasoning is 'unknown' (fail-open)", () => {
    useModel({supportsThinking: undefined, reasoning: undefined});
    const {queryByTestId} = render(<ChatScreen />, {withNavigation: true});
    expect(queryByTestId('thinking-toggle')).toBeTruthy();
  });

  it("hides the pill when isReasoning is 'no'", () => {
    useModel({
      reasoning: {
        isReasoning: 'no',
        source: 'user',
        supportsEffort: true,
        effortValues: ['low', 'high'],
        effortSource: 'user',
      },
    });
    const {queryByTestId} = render(<ChatScreen />, {withNavigation: true});
    expect(queryByTestId('thinking-toggle')).toBeNull();
  });

  it('shows the pill for a graded effort model', () => {
    useModel({
      reasoning: {
        isReasoning: 'yes',
        source: 'user',
        supportsEffort: true,
        effortValues: ['low', 'medium', 'high'],
        effortSource: 'user',
      },
    });
    const {queryByTestId} = render(<ChatScreen />, {withNavigation: true});
    expect(queryByTestId('thinking-toggle')).toBeTruthy();
  });
});

describe('ChatScreen reasoning override reaches the pill (live, no remount)', () => {
  // Reproduces the user-reported flow: a model is loaded as the active chat
  // model with NO reasoning capability (binary pill), the chat is already on
  // screen, then the user saves a graded-effort override on the model card.
  // The card mutates the live observable Model via setReasoningOverride; the
  // already-mounted ChatScreen must react and the pill must become graded
  // without a remount. Existing tests bake `reasoning` in before render, so
  // they cannot catch a broken live-override/observation path.
  let savedModels: any[];
  let savedSessionId: string | null | undefined;
  // Persisted reasoning settings for the active session — the pill init effect
  // reads enable_thinking back from here, mirroring real session persistence.
  let persisted: {enable_thinking: boolean; reasoning?: {effort?: string}};

  beforeEach(() => {
    jest.clearAllMocks();
    savedModels = modelStore.models;
    savedSessionId = chatSessionStore.activeSessionId;
    // Start from a settled OFF pill so the first graded tap advances to the
    // first effort value rather than wrapping the cycle from an on-state.
    persisted = {enable_thinking: false, reasoning: {effort: undefined}};
    runInAction(() => {
      modelStore.context = new LlamaContext(mockLlamaContextParams);
      serverStore.remoteReasoning = {};
      chatSessionStore.activeSessionId = 'session-1';
    });
    modelStore.engine = {
      completion: jest.fn(),
      stopCompletion: jest.fn(),
    } as any;
    (
      chatSessionStore.getCurrentCompletionSettings as jest.Mock
    ).mockImplementation(async () => ({...persisted}));
    (
      chatSessionStore.updateSessionCompletionSettings as jest.Mock
    ).mockImplementation(async (s: any) => {
      persisted = {enable_thinking: s.enable_thinking, reasoning: s.reasoning};
      runInAction(() => {
        const session = chatSessionStore.sessions.find(
          x => x.id === 'session-1',
        );
        if (session) {
          (session as any).completionSettings = {...persisted};
        }
      });
    });
  });

  afterEach(() => {
    runInAction(() => {
      modelStore.models = savedModels;
      modelStore.activeModelId = undefined;
      chatSessionStore.activeSessionId = savedSessionId as any;
    });
  });

  it('turns the binary pill into a graded cycle after setReasoningOverride', async () => {
    const thinkText = l10n.en.components.chatInput.thinkingToggle.thinkText;

    // Active local model with reasoning absent → pill is binary on/off.
    const model = {
      ...savedModels[0],
      id: 'override-model',
      origin: ModelOrigin.LOCAL,
      supportsThinking: true,
      reasoning: undefined,
    };
    runInAction(() => {
      modelStore.models = [...savedModels, model];
      modelStore.activeModelId = 'override-model';
    });

    const {getByTestId} = render(<ChatScreen />, {
      withNavigation: true,
    });
    const pill = () => within(getByTestId('thinking-toggle'));

    // The pill starts binary and settled OFF (no effort label, no graded cycle
    // available yet).
    await waitFor(() => expect(pill().getByText(thinkText)).toBeTruthy());

    // User saves a graded-effort override on the model card. This is the exact
    // writer the ModelSettingsSheet calls.
    await act(async () => {
      modelStore.setReasoningOverride('override-model', {
        isReasoning: 'yes',
        source: 'user',
        supportsEffort: true,
        effortValues: ['low', 'medium', 'high'],
        effortSource: 'user',
      });
    });

    // The already-mounted ChatScreen must now drive a graded pill: tapping
    // cycles off → low → medium → high instead of a plain on/off toggle. Each
    // tap awaits the async persist + state flush before the label settles.
    for (const expected of ['low', 'medium', 'high'] as const) {
      await act(async () => {
        fireEvent.press(getByTestId('thinking-toggle'));
      });
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
      });
      await waitFor(() =>
        expect(pill().getByText(effortLabel(expected))).toBeTruthy(),
      );
    }
  });

  it('graded cycle advances in a fresh chat (no active session)', async () => {
    // The user-reported repro: a freshly loaded model in a brand-new chat (no
    // session yet). The graded pill must still advance off → low → medium →
    // high. The no-session path stages the effort on the new-chat override
    // fields; if it drops the effort grade the cycle collapses to on/off and
    // the pill alternates instead of stepping through the grades.
    runInAction(() => {
      chatSessionStore.activeSessionId = null as any;
      chatSessionStore.newChatThinkingOverride = undefined;
      chatSessionStore.newChatReasoningEffort = undefined;
    });
    // Mirror resolveCompletionSettings' no-session overlay: read the on/off and
    // effort back from the new-chat override fields the pill writes through.
    (
      chatSessionStore.getCurrentCompletionSettings as jest.Mock
    ).mockImplementation(async () => ({
      enable_thinking: chatSessionStore.newChatThinkingOverride ?? false,
      reasoning: {
        enabled: chatSessionStore.newChatThinkingOverride ?? false,
        effort: chatSessionStore.newChatReasoningEffort,
      },
    }));

    const model = {
      ...savedModels[0],
      id: 'fresh-chat-model',
      origin: ModelOrigin.HF,
      supportsThinking: true,
      reasoning: {
        isReasoning: 'yes' as const,
        source: 'user' as const,
        supportsEffort: true,
        effortValues: ['low', 'medium', 'high'],
        effortSource: 'user' as const,
      },
    };
    runInAction(() => {
      modelStore.models = [...savedModels, model];
      modelStore.activeModelId = 'fresh-chat-model';
    });

    const {getByTestId} = render(<ChatScreen />, {withNavigation: true});
    const pill = () => within(getByTestId('thinking-toggle'));
    const thinkText = l10n.en.components.chatInput.thinkingToggle.thinkText;

    await waitFor(() => expect(pill().getByText(thinkText)).toBeTruthy());

    for (const expected of ['low', 'medium', 'high'] as const) {
      await act(async () => {
        fireEvent.press(getByTestId('thinking-toggle'));
      });
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
      });
      await waitFor(() =>
        expect(pill().getByText(effortLabel(expected))).toBeTruthy(),
      );
    }
  });
});

describe('ChatScreen graded effort pill cycle', () => {
  let savedModels: any[];
  let savedSessionId: string | null | undefined;
  // Persisted reasoning settings for the active session. The pill's cycle
  // writes through updateSessionCompletionSettings; the init effect reads back
  // via getCurrentCompletionSettings, mirroring real session persistence so a
  // re-render does not clobber the just-applied state.
  let persisted: {enable_thinking: boolean; reasoning?: {effort?: string}};

  beforeEach(() => {
    jest.clearAllMocks();
    savedModels = modelStore.models;
    savedSessionId = chatSessionStore.activeSessionId;
    persisted = {enable_thinking: false, reasoning: {effort: undefined}};
    runInAction(() => {
      modelStore.context = new LlamaContext(mockLlamaContextParams);
      serverStore.remoteReasoning = {};
      chatSessionStore.activeSessionId = 'session-1';
    });
    modelStore.engine = {
      completion: jest.fn(),
      stopCompletion: jest.fn(),
    } as any;
    // Pill initializes to OFF; cycle round-trips through the session settings.
    (
      chatSessionStore.getCurrentCompletionSettings as jest.Mock
    ).mockImplementation(async () => ({...persisted}));
    (
      chatSessionStore.updateSessionCompletionSettings as jest.Mock
    ).mockImplementation(async (s: any) => {
      persisted = {
        enable_thinking: s.enable_thinking,
        reasoning: s.reasoning,
      };
      // Bump the session reference so the init effect re-reads the new value.
      runInAction(() => {
        const session = chatSessionStore.sessions.find(
          x => x.id === 'session-1',
        );
        if (session) {
          (session as any).completionSettings = {...persisted};
        }
      });
    });
  });

  afterEach(() => {
    modelStore.models = savedModels;
    runInAction(() => {
      modelStore.activeModelId = undefined;
      chatSessionStore.activeSessionId = savedSessionId as any;
    });
  });

  const useGradedModel = () => {
    const model = {
      ...savedModels[0],
      id: 'graded-model',
      reasoning: {
        isReasoning: 'yes' as const,
        source: 'user' as const,
        supportsEffort: true,
        effortValues: ['low', 'medium', 'high'],
        effortSource: 'user' as const,
      },
    };
    modelStore.models = [...savedModels, model];
    runInAction(() => {
      modelStore.activeModelId = 'graded-model';
    });
  };

  // A graded model's single pill cycles off → low → medium → high → off in
  // value-set order, never on/off only.
  it('cycles off → low → medium → high → off in value-set order', async () => {
    const thinkText = l10n.en.components.chatInput.thinkingToggle.thinkText;
    useGradedModel();
    const {getByTestId} = render(<ChatScreen />, {withNavigation: true});
    const pill = () => within(getByTestId('thinking-toggle'));

    // The init effect resolves enable_thinking:false → pill settles to OFF.
    await waitFor(() => expect(pill().getByText(thinkText)).toBeTruthy());

    for (const expected of ['low', 'medium', 'high'] as const) {
      await act(async () => {
        fireEvent.press(getByTestId('thinking-toggle'));
      });
      await waitFor(() =>
        expect(pill().getByText(effortLabel(expected))).toBeTruthy(),
      );
      // The chosen effort is persisted onto the reasoning carrier intent.
      expect(persisted).toMatchObject({
        enable_thinking: true,
        reasoning: {enabled: true, effort: expected},
      });
    }

    // One more tap past the last value wraps back to off.
    await act(async () => {
      fireEvent.press(getByTestId('thinking-toggle'));
    });
    await waitFor(() => expect(pill().getByText(thinkText)).toBeTruthy());
    expect(persisted).toMatchObject({
      enable_thinking: false,
      reasoning: {enabled: false, effort: undefined},
    });
  });
});

describe('ChatScreen on/off toggle → reasoning carrier (remote)', () => {
  let savedModels: any[];
  let savedSessionId: string | null | undefined;
  // Session-backed persistence so the simple on/off toggle round-trips through
  // updateSessionCompletionSettings, mirroring real session behaviour.
  let persisted: {
    enable_thinking: boolean;
    reasoning?: {enabled: boolean; effort?: string};
  };

  beforeEach(() => {
    jest.clearAllMocks();
    savedModels = modelStore.models;
    savedSessionId = chatSessionStore.activeSessionId;
    persisted = {enable_thinking: true, reasoning: undefined};
    runInAction(() => {
      modelStore.context = new LlamaContext(mockLlamaContextParams);
      // No entry → resolver reports isReasoning 'unknown' (pill shown,
      // fail-open) and supportsEffort false (simple on/off toggle).
      serverStore.remoteReasoning = {};
      chatSessionStore.activeSessionId = 'session-1';
    });
    modelStore.engine = {
      completion: jest.fn(),
      stopCompletion: jest.fn(),
    } as any;
    (
      chatSessionStore.getCurrentCompletionSettings as jest.Mock
    ).mockImplementation(async () => ({...persisted}));
    (
      chatSessionStore.updateSessionCompletionSettings as jest.Mock
    ).mockImplementation(async (s: any) => {
      persisted = {
        enable_thinking: s.enable_thinking,
        reasoning: s.reasoning,
      };
      runInAction(() => {
        const session = chatSessionStore.sessions.find(
          x => x.id === 'session-1',
        );
        if (session) {
          (session as any).completionSettings = {...persisted};
        }
      });
    });
  });

  afterEach(() => {
    modelStore.models = savedModels;
    runInAction(() => {
      modelStore.activeModelId = undefined;
      chatSessionStore.activeSessionId = savedSessionId as any;
    });
  });

  const useRemoteEffortUnknownModel = () => {
    const model = {
      ...savedModels[0],
      id: 'remote-effort-unknown',
      origin: ModelOrigin.REMOTE,
      supportsThinking: undefined,
      reasoning: undefined,
    };
    modelStore.models = [...savedModels, model];
    runInAction(() => {
      modelStore.activeModelId = 'remote-effort-unknown';
    });
  };

  // Toggling thinking OFF on a remote effort-unknown model must populate the
  // reasoning carrier (enabled:false), so buildReasoningPayload produces the
  // per-serverType OFF wire shape. Pre-R1 the toggle set only enable_thinking,
  // leaving params.reasoning undefined → buildReasoningPayload returns {}.
  it('off toggle yields reasoning.enabled false reaching buildReasoningPayload', async () => {
    useRemoteEffortUnknownModel();
    const {getByLabelText} = render(<ChatScreen />, {withNavigation: true});

    // Default thinkingEnabled true → label is "Disable thinking mode".
    const toggle = getByLabelText('Disable thinking mode');
    await act(async () => {
      fireEvent.press(toggle);
    });

    await waitFor(() =>
      expect(persisted.reasoning).toEqual({enabled: false, effort: undefined}),
    );
    expect(persisted.reasoning?.enabled).toBe(false);

    // The carrier drives the per-serverType OFF payload.
    expect(buildReasoningPayload('llama.cpp', persisted.reasoning)).toEqual({
      reasoning_format: 'auto',
      chat_template_kwargs: {enable_thinking: false},
    });
    expect(buildReasoningPayload('Ollama', persisted.reasoning)).toEqual({
      reasoning_effort: 'none',
    });
  });
});
