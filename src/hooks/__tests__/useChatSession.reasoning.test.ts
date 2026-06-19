import {LlamaContext} from 'llama.rn';
import {renderHook, act} from '@testing-library/react-native';

import {textMessage} from '../../../jest/fixtures';
import {sessionFixtures} from '../../../jest/fixtures/chatSessions';
import {
  mockDefaultCompletionParams,
  mockLlamaContextParams,
  modelsList,
} from '../../../jest/fixtures/models';

import {useChatSession} from '../useChatSession';

import {chatSessionStore, modelStore, palStore, serverStore} from '../../store';

const mockAssistant = {id: 'assistant-1'};

// Capture the params handed to the engine so we can assert the reasoning wire.
const captureCompletionParams = (): {current: any} => {
  const captured: {current: any} = {current: undefined};
  if (modelStore.context) {
    modelStore.context.completion = jest
      .fn()
      .mockImplementation((params, _onData) => {
        captured.current = params;
        return Promise.resolve({
          text: 'ok',
          content: 'ok',
          timings: {total: 100},
        });
      });
  }
  return captured;
};

const setSettings = (overrides: Record<string, any>) => {
  (
    chatSessionStore.getCurrentCompletionSettings as jest.Mock
  ).mockResolvedValue({...mockDefaultCompletionParams, ...overrides});
};

beforeEach(() => {
  jest.clearAllMocks();
  palStore.pals = [] as any;
  chatSessionStore.sessions = sessionFixtures as any;
  chatSessionStore.activeSessionId = 'session-1';
  modelStore.models = modelsList as any;
  modelStore.activeModelId = undefined;
  modelStore.context = new LlamaContext(mockLlamaContextParams);
  modelStore.engine = {
    completion: jest.fn((params, onData) =>
      modelStore.context!.completion(params, onData),
    ),
    stopCompletion: jest.fn(async () => {
      await modelStore.context?.stopCompletion();
    }),
  } as any;
  serverStore.remoteReasoning = {};
});

jest
  .spyOn(require('../../utils/chat'), 'applyChatTemplate')
  .mockImplementation(async () => 'mocked prompt');

const send = async () => {
  const {result} = renderHook(() =>
    useChatSession({current: null}, textMessage.author, mockAssistant),
  );
  await act(async () => {
    await result.current.handleSendPress(textMessage);
  });
};

describe('useChatSession reasoning wire (local)', () => {
  it('axis-1 ON keeps reasoning_format auto, no enable_thinking kwarg', async () => {
    setSettings({enable_thinking: true});
    const captured = captureCompletionParams();
    await send();
    expect(captured.current.reasoning_format).toBe('auto');
    expect(
      captured.current.chat_template_kwargs?.enable_thinking,
    ).toBeUndefined();
  });

  it('axis-1 OFF emits enable_thinking:false + reasoning_format none', async () => {
    setSettings({enable_thinking: false});
    const captured = captureCompletionParams();
    await send();
    expect(captured.current.reasoning_format).toBe('none');
    expect(captured.current.chat_template_kwargs?.enable_thinking).toBe(false);
  });

  it('non-reasoning model: stale enable_thinking false attaches no reasoning hints', async () => {
    // A model resolved as isReasoning:'no' must not receive reasoning wire
    // hints even when enable_thinking is stale-false.
    setSettings({enable_thinking: false});
    const model = {
      ...(modelsList as any)[0],
      reasoning: {
        isReasoning: 'no' as const,
        source: 'user' as const,
        supportsEffort: false,
        effortValues: [],
        effortSource: 'none' as const,
      },
    };
    modelStore.models = [model] as any;
    modelStore.activeModelId = model.id;
    const captured = captureCompletionParams();
    await send();
    expect(captured.current.reasoning_format).toBeUndefined();
    expect(
      captured.current.chat_template_kwargs?.enable_thinking,
    ).toBeUndefined();
  });

  it('axis-2 effort emits chat_template_kwargs.reasoning_effort', async () => {
    setSettings({
      enable_thinking: true,
      reasoning: {enabled: true, effort: 'high'},
    });
    const captured = captureCompletionParams();
    await send();
    expect(captured.current.chat_template_kwargs?.reasoning_effort).toBe(
      'high',
    );
  });

  it('does not strip reasoning: no removeThinkingParts on displayed output (include_thinking unchanged)', async () => {
    // include_thinking_in_context controls only the SENT context; with it left
    // at its default (true) the assistant content is forwarded untouched.
    setSettings({enable_thinking: false, include_thinking_in_context: true});
    const captured = captureCompletionParams();
    await send();
    // No client-side reasoning-display suppression is added to the params.
    expect(captured.current).not.toHaveProperty('strip_reasoning');
    expect(captured.current.reasoning_format).toBe('none');
  });
});

describe('useChatSession learn-from-stream', () => {
  it('records reasoning observed on the first reasoning token', async () => {
    setSettings({enable_thinking: true});
    const spy = jest.spyOn(modelStore, 'recordReasoningObserved');
    // Active model whose resolver says not-yes (unknown), so the learn path fires.
    const model = {...(modelsList as any)[0], reasoning: undefined};
    modelStore.models = [model] as any;
    modelStore.activeModelId = model.id;
    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockImplementation((_params, onData) => {
          onData?.({token: 'x', reasoning_content: 'thinking...'});
          return Promise.resolve({text: 'ok', content: 'ok', timings: {}});
        });
    }
    await send();
    expect(spy).toHaveBeenCalledWith(model.id);
    spy.mockRestore();
  });
});
