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

type ScriptedStep = {
  tokens: string[];
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
      step.tokens.forEach(content => onData?.({token: 'tok', content}));
      const content = step.tokens[step.tokens.length - 1] ?? '';
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

function useSearchPal() {
  talentRegistry.register(searchTalent);
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
  (ttsStore as any).autoSpeakEnabled = true;
});

afterEach(() => {
  (ttsStore as any).autoSpeakEnabled = false;
  (talentRegistry as any).engines.delete('web_search');
});

jest
  .spyOn(require('../../utils/chat'), 'applyChatTemplate')
  .mockImplementation(async () => 'mocked prompt');

describe('useChatSession — auto-speak across agent steps', () => {
  it('speaks every step from its first character, a preamble step before its tools run', async () => {
    useSearchPal();
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
    useSearchPal();
    scriptCompletion([
      {tokens: [], toolCalls: [searchCall('x')]},
      {tokens: ['The answer', 'The answer is 42.']},
    ]);

    await runTurn();

    expect(contentChunks()).toEqual(['The answer', ' is 42.']);
  });
});
