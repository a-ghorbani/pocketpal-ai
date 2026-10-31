import {LlamaContext} from 'llama.rn';
import {renderHook, act} from '@testing-library/react-native';

import {textMessage} from '../../../jest/fixtures';
import {
  mockLlamaContextParams,
  modelsList,
} from '../../../jest/fixtures/models';

import {useChatSession} from '../useChatSession';
import {chatSessionStore, modelStore, palStore, ttsStore} from '../../store';
import {derivedText} from '../../utils/chat';
import {talentRegistry} from '../../services/talents';
import type {AgentStep, AgentToolCall, MessageType} from '../../utils/types';
import type {TalentEngine, TalentResult} from '../../services/talents/types';

const mockAssistant = {id: 'h3o3lc5xj'};

type ScriptedToken = string | {content?: string; reasoning: string};

type ScriptedStep = {
  tokens: ScriptedToken[];
  toolCalls?: {name: string; arguments: string}[];
};

const searchTalent: TalentEngine = {
  name: 'web_search',
  execute: async () => ({type: 'text', summary: 'result'}) as TalentResult,
  toToolDefinition: () => ({
    type: 'function',
    function: {name: 'web_search', description: '', parameters: {}},
  }),
};

const searchCall = (query: string) => ({
  name: 'web_search',
  arguments: JSON.stringify({query}),
});

const completionParams: any[] = [];

function scriptCompletion(steps: ScriptedStep[]) {
  let turn = 0;
  modelStore.context!.completion = jest
    .fn()
    .mockImplementation(async (params, onData) => {
      completionParams.push(params);
      const step = steps[turn++];
      let content = '';
      step.tokens.forEach(token => {
        if (typeof token === 'string') {
          content = token;
          onData?.({token: 'tok', content});
        } else {
          content = token.content ?? content;
          onData?.({
            token: 'tok',
            content: token.content,
            reasoning_content: token.reasoning,
          });
        }
      });
      return {
        text: content,
        content,
        ...(step.toolCalls
          ? {
              tool_calls: step.toolCalls.map((call, i) => ({
                id: `c${turn}-${i}`,
                type: 'function',
                function: call,
              })),
            }
          : {}),
      };
    });
}

async function offerSearchTool() {
  talentRegistry.register(searchTalent);
  const settings = await chatSessionStore.getCurrentCompletionSettings();
  (
    chatSessionStore.getCurrentCompletionSettings as jest.Mock
  ).mockResolvedValueOnce({
    ...settings,
    tools: [searchTalent.toToolDefinition()],
  });
  palStore.pals = [
    {
      id: 'pal-1',
      type: 'local',
      name: 'Search Pal',
      systemPrompt: '',
      parameters: {},
      parameterSchema: [],
      isSystemPromptChanged: false,
      useAIPrompt: false,
      source: 'local',
      pact: {talents: [{name: 'web_search', necessity: 'optional'}]},
    } as any,
  ];
  chatSessionStore.sessions = [
    {
      id: 'session-1',
      title: '',
      date: '',
      messages: [],
      completionSettings: {},
      settingsSource: 'pal',
      activePalId: 'pal-1',
    } as any,
  ];
}

async function runTurn() {
  const {result} = renderHook(() =>
    useChatSession({current: null}, textMessage.author, mockAssistant),
  );
  await act(async () => {
    await result.current.handleSendPress(textMessage);
  });
}

const chunkCalls = () =>
  (ttsStore.onAssistantMessageChunk as jest.Mock).mock.calls;

const contentChunks = (): string[] =>
  chunkCalls()
    .map(call => call[1] as string)
    .filter(content => content.length > 0);

const spokenText = () => contentChunks().join('');

const reasoningChunks = (): string[] =>
  chunkCalls()
    .map(call => call[2] as string | undefined)
    .filter((reasoning): reasoning is string => !!reasoning);

const echo = (query: string) =>
  JSON.stringify({name: 'web_search', arguments: {query}});

const lastOrder = (fn: unknown) => Math.max(...callOrders(fn));

function callOrders(fn: unknown): number[] {
  return (fn as jest.Mock).mock.invocationCallOrder;
}

function persistedDerivedText(): string {
  const stepStarts = callOrders(chatSessionStore.pushAgentStep);
  const stepIndexAt = (order: number) =>
    stepStarts.filter(start => start < order).length - 1;
  const steps: AgentStep[] = stepStarts.map(() => ({content: ''}));

  const streaming = chatSessionStore.updateActiveStepStreaming as jest.Mock;
  streaming.mock.calls.forEach((call, i) => {
    const content = call[2]?.content;
    if (content !== undefined) {
      steps[stepIndexAt(streaming.mock.invocationCallOrder[i])].content =
        content;
    }
  });

  const appended = chatSessionStore.appendToolCall as jest.Mock;
  appended.mock.calls.forEach((call, i) => {
    const step = steps[stepIndexAt(appended.mock.invocationCallOrder[i])];
    step.toolCalls = [
      ...(step.toolCalls ?? []),
      ...(call[2] as AgentToolCall[]),
    ];
  });

  return derivedText({
    type: 'assistant_turn',
    steps,
  } as unknown as MessageType.AssistantTurn);
}

beforeEach(() => {
  jest.clearAllMocks();
  completionParams.length = 0;
  palStore.pals = [] as any;
  chatSessionStore.sessions = [
    {
      id: 'session-1',
      title: '',
      date: '',
      messages: [],
      completionSettings: {},
      settingsSource: 'pal',
    } as any,
  ];
  chatSessionStore.activeSessionId = 'session-1';
  chatSessionStore.agentUiState = {
    status: 'idle',
    pendingTalentNames: [],
    hitMaxTurns: false,
  };
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
  };
  (ttsStore as any).userTTSOverride = true;
  (ttsStore as any).autoSpeakEnabled = true;
});

afterEach(() => {
  (ttsStore as any).userTTSOverride = null;
  (ttsStore as any).autoSpeakEnabled = false;
  (ttsStore as any).voiceOutputActive = false;
  (talentRegistry as any).engines.delete('web_search');
});

jest
  .spyOn(require('../../utils/chat'), 'applyChatTemplate')
  .mockImplementation(async () => 'mocked prompt');

describe('useChatSession — auto-speak across agent steps', () => {
  it('forwards a voice reply while auto-speak is off', async () => {
    (ttsStore as any).autoSpeakEnabled = false;
    (ttsStore as any).voiceOutputActive = true;
    scriptCompletion([{tokens: ['Paris', 'Paris is the capital.']}]);

    await runTurn();

    expect(spokenText()).toBe('Paris is the capital.');
  });

  it('forwards nothing while auto-speak and voice output are both off', async () => {
    (ttsStore as any).autoSpeakEnabled = false;
    scriptCompletion([{tokens: ['Paris', 'Paris is the capital.']}]);

    await runTurn();

    expect(ttsStore.onAssistantMessageChunk).not.toHaveBeenCalled();
  });

  it('speaks every step from its first character, a preamble step before its tools run', async () => {
    await offerSearchTool();
    scriptCompletion([
      {
        tokens: ['Let me', 'Let me search.'],
        toolCalls: [searchCall('x')],
      },
      {tokens: ['The', 'The answer', 'The answer is 42.']},
    ]);

    await runTurn();

    expect(spokenText()).toBe('Let me search.\n\nThe answer is 42.');
    expect(spokenText().trim()).toBe(persistedDerivedText().trim());
    const firstChunkOrder = callOrders(ttsStore.onAssistantMessageChunk)[0];
    expect(firstChunkOrder).toBeLessThan(
      callOrders(chatSessionStore.appendToolCall)[0],
    );
    expect(firstChunkOrder).toBeLessThan(
      callOrders(chatSessionStore.finalizeActiveStep)[0],
    );
  });

  it('adds no separator before the first spoken step when an earlier step had only a call', async () => {
    await offerSearchTool();
    scriptCompletion([
      {tokens: [], toolCalls: [searchCall('x')]},
      {tokens: ['The answer', 'The answer is 42.']},
    ]);

    await runTurn();

    expect(contentChunks()).toEqual(['The answer', ' is 42.']);
  });

  it('never speaks a tool-call echo, and speaks reasoning in a held step once', async () => {
    await offerSearchTool();
    const echoText = echo('x');
    scriptCompletion([
      {
        tokens: [
          {reasoning: 'Need'},
          {reasoning: 'Need a search', content: '{"name"'},
          {reasoning: 'Need a search', content: echoText},
        ],
        toolCalls: [searchCall('x')],
      },
      {tokens: ['The', 'The answer is 42.']},
    ]);

    await runTurn();

    expect(contentChunks()).toEqual(['The', ' answer is 42.']);
    expect(spokenText()).not.toContain('{"name"');
    expect(spokenText().trim()).toBe(persistedDerivedText().trim());
    expect(reasoningChunks()).toEqual(['Need', ' a search']);
    expect(callOrders(ttsStore.onAssistantMessageStart)[0]).toBeLessThan(
      callOrders(chatSessionStore.appendToolCall)[0],
    );
  });

  it('streams a prose step one chunk per token in a run that offers tools', async () => {
    await offerSearchTool();
    scriptCompletion([{tokens: ['Hi', 'Hi there', 'Hi there.']}]);

    await runTurn();

    expect(chunkCalls().map(call => call[1])).toEqual(['Hi', ' there', '.']);
  });

  it('speaks a JSON-shaped step that is not an echo in full when the step ends', async () => {
    await offerSearchTool();
    const notEcho = echo('y');
    scriptCompletion([
      {
        tokens: ['{"name"', notEcho],
        toolCalls: [searchCall('x')],
      },
      {tokens: ['Done.']},
    ]);

    await runTurn();

    expect(contentChunks()).toEqual([notEcho, '\n\nDone.']);
    const releaseOrder = callOrders(ttsStore.onAssistantMessageChunk)[0];
    expect(releaseOrder).toBeGreaterThan(
      callOrders(chatSessionStore.updateActiveStepStreaming)[1],
    );
    expect(releaseOrder).toBeLessThan(
      callOrders(chatSessionStore.appendToolCall)[0],
    );
    expect(spokenText().trim()).toBe(persistedDerivedText().trim());
  });

  it('holds a fence-first final step until it ends when the run offers tools', async () => {
    await offerSearchTool();
    const code = '```py\nprint(1)\n```';
    scriptCompletion([{tokens: ['```', '```py\nprint(1)', code]}]);

    await runTurn();

    expect(contentChunks()).toEqual([code]);
    expect(callOrders(ttsStore.onAssistantMessageChunk)[0]).toBeGreaterThan(
      lastOrder(chatSessionStore.updateActiveStepStreaming),
    );
    expect(spokenText().trim()).toBe(persistedDerivedText().trim());
  });

  it('separates a released held step from the step spoken before it', async () => {
    await offerSearchTool();
    const code = '```py\nprint(1)\n```';
    scriptCompletion([
      {tokens: ['Let me', 'Let me check.'], toolCalls: [searchCall('x')]},
      {tokens: ['```', code]},
    ]);

    await runTurn();

    expect(contentChunks()).toEqual(['Let me', ' check.', `\n\n${code}`]);
    expect(spokenText().trim()).toBe(persistedDerivedText().trim());
  });

  it('streams a fence-first reply per token when the run offers no tools', async () => {
    scriptCompletion([
      {tokens: ['```', '```py\nprint(1)', '```py\nprint(1)\n```']},
    ]);

    await runTurn();

    expect(completionParams[0].tools ?? []).toEqual([]);
    expect(chunkCalls().map(call => call[1])).toEqual([
      '```',
      'py\nprint(1)',
      '\n```',
    ]);
  });

  it('decides on the first visible character when a step starts with whitespace', async () => {
    await offerSearchTool();
    scriptCompletion([
      {tokens: ['  \n', `  \n${echo('x')}`], toolCalls: [searchCall('x')]},
      {tokens: ['Done.']},
    ]);

    await runTurn();

    expect(contentChunks()).toEqual(['Done.']);
    expect(spokenText().trim()).toBe(persistedDerivedText().trim());
  });

  it('streams a whitespace-led prose step per visible token', async () => {
    await offerSearchTool();
    scriptCompletion([
      {
        tokens: ['  \n', '  \nLet me', '  \nLet me check.'],
        toolCalls: [searchCall('x')],
      },
      {tokens: ['Done.']},
    ]);

    await runTurn();

    expect(contentChunks()).toEqual(['  \nLet me', ' check.', '\n\nDone.']);
    expect(spokenText().trim()).toBe(persistedDerivedText().trim());
  });

  it('forwards nothing for a whitespace-only step that had a call', async () => {
    await offerSearchTool();
    scriptCompletion([
      {tokens: ['  \n'], toolCalls: [searchCall('x')]},
      {tokens: ['The answer', 'The answer is 42.']},
    ]);

    await runTurn();

    expect(contentChunks()).toEqual(['The answer', ' is 42.']);
    expect(spokenText().trim()).toBe(persistedDerivedText().trim());
  });

  it('adds no separator when the step before the answer was a dropped echo', async () => {
    await offerSearchTool();
    scriptCompletion([
      {tokens: ['Let me', 'Let me search.'], toolCalls: [searchCall('x')]},
      {tokens: ['{', echo('y')], toolCalls: [searchCall('y')]},
      {tokens: ['The', 'The answer is 42.']},
    ]);

    await runTurn();

    expect(contentChunks()).toEqual([
      'Let me',
      ' search.',
      '\n\nThe',
      ' answer is 42.',
    ]);
    expect(spokenText().trim()).toBe(persistedDerivedText().trim());
  });

  it('forwards the reasoning of every step from its first character', async () => {
    await offerSearchTool();
    scriptCompletion([
      {
        tokens: [{reasoning: 'Need a web search first'}],
        toolCalls: [searchCall('x')],
      },
      {
        tokens: [
          {reasoning: 'Got it'},
          {reasoning: 'Got it', content: 'The answer is 42.'},
        ],
      },
    ]);

    await runTurn();

    expect(reasoningChunks()).toEqual(['Need a web search first', 'Got it']);
    expect(contentChunks()).toEqual(['The answer is 42.']);
  });

  it('adds no separator after a step that only reasoned', async () => {
    await offerSearchTool();
    scriptCompletion([
      {tokens: [{reasoning: 'Searching'}], toolCalls: [searchCall('x')]},
      {tokens: ['Done.']},
    ]);

    await runTurn();

    expect(contentChunks()).toEqual(['Done.']);
  });

  it('never speaks a held step when the engine fails before it ends', async () => {
    await offerSearchTool();
    modelStore.context!.completion = jest
      .fn()
      .mockImplementation(async (_params, onData) => {
        onData?.({token: 'tok', content: '{'});
        onData?.({token: 'tok', content: echo('x')});
        throw new Error('engine failed');
      });

    await runTurn();

    expect(ttsStore.onAssistantMessageStart).toHaveBeenCalled();
    expect(contentChunks()).toEqual([]);
    expect(ttsStore.stop).toHaveBeenCalled();
  });

  it('keeps the run going when releasing a held step to speech throws', async () => {
    await offerSearchTool();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (ttsStore.onAssistantMessageChunk as jest.Mock).mockImplementationOnce(
      () => {
        throw new Error('tts failed');
      },
    );
    scriptCompletion([
      {tokens: ['{"name"', echo('y')], toolCalls: [searchCall('x')]},
      {tokens: ['Done.']},
    ]);

    await runTurn();

    expect(warn).toHaveBeenCalledWith(
      '[useChatSession] TTS stream hook failed:',
      expect.any(Error),
    );
    expect(chatSessionStore.appendToolCall).toHaveBeenCalled();
    expect(spokenText()).toMatch(/Done\.$/);
    warn.mockRestore();
  });
});

describe('useChatSession — a spoken turn with several tool calls', () => {
  beforeEach(() => {
    (ttsStore as any).autoSpeakEnabled = false;
    (ttsStore as any).voiceOutputActive = true;
  });

  const sendSpoken = () => {
    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );
    let sending!: Promise<unknown>;
    act(() => {
      sending = result.current.handleSendPress(textMessage, {spoken: true});
    });
    return {result, sending: () => sending};
  };

  it.each([
    ['no text', []],
    ['an echo of its calls', [echo('a')]],
  ])(
    'speaks only the final answer, once, after a step of three concurrent calls with %s',
    async (_name, callStepTokens) => {
      await offerSearchTool();
      const delayMs: Record<string, number> = {a: 30, b: 10, c: 20};
      const settled: string[] = [];
      talentRegistry.register({
        ...searchTalent,
        execute: args =>
          new Promise<TalentResult>(resolve =>
            setTimeout(() => {
              settled.push(args.query);
              resolve({type: 'text', summary: args.query} as TalentResult);
            }, delayMs[args.query]),
          ),
      });
      scriptCompletion([
        {
          tokens: callStepTokens,
          toolCalls: [searchCall('a'), searchCall('b'), searchCall('c')],
        },
        {tokens: ['The', 'The answer is 42.']},
      ]);

      const {sending} = sendSpoken();
      await act(async () => {
        await sending();
      });

      expect(settled).toEqual(['b', 'c', 'a']);
      expect(
        (chatSessionStore.appendToolOutcome as jest.Mock).mock.calls.map(
          call => call[2].result.summary,
        ),
      ).toEqual(['a', 'b', 'c']);
      expect(spokenText()).toBe('The answer is 42.');
      expect(ttsStore.onAssistantMessageStart).toHaveBeenCalledTimes(1);
      expect(ttsStore.onAssistantMessageComplete).toHaveBeenCalledTimes(1);
      const finalStepStarted = callOrders(modelStore.context!.completion)[1];
      chunkCalls().forEach((call, i) => {
        if (call[1]) {
          expect(
            callOrders(ttsStore.onAssistantMessageChunk)[i],
          ).toBeGreaterThan(finalStepStarted);
        }
      });
    },
  );

  it('a Stop while its tool calls run cancels them and speaks nothing more', async () => {
    await offerSearchTool();
    const aborted: string[] = [];
    let started = 0;
    talentRegistry.register({
      ...searchTalent,
      execute: (args, ctx) =>
        new Promise<TalentResult>(resolve => {
          started += 1;
          ctx?.signal?.addEventListener('abort', () => {
            aborted.push(args.query);
            resolve({type: 'error', summary: 'cancelled'} as TalentResult);
          });
        }),
    });
    scriptCompletion([
      {
        tokens: [echo('a')],
        toolCalls: [searchCall('a'), searchCall('b'), searchCall('c')],
      },
      {tokens: ['Never spoken.']},
    ]);

    const {result, sending} = sendSpoken();
    await act(async () => {
      await new Promise(resolve => setImmediate(resolve));
    });
    expect(started).toBe(3);

    await act(async () => {
      await result.current.handleStopPress();
      await sending();
    });

    expect(aborted.sort()).toEqual(['a', 'b', 'c']);
    expect(modelStore.context!.completion).toHaveBeenCalledTimes(1);
    expect(spokenText()).toBe('');
    expect(ttsStore.onAssistantMessageComplete).not.toHaveBeenCalled();
    expect(ttsStore.play).not.toHaveBeenCalled();
  });

  it('a run stopped without Stop (model switch) cancels its open stream and plays nothing', async () => {
    await offerSearchTool();
    talentRegistry.register({
      ...searchTalent,
      execute: (_args, ctx) =>
        new Promise<TalentResult>(resolve => {
          ctx?.signal?.addEventListener('abort', () =>
            resolve({type: 'error', summary: 'cancelled'} as TalentResult),
          );
        }),
    });
    (ttsStore.onAssistantMessageStart as jest.Mock).mockImplementationOnce(
      (messageId: string) => {
        (ttsStore as any).playbackState = {mode: 'streaming', messageId};
      },
    );
    scriptCompletion([
      {tokens: ['Let me', 'Let me search.'], toolCalls: [searchCall('a')]},
      {tokens: ['Never spoken.']},
    ]);

    const {sending} = sendSpoken();
    await act(async () => {
      await new Promise(resolve => setImmediate(resolve));
    });
    await act(async () => {
      modelStore.abortActiveGeneration();
      await sending();
    });

    expect(ttsStore.stop).toHaveBeenCalled();
    expect(ttsStore.onAssistantMessageComplete).not.toHaveBeenCalled();
    expect(ttsStore.play).not.toHaveBeenCalled();
    (ttsStore as any).playbackState = {mode: 'idle'};
  });
});
