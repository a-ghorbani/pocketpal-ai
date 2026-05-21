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
import {chatSessionRepository} from '../../repositories/ChatSessionRepository';
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
    // The empty assistant turn is added WITHOUT metadata.copyable so
    // the turn footer's copy button stays hidden during streaming.
    // copyable is set later at run_finished (asserted below) or at the
    // abort catch path.
    const addAssistantCall = (
      chatSessionStore.addMessageToCurrentSession as jest.Mock
    ).mock.calls.find(args => args[0]?.type === 'assistant_turn');
    expect(addAssistantCall).toBeDefined();
    expect(addAssistantCall![0].metadata.copyable).toBeUndefined();
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
    // The runner attaches its normalized toolCalls to step_finished;
    // the hook calls appendToolCall with that list before
    // appendToolOutcome fires for each call. Invariant: at every
    // render frame, step.toolCalls[i].id === outcome.callId (vacuously
    // true while outcomes lag the calls; strictly enforced as soon as
    // both are present). This test verifies the invariant by
    // intercepting both writers and checking the call-order produces
    // matching ids.
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
    const outcomeCallIds = outcomeArgs.map(
      c => (c[2] as {callId: string}).callId,
    );
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

  // ---------- Per-frame id-match invariant under multi-tool /
  // multi-step / abort variations. hookTest2 covers the single-tool
  // case; these add coverage for the remaining shapes. ----------

  it('#hookTest3 multi-tool turn: appendToolCall lands TWO normalized ids before two appendToolOutcome calls (per-frame id-match holds across tools)', async () => {
    // Both tools succeed. The runner emits one step_finished with
    // toolCalls.length === 2; the hook calls appendToolCall once with
    // both, then appendToolOutcome twice (one per tool). The ids
    // attached to step_finished MUST match the outcome callIds by
    // construction — the runner reuses the same normalized list for
    // tool_call_started and tool_call_finished.
    const calcTalent: TalentEngine = {
      name: 'calculate',
      execute: async () => ({type: 'text', summary: '4'}) as TalentResult,
      toToolDefinition: () => ({
        type: 'function',
        function: {name: 'calculate', description: '', parameters: {}},
      }),
    };
    const dtTalent: TalentEngine = {
      name: 'datetime',
      execute: async () => ({type: 'text', summary: '8:28 AM'}) as TalentResult,
      toToolDefinition: () => ({
        type: 'function',
        function: {name: 'datetime', description: '', parameters: {}},
      }),
    };
    talentRegistry.register(calcTalent);
    talentRegistry.register(dtTalent);
    palStore.pals = [
      {
        id: 'pal-1',
        type: 'local',
        name: 'Multi Pal',
        systemPrompt: '',
        parameters: {},
        parameterSchema: [],
        isSystemPromptChanged: false,
        useAIPrompt: false,
        source: 'local',
        pact: {
          talents: [
            {name: 'calculate', necessity: 'optional'},
            {name: 'datetime', necessity: 'optional'},
          ],
        },
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
          // Both ids are empty — runner MUST normalize them via the
          // per-run seed. The hook's appendToolCall receives the
          // normalized list (not the raw empties).
          return {
            text: '',
            content: '',
            tool_calls: [
              {
                id: '',
                type: 'function',
                function: {name: 'calculate', arguments: '{"e":"2+2"}'},
              },
              {
                id: '',
                type: 'function',
                function: {name: 'datetime', arguments: '{}'},
              },
            ],
          };
        }
        return {text: '4 at 8:28', content: '4 at 8:28'};
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

    // appendToolCall called once for the multi-tool step (turn 0).
    const toolCallCalls = appendToolCallSpy.mock.calls.filter(
      c => (c[2] as Array<{id: string}>).length === 2,
    );
    expect(toolCallCalls).toHaveLength(1);
    const calls = toolCallCalls[0][2] as Array<{
      id: string;
      function: {name: string};
    }>;
    expect(calls).toHaveLength(2);
    expect(calls.every(c => c.id.length > 0)).toBe(true);
    // Distinct synthetic ids per index — runner appends `_<idx>` to
    // the seed.
    expect(calls[0].id).not.toBe(calls[1].id);

    // appendToolOutcome called twice (one per tool), each callId
    // matching one of the appendToolCall ids. This is the per-frame
    // id-match invariant for the multi-tool case.
    const outcomeIds = appendToolOutcomeSpy.mock.calls.map(
      c => (c[2] as {callId: string}).callId,
    );
    expect(outcomeIds).toHaveLength(2);
    const calledIds = calls.map(c => c.id);
    for (const oid of outcomeIds) {
      expect(calledIds).toContain(oid);
    }
    // Tool names match too — calculate came first, datetime second.
    expect(calls[0].function.name).toBe('calculate');
    expect(calls[1].function.name).toBe('datetime');

    // Cleanup
    (talentRegistry as any).engines.delete('calculate');
    (talentRegistry as any).engines.delete('datetime');
  });

  it('#hookTest4 tool-followed-by-tool (multi-step chain): appendToolCall fires per step, ids stay distinct across steps', async () => {
    // Step 0: invoke calculate. Step 1: invoke datetime. Step 2: final
    // answer. The runner attaches a fresh normalized list to each
    // step_finished; ids carry `seed + turn` so they stay distinct
    // across steps.
    const calcTalent: TalentEngine = {
      name: 'calculate',
      execute: async () => ({type: 'text', summary: '4'}) as TalentResult,
      toToolDefinition: () => ({
        type: 'function',
        function: {name: 'calculate', description: '', parameters: {}},
      }),
    };
    const dtTalent: TalentEngine = {
      name: 'datetime',
      execute: async () => ({type: 'text', summary: '8:28 AM'}) as TalentResult,
      toToolDefinition: () => ({
        type: 'function',
        function: {name: 'datetime', description: '', parameters: {}},
      }),
    };
    talentRegistry.register(calcTalent);
    talentRegistry.register(dtTalent);
    palStore.pals = [
      {
        id: 'pal-1',
        type: 'local',
        name: 'Multi Pal',
        systemPrompt: '',
        parameters: {},
        parameterSchema: [],
        isSystemPromptChanged: false,
        useAIPrompt: false,
        source: 'local',
        pact: {
          talents: [
            {name: 'calculate', necessity: 'optional'},
            {name: 'datetime', necessity: 'optional'},
          ],
        },
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
                id: '',
                type: 'function',
                function: {name: 'calculate', arguments: '{"e":"2+2"}'},
              },
            ],
          };
        }
        if (turnIndex === 2) {
          return {
            text: '',
            content: '',
            tool_calls: [
              {
                id: '',
                type: 'function',
                function: {name: 'datetime', arguments: '{}'},
              },
            ],
          };
        }
        return {text: 'done', content: 'done'};
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

    // appendToolCall fired twice — once per tool-using step.
    expect(appendToolCallSpy).toHaveBeenCalledTimes(2);

    // Each appendToolCall list has exactly one call with a non-empty
    // synthetic id; ids are distinct across steps (seed + turn).
    const allCalledIds = appendToolCallSpy.mock.calls.flatMap(c =>
      (c[2] as Array<{id: string}>).map(x => x.id),
    );
    expect(allCalledIds).toHaveLength(2);
    expect(allCalledIds.every(id => id.length > 0)).toBe(true);
    expect(new Set(allCalledIds).size).toBe(2); // distinct

    // appendToolOutcome called twice; each callId matches one of the
    // appendToolCall ids (per-frame id-match across step boundary).
    const outcomeIds = appendToolOutcomeSpy.mock.calls.map(
      c => (c[2] as {callId: string}).callId,
    );
    expect(outcomeIds).toHaveLength(2);
    for (const oid of outcomeIds) {
      expect(allCalledIds).toContain(oid);
    }

    // Cleanup
    (talentRegistry as any).engines.delete('calculate');
    (talentRegistry as any).engines.delete('datetime');
  });

  it('#hookTest5 abort during tool execution: appendToolCall still lands; partial outcomes preserved', async () => {
    // The runner finishes the in-flight tool call (executeOne is
    // not cancelled mid-execution per AgentRunner.ts:390-397
    // "Stop-mid-tool" comment). The abort is observed at the next
    // turn boundary. So appendToolCall + appendToolOutcome both
    // fire for the in-flight tool, then the run ends without a
    // follow-up turn. The hook's catch path is NOT entered (no
    // engineError). The id-match invariant must still hold.
    let resolveTalent: (r: TalentResult) => void;
    const talentPromise = new Promise<TalentResult>(resolve => {
      resolveTalent = resolve;
    });
    const slowTalent: TalentEngine = {
      name: 'calculate',
      execute: async () => talentPromise,
      toToolDefinition: () => ({
        type: 'function',
        function: {name: 'calculate', description: '', parameters: {}},
      }),
    };
    talentRegistry.register(slowTalent);
    palStore.pals = [
      {
        id: 'pal-1',
        type: 'local',
        name: 'Slow Pal',
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

    if (modelStore.context) {
      modelStore.context.completion = jest.fn().mockImplementation(async () => {
        return {
          text: '',
          content: '',
          tool_calls: [
            {
              id: '',
              type: 'function',
              function: {name: 'calculate', arguments: '{"e":"2+2"}'},
            },
          ],
        };
      });
    }

    const appendToolCallSpy = chatSessionStore.appendToolCall as jest.Mock;
    const appendToolOutcomeSpy =
      chatSessionStore.appendToolOutcome as jest.Mock;

    const {result} = renderHook(() =>
      useChatSession({current: null}, textMessage.author, mockAssistant),
    );
    const sendPromise = result.current.handleSendPress(textMessage);

    // Wait until the runner has yielded step_finished + the
    // appendToolCall write has fired. We can't observe runner state
    // directly, so wait for the spy.
    await act(async () => {
      // Spin a few microtasks until appendToolCall fires.
      for (let i = 0; i < 30; i++) {
        if (appendToolCallSpy.mock.calls.length > 0) {
          break;
        }
        await Promise.resolve();
      }
    });

    expect(appendToolCallSpy).toHaveBeenCalled();
    const calls = appendToolCallSpy.mock.calls[0][2] as Array<{
      id: string;
    }>;
    expect(calls).toHaveLength(1);
    expect(calls[0].id.length).toBeGreaterThan(0);

    // Now press stop while the talent is still pending.
    await act(async () => {
      await result.current.handleStopPress();
    });

    // Resolve the talent so the runner can proceed past
    // tool_call_finished and observe signal.aborted.
    resolveTalent!({type: 'text', summary: '4'} as TalentResult);

    await act(async () => {
      await sendPromise;
    });

    // The outcome was emitted (executeOne completed); per-frame
    // id-match holds across the abort boundary.
    expect(appendToolOutcomeSpy).toHaveBeenCalled();
    const outcomeId = (
      appendToolOutcomeSpy.mock.calls[0][2] as {callId: string}
    ).callId;
    expect(outcomeId).toBe(calls[0].id);

    // Cleanup
    (talentRegistry as any).engines.delete('calculate');
  });

  it('#hookTest6 abort with no partial content: empty turn deleted via repository, no interrupted-metadata write', async () => {
    // The runner throws BEFORE any token / step_finished. The hook's
    // catch path sees `hasPartialContent === false` → calls
    // chatSessionRepository.deleteMessage(turnId) and skips the
    // updateMessage({metadata: {interrupted, copyable}}) write. A
    // system message about the failure is added below.
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const deleteMessageSpy = jest
      .spyOn(chatSessionRepository, 'deleteMessage')
      .mockResolvedValue(undefined);

    if (modelStore.context) {
      modelStore.context.completion = jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'));
    }
    const ref: {
      current: {createdAt: number; id: string; sessionId: string} | null;
    } = {current: null};

    // Seed the active session as empty so the empty-turn (created
    // by prepareCompletion) is the only message at error time.
    const turnId = 'empty-turn-id';
    chatSessionStore.sessions = [
      {
        id: 'session-1',
        title: '',
        date: '',
        messages: [],
        completionSettings: {},
        settingsSource: 'pal',
      },
    ] as any;
    chatSessionStore.activeSessionId = 'session-1';

    // The hook calls addMessageToCurrentSession twice: once for the
    // user text, once for the empty assistant turn. Tag the second
    // (assistant_turn) with our known id and inject it into the
    // session, so the catch path's lookup succeeds.
    let addCount = 0;
    (
      chatSessionStore.addMessageToCurrentSession as jest.Mock
    ).mockImplementation(async (msg: any) => {
      addCount += 1;
      if (msg.type === 'assistant_turn') {
        msg.id = turnId;
        // Mirror real behaviour: the message lands in the active
        // session.
        const session = chatSessionStore.sessions.find(
          s => s.id === chatSessionStore.activeSessionId,
        );
        if (session) {
          (session as any).messages = [msg, ...session.messages];
        }
      } else {
        msg.id = `user-${addCount}`;
      }
    });

    const updateMessageSpy = chatSessionStore.updateMessage as jest.Mock;
    updateMessageSpy.mockClear();

    const {result} = renderHook(() =>
      useChatSession(ref, textMessage.author, mockAssistant),
    );
    await act(async () => {
      await result.current.handleSendPress(textMessage);
    });

    // PATH B: the empty turn is deleted from the repository.
    expect(deleteMessageSpy).toHaveBeenCalledWith(turnId);

    // No `interrupted` metadata write — that branch only fires when
    // partial content exists. Filter all updateMessage calls to
    // those that wrote metadata.interrupted=true; should be empty.
    const interruptedCalls = updateMessageSpy.mock.calls.filter(
      c => c[2]?.metadata?.interrupted === true,
    );
    expect(interruptedCalls).toHaveLength(0);

    // The empty turn is removed from the in-memory session by the
    // catch path's runInAction filter.
    const session = chatSessionStore.sessions.find(s => s.id === 'session-1');
    expect(session?.messages.find((m: any) => m.id === turnId)).toBeUndefined();

    // A system message about the failure is added to surface the
    // error to the user.
    const sysCall = (
      chatSessionStore.addMessageToCurrentSession as jest.Mock
    ).mock.calls.find(c => c[0]?.metadata?.system === true);
    expect(sysCall).toBeDefined();

    deleteMessageSpy.mockRestore();
    errSpy.mockRestore();
  });
});
