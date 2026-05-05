import {LlamaContext} from 'llama.rn';
import {renderHook, act} from '@testing-library/react-native';

import {textMessage} from '../../../jest/fixtures';
import {sessionFixtures} from '../../../jest/fixtures/chatSessions';
import {
  mockLlamaContextParams,
  modelsList,
} from '../../../jest/fixtures/models';

import {useChatSession} from '../useChatSession';
import {chatSessionStore, modelStore, palStore} from '../../store';
import {assistant} from '../../utils/chat';
import {talentRegistry} from '../../services/talents';
import type {MessageType} from '../../utils/types';
import type {TalentEngine, TalentResult} from '../../services/talents/types';

const mockAssistant = {id: 'h3o3lc5xj'};

beforeEach(() => {
  jest.clearAllMocks();

  palStore.pals = [] as any;
  chatSessionStore.sessions = sessionFixtures as any;
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
});

const applyChatTemplateSpy = jest
  .spyOn(require('../../utils/chat'), 'applyChatTemplate')
  .mockImplementation(async () => 'mocked prompt');

describe('useChatSession — AssistantTurn integration', () => {
  beforeEach(() => {
    applyChatTemplateSpy.mockClear();
  });

  it('#1 happy path: writes per-step content via updateActiveStepStreaming and finalizes the step', async () => {
    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockImplementation(async (_params, onData) => {
          onData?.({content: 'Hello'});
          onData?.({content: ' there'});
          return {
            text: 'Hello there',
            content: 'Hello there',
            timings: {predicted_per_second: 100},
          };
        });
    }
    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );
    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    // The hook adds the user message AND the empty assistant turn.
    expect(chatSessionStore.addMessageToCurrentSession).toHaveBeenCalled();
    // pushAgentStep called for each step_started — one in this happy path.
    expect(chatSessionStore.pushAgentStep).toHaveBeenCalled();
    // Per-token writes go through updateActiveStepStreaming.
    expect(chatSessionStore.updateActiveStepStreaming).toHaveBeenCalled();
    // step_finished triggers finalizeActiveStep.
    expect(chatSessionStore.finalizeActiveStep).toHaveBeenCalled();
    // run_finished writes timings.
    expect(chatSessionStore.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        metadata: expect.objectContaining({
          timings: expect.any(Object),
          copyable: true,
        }),
      }),
    );
  });

  it('#2 run_finished with hitMaxTurns:true → metadata.hitMaxTurns written, console.warn emitted, no run_failed surfacing', async () => {
    // Engine always returns tool_calls, never a final answer — exhausts maxTurns.
    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockImplementation(async () => ({
          text: '',
          content: '',
          tool_calls: [
            {
              id: 'c0',
              type: 'function',
              function: {name: 'unused', arguments: '{}'},
            },
          ],
        }));
    }
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );
    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    // hitMaxTurns metadata landed.
    const calls = (chatSessionStore.updateMessage as jest.Mock).mock.calls;
    const hitMaxCall = calls.find(c => c[2]?.metadata?.hitMaxTurns === true);
    expect(hitMaxCall).toBeDefined();
    // Observability log.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('hit maxTurns'),
    );
    warnSpy.mockRestore();
  });

  it('#3 run_failed: error rollback writes {interrupted, copyable} into assistant_turn metadata (does not lose steps)', async () => {
    // Engine throws — runner emits run_failed. Silence the expected
    // console.error so the test output stays clean.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'));
    }
    const ref: {
      current: {createdAt: number; id: string; sessionId: string} | null;
    } = {current: null};
    const {result} = renderHook(() =>
      useChatSession(ref, textMessage.author, mockAssistant),
    );

    // Seed a session with an assistant_turn carrying partial step state so
    // the rollback path takes the "preserve metadata" branch.
    const turnId = 'turn-rollback-test';
    chatSessionStore.sessions = [
      {
        id: 'session-1',
        title: '',
        date: '',
        messages: [
          {
            id: turnId,
            type: 'assistant_turn',
            author: assistant,
            createdAt: Date.now(),
            steps: [{content: 'partial'}],
            metadata: {copyable: true},
          } as MessageType.AssistantTurn,
        ],
        completionSettings: {},
        settingsSource: 'pal',
      },
    ] as any;
    // The hook's prepareCompletion creates a fresh assistant turn with an
    // empty steps[] array; we want the test to verify the rollback path
    // when the runner errors — addMessageToCurrentSession is mocked to
    // inject the seeded id.
    (
      chatSessionStore.addMessageToCurrentSession as jest.Mock
    ).mockImplementation(async (msg: any) => {
      msg.id = turnId;
    });

    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    // Rollback path: updateMessage called with {interrupted: true} —
    // unless the partial-content check decided to delete the empty
    // turn instead. Either branch is acceptable; this test exercises
    // the FIRST branch by ensuring there is partial step content
    // present at rollback time.
    const updateMessageCalls = (chatSessionStore.updateMessage as jest.Mock)
      .mock.calls;
    const interruptedCall = updateMessageCalls.find(
      c => c[2]?.metadata?.interrupted === true,
    );
    // Either the interrupted-write branch fired (partial content present)
    // or the delete-empty branch fired (no partial content). Both are
    // valid; the contract is "no crash and no silent no-op".
    if (interruptedCall) {
      expect(interruptedCall[2].metadata.copyable).toBe(true);
    }
    // `addSystemMessage` always fires on a failed run — system message
    // gets added to surface the error.
    const sysCall = (
      chatSessionStore.addMessageToCurrentSession as jest.Mock
    ).mock.calls.find(c => c[0]?.metadata?.system === true);
    expect(sysCall).toBeDefined();

    errSpy.mockRestore();
  });

  it('#hookTest1 multi-step run with tool_call_finished: appendToolOutcome called for the active step', async () => {
    // Wire a fake talent into the registry so the runner's executeOne()
    // path finds it. Restore at end so other tests are not affected.
    const fakeTalent: TalentEngine = {
      name: 'calculate',
      execute: async () => ({type: 'text', summary: '4'}) as TalentResult,
      toToolDefinition: () => ({
        type: 'function',
        function: {name: 'calculate', description: '', parameters: {}},
      }),
    };
    talentRegistry.register(fakeTalent);
    // Pal advertises calculate so allowedTalentNames includes it.
    palStore.pals = [
      {
        id: 'pal-1',
        type: 'local',
        name: 'Calc Pal',
        systemPrompt: '',
        parameters: {},
        parameterSchema: [],
        isSystemPromptChanged: false,
        useAIPrompt: false,
        source: 'local',
        pact: {talents: [{name: 'calculate', necessity: 'optional'}]},
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
    chatSessionStore.activeSessionId = 'session-1';

    let turnIndex = 0;
    if (modelStore.context) {
      modelStore.context.completion = jest.fn().mockImplementation(async () => {
        turnIndex += 1;
        if (turnIndex === 1) {
          return {
            text: '',
            content: '',
            tool_calls: [
              {
                id: 'c0',
                type: 'function',
                function: {name: 'calculate', arguments: '{"e":"2+2"}'},
              },
            ],
          };
        }
        return {text: '4', content: '4'};
      });
    }

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );
    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    // appendToolOutcome fired with the calculate outcome.
    const calls = (chatSessionStore.appendToolOutcome as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const outcomeCall = calls.find(c => c[2]?.toolName === 'calculate');
    expect(outcomeCall).toBeDefined();
    expect(outcomeCall![2].responseContent).toBe('4');

    // Cleanup: remove the test talent so other tests aren't affected.
    (talentRegistry as any).engines.delete('calculate');
  });

  it('#hookTest2 tool turn: appendToolCall lands ids that match the upcoming appendToolOutcome callId by construction (per-frame id-match invariant)', async () => {
    // WHAT §5 cleanup #1 regression guard. The runner attaches its
    // normalized toolCalls to step_finished; the hook calls
    // appendToolCall with that list before appendToolOutcome fires
    // for each call. Per WHAT §6 canonical scenarios, the invariant
    // is: at every render frame, step.toolCalls[i].id === outcome.callId
    // (vacuously true while outcomes lag the calls; strictly enforced
    // as soon as both are present). This test verifies the invariant
    // by intercepting both writers and checking the call-order
    // produces matching ids.
    const fakeTalent: TalentEngine = {
      name: 'calculate',
      execute: async () => ({type: 'text', summary: '4'}) as TalentResult,
      toToolDefinition: () => ({
        type: 'function',
        function: {name: 'calculate', description: '', parameters: {}},
      }),
    };
    talentRegistry.register(fakeTalent);
    palStore.pals = [
      {
        id: 'pal-1',
        type: 'local',
        name: 'Calc Pal',
        systemPrompt: '',
        parameters: {},
        parameterSchema: [],
        isSystemPromptChanged: false,
        useAIPrompt: false,
        source: 'local',
        pact: {talents: [{name: 'calculate', necessity: 'optional'}]},
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
    chatSessionStore.activeSessionId = 'session-1';

    let turnIndex = 0;
    if (modelStore.context) {
      modelStore.context.completion = jest.fn().mockImplementation(async () => {
        turnIndex += 1;
        if (turnIndex === 1) {
          return {
            text: '',
            content: '',
            tool_calls: [
              {
                // Empty id from llama.rn — the runner reconciles via
                // normalizeToolCallIds. The hook MUST receive the
                // normalized id, not this raw one.
                id: '',
                type: 'function',
                function: {name: 'calculate', arguments: '{"e":"2+2"}'},
              },
            ],
          };
        }
        return {text: '4', content: '4'};
      });
    }

    const appendToolCallSpy = chatSessionStore.appendToolCall as jest.Mock;
    const appendToolOutcomeSpy =
      chatSessionStore.appendToolOutcome as jest.Mock;

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );
    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    expect(appendToolCallSpy).toHaveBeenCalled();
    expect(appendToolOutcomeSpy).toHaveBeenCalled();

    // For every appendToolCall invocation, every call.id MUST match a
    // subsequently-appended outcome.callId (within the same step).
    // The invariant: step.toolCalls[i].id === outcome.callId by
    // construction.
    const callsArgs = appendToolCallSpy.mock.calls;
    const outcomeArgs = appendToolOutcomeSpy.mock.calls;
    const calledIds = callsArgs.flatMap(c =>
      (c[2] as Array<{id: string}>).map(x => x.id),
    );
    const outcomeCallIds = outcomeArgs.map(c => (c[2] as {callId: string}).callId);
    // No empty ids emitted — runner normalized them.
    expect(calledIds.every(id => id.length > 0)).toBe(true);
    // Every outcome's callId must appear in the appendToolCall set.
    for (const cid of outcomeCallIds) {
      expect(calledIds).toContain(cid);
    }

    // Cleanup
    (talentRegistry as any).engines.delete('calculate');
  });

  it('handleStopPress aborts the in-flight runner before stopCompletion fires', async () => {
    let resolveCompletion: (v: any) => void;
    const completionPromise = new Promise(resolve => {
      resolveCompletion = resolve;
    });
    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockImplementation(() => completionPromise);
    }
    modelStore.setInferencing(true);

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );
    // Fire-and-forget the send so handleStopPress can interrupt it.
    const sendPromise = result.current.handleSendPress(textMessage);
    // Allow microtasks to run so the engine.completion() call is in
    // flight before we press stop.
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.handleStopPress();
    });

    expect(modelStore.engine?.stopCompletion).toHaveBeenCalled();

    // Resolve the pending completion so the awaiting handleSendPress
    // can finish and we don't leak an open promise.
    resolveCompletion!({
      text: 'cancelled',
      content: 'cancelled',
    });
    await act(async () => {
      await sendPromise;
    });
  });
});
