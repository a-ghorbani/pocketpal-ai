import {LlamaContext} from 'llama.rn';
import {renderHook, act, waitFor} from '@testing-library/react-native';

import {textMessage} from '../../../jest/fixtures';
import {sessionFixtures} from '../../../jest/fixtures/chatSessions';
import {
  mockLlamaContextParams,
  modelsList,
} from '../../../jest/fixtures/models';

import {useChatSession} from '../useChatSession';
import {chatSessionStore, modelStore, palStore} from '../../store';
import type {
  CompletionResult,
  CompletionStreamData,
} from '../../utils/completionTypes';
import {convertToChatMessages} from '../../utils/chat';
import type {AgentStep, MessageType} from '../../utils/types';

const mockAssistant = {id: 'assistant'};
const user = textMessage.author;

type PendingCompletion = {
  emit: (data: CompletionStreamData) => void;
  finish: (result?: Partial<CompletionResult>) => void;
};

/** An engine whose completions stay pending until the test finishes them. */
function installEngine() {
  const completions: PendingCompletion[] = [];
  const engine = {
    completion: jest.fn(
      (_params: unknown, onData?: (data: CompletionStreamData) => void) =>
        new Promise<CompletionResult>(resolve => {
          completions.push({
            emit: data => onData?.(data),
            finish: result =>
              resolve({text: '', content: '', ...result} as CompletionResult),
          });
        }),
    ),
    stopCompletion: jest.fn(async () => {}),
  };
  modelStore.engine = engine;
  return {engine, completions};
}

const userBubbles = () =>
  (chatSessionStore.addMessageToCurrentSession as jest.Mock).mock.calls
    .map(([message]) => message as MessageType.Any)
    .filter(message => message.type === 'text' && message.author === user);

const lastCallArg = (fn: unknown) => {
  const calls = (fn as jest.Mock).mock.calls;
  return calls[calls.length - 1]?.[0];
};

function renderSession() {
  return renderHook(() => useChatSession({current: null}, user, mockAssistant))
    .result;
}

beforeEach(() => {
  palStore.pals = [] as any;
  chatSessionStore.sessions = sessionFixtures as any;
  chatSessionStore.activeSessionId = 'session-1';
  modelStore.models = modelsList as any;
  modelStore.activeModelId = undefined;
  modelStore.context = new LlamaContext(mockLlamaContextParams);
  modelStore.setInferencing(false);
  modelStore.setIsStreaming(false);
});

describe('useChatSession Stop and the generation lease', () => {
  it('Stop clears the run UI at once; an immediate send waits for the drain behind "Stopping…"', async () => {
    const {engine, completions} = installEngine();
    const session = renderSession();

    let first!: Promise<void>;
    await act(async () => {
      first = session.current.handleSendPress(textMessage);
    });
    await waitFor(() => expect(engine.completion).toHaveBeenCalledTimes(1));
    expect(modelStore.inferencing).toBe(true);
    expect(userBubbles()).toHaveLength(1);

    await session.current.handleStopPress();

    expect(modelStore.inferencing).toBe(false);
    expect(modelStore.isStreaming).toBe(false);
    expect(lastCallArg(chatSessionStore.setIsGenerating)).toBe(false);
    expect(lastCallArg(chatSessionStore.setAgentUiState).status).toBe('idle');
    expect(chatSessionStore.setIsStopping).not.toHaveBeenCalledWith(true);

    let second!: Promise<void>;
    await act(async () => {
      second = session.current.handleSendPress({
        ...textMessage,
        text: 'again',
      });
    });
    expect(chatSessionStore.setIsStopping).toHaveBeenLastCalledWith(true);
    expect(userBubbles()).toHaveLength(1);
    expect(engine.completion).toHaveBeenCalledTimes(1);

    await act(async () => {
      completions[0].finish({interrupted: true});
      await first;
    });
    await waitFor(() => expect(engine.completion).toHaveBeenCalledTimes(2));
    expect(chatSessionStore.setIsStopping).toHaveBeenLastCalledWith(false);
    expect(userBubbles()).toHaveLength(2);
    expect(userBubbles()[1]).toMatchObject({text: 'again'});
    expect(modelStore.inferencing).toBe(true);

    await act(async () => {
      completions[1].finish({text: 'ok', content: 'ok'});
      await second;
    });
    expect(modelStore.inferencing).toBe(false);
    expect(modelStore.isGenerationBusy).toBe(false);
  });

  it('a release-initiated abort clears the run UI at once and still persists the turn at drain', async () => {
    const {engine, completions} = installEngine();
    const session = renderSession();

    let sending!: Promise<void>;
    await act(async () => {
      sending = session.current.handleSendPress(textMessage);
    });
    await waitFor(() => expect(engine.completion).toHaveBeenCalledTimes(1));
    completions[0].emit({content: 'partial answer'});
    await waitFor(() => expect(modelStore.isStreaming).toBe(true));

    modelStore.abortActiveGeneration();

    expect(modelStore.inferencing).toBe(false);
    expect(modelStore.isStreaming).toBe(false);
    expect(chatSessionStore.updateMessage).not.toHaveBeenCalled();

    await act(async () => {
      completions[0].finish({
        text: 'partial answer',
        content: 'partial answer',
        interrupted: true,
      });
      await sending;
    });
    expect(chatSessionStore.updateMessage).toHaveBeenCalledWith(
      expect.anything(),
      'session-1',
      expect.objectContaining({
        metadata: expect.objectContaining({copyable: true}),
      }),
    );
    expect(chatSessionStore.setAgentUiState).not.toHaveBeenCalledWith(
      expect.objectContaining({status: 'done'}),
    );
  });

  it('a lease aborted before the hook attaches its listener never shows a run', async () => {
    const {engine} = installEngine();
    const acquire = modelStore.acquireGeneration as jest.Mock;
    const realAcquire = acquire.getMockImplementation()!;
    acquire.mockImplementationOnce(async () => {
      const lease = await realAcquire();
      lease.abort();
      return lease;
    });
    const session = renderSession();

    await act(async () => {
      await session.current.handleSendPress(textMessage);
    });

    expect(modelStore.inferencing).toBe(false);
    expect(chatSessionStore.setIsGenerating).not.toHaveBeenCalledWith(true);
    expect(engine.completion).not.toHaveBeenCalled();
    expect(modelStore.isGenerationBusy).toBe(false);
  });

  it('a lease aborted while the prompt is prepared starts no completion and leaves no Stop button', async () => {
    const {engine} = installEngine();
    let releaseSettings!: () => void;
    (
      chatSessionStore.getCurrentCompletionSettings as jest.Mock
    ).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          releaseSettings = () => resolve({});
        }),
    );
    const session = renderSession();

    let sending!: Promise<void>;
    await act(async () => {
      sending = session.current.handleSendPress(textMessage);
    });
    await waitFor(() => expect(releaseSettings).toBeDefined());
    modelStore.abortActiveGeneration();
    expect(modelStore.inferencing).toBe(false);

    await act(async () => {
      releaseSettings();
      await sending;
    });
    expect(engine.completion).not.toHaveBeenCalled();
    expect(modelStore.inferencing).toBe(false);
    expect(lastCallArg(chatSessionStore.setIsGenerating)).toBe(false);
  });

  it('two sends during one drain run in order, and isStopping clears when the first acquires', async () => {
    const {engine, completions} = installEngine();
    const session = renderSession();

    let first!: Promise<void>;
    await act(async () => {
      first = session.current.handleSendPress(textMessage);
    });
    await waitFor(() => expect(engine.completion).toHaveBeenCalledTimes(1));
    await session.current.handleStopPress();

    let second!: Promise<void>;
    let third!: Promise<void>;
    await act(async () => {
      second = session.current.handleSendPress({...textMessage, text: 'two'});
      third = session.current.handleSendPress({...textMessage, text: 'three'});
    });

    await act(async () => {
      completions[0].finish({interrupted: true});
      await first;
    });
    await waitFor(() => expect(engine.completion).toHaveBeenCalledTimes(2));
    expect(chatSessionStore.setIsStopping).toHaveBeenLastCalledWith(false);
    expect(userBubbles().map(m => (m as MessageType.Text).text)).toEqual([
      textMessage.text,
      'two',
    ]);

    await act(async () => {
      completions[1].finish({text: 'a', content: 'a'});
      await second;
    });
    await waitFor(() => expect(engine.completion).toHaveBeenCalledTimes(3));
    expect(userBubbles().map(m => (m as MessageType.Text).text)).toEqual([
      textMessage.text,
      'two',
      'three',
    ]);

    await act(async () => {
      completions[2].finish({text: 'b', content: 'b'});
      await third;
    });
  });

  it("after Stop, a session switch does not redirect the run's remaining writes", async () => {
    const {engine, completions} = installEngine();
    const session = renderSession();

    let sending!: Promise<void>;
    await act(async () => {
      sending = session.current.handleSendPress(textMessage);
    });
    await waitFor(() => expect(engine.completion).toHaveBeenCalledTimes(1));
    await session.current.handleStopPress();
    chatSessionStore.activeSessionId = 'session-2';

    await act(async () => {
      completions[0].finish({interrupted: true});
      await sending;
    });

    expect(chatSessionStore.finalizeActiveStep).toHaveBeenCalledWith(
      expect.anything(),
      'session-1',
    );
    expect(chatSessionStore.updateMessage).toHaveBeenCalledWith(
      expect.anything(),
      'session-1',
      expect.objectContaining({
        metadata: expect.objectContaining({copyable: true}),
      }),
    );
  });

  it('a run aborted while timers are paused (app backgrounded) still drains', async () => {
    jest.useFakeTimers();
    let now = 0;
    const performanceNow = jest
      .spyOn(performance, 'now')
      .mockImplementation(() => now);
    const flushPromises = async () => {
      for (let i = 0; i < 50; i += 1) {
        await Promise.resolve();
      }
    };
    try {
      const {engine, completions} = installEngine();
      const session = renderSession();

      let sendSettled = false;
      await act(async () => {
        session.current.handleSendPress(textMessage).then(() => {
          sendSettled = true;
        });
        await flushPromises();
      });
      expect(engine.completion).toHaveBeenCalledTimes(1);

      now = 1000;
      completions[0].emit({content: 'partial'});
      await act(flushPromises);

      modelStore.abortActiveGeneration();
      completions[0].finish({interrupted: true});
      await act(flushPromises);

      expect(engine.stopCompletion).toHaveBeenCalled();
      expect(sendSettled).toBe(true);
      expect(modelStore.isGenerationBusy).toBe(false);
    } finally {
      performanceNow.mockRestore();
      jest.useRealTimers();
    }
  });

  it('a store write that throws mid-stream stops and awaits the completion before the lease ends', async () => {
    const {engine, completions} = installEngine();
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    (
      chatSessionStore.updateActiveStepStreaming as jest.Mock
    ).mockImplementationOnce(() => {
      throw new Error('store write failed');
    });
    const session = renderSession();

    let settled = false;
    let sending!: Promise<void>;
    await act(async () => {
      sending = session.current.handleSendPress(textMessage).then(() => {
        settled = true;
      });
    });
    await waitFor(() => expect(engine.completion).toHaveBeenCalledTimes(1));
    completions[0].emit({content: 'boom'});

    await waitFor(() => expect(engine.stopCompletion).toHaveBeenCalled());
    expect(settled).toBe(false);
    expect(modelStore.isGenerationBusy).toBe(true);

    await act(async () => {
      completions[0].finish({interrupted: true});
      await sending;
    });
    expect(modelStore.inferencing).toBe(false);
    expect(modelStore.isGenerationBusy).toBe(false);
    consoleError.mockRestore();
  });
});

describe('useChatSession: a send whose chat changed while it waited', () => {
  async function sendWhileHeld(changeChat: () => void, text = 'hi') {
    const installed = installEngine();
    const session = renderSession();
    const held = (await modelStore.acquireGeneration())!;

    let sending!: Promise<void>;
    await act(async () => {
      sending = session.current.handleSendPress({...textMessage, text});
    });
    expect(chatSessionStore.setIsStopping).toHaveBeenLastCalledWith(true);

    changeChat();
    await act(async () => {
      held.end();
    });
    return {...installed, sending};
  }

  const expectNoRun = async ({
    engine,
    sending,
  }: Awaited<ReturnType<typeof sendWhileHeld>>) => {
    await act(async () => {
      await sending;
    });
    expect(chatSessionStore.addMessageToCurrentSession).not.toHaveBeenCalled();
    expect(chatSessionStore.createNewSession).not.toHaveBeenCalled();
    expect(engine.completion).not.toHaveBeenCalled();
    const next = modelStore.tryAcquireGeneration();
    expect(next).not.toBeNull();
    next?.end();
  };

  it('is cancelled when another chat is opened, and its text becomes the original chat draft', async () => {
    const sent = await sendWhileHeld(() => {
      chatSessionStore.activeSessionId = 'session-2';
    });
    await expectNoRun(sent);
    expect(chatSessionStore.restoreUnsentText).toHaveBeenCalledWith(
      'session-1',
      'hi',
    );
  });

  it('is cancelled when a new chat is started', async () => {
    const sent = await sendWhileHeld(() => {
      chatSessionStore.activeSessionId = null;
    });
    await expectNoRun(sent);
    expect(chatSessionStore.restoreUnsentText).toHaveBeenCalledWith(
      'session-1',
      'hi',
    );
  });

  it('sent from the new-chat screen, then another chat opened: the text goes back to the new chat', async () => {
    chatSessionStore.activeSessionId = null;
    const sent = await sendWhileHeld(() => {
      chatSessionStore.activeSessionId = 'session-2';
    });
    await expectNoRun(sent);
    expect(chatSessionStore.restoreUnsentText).toHaveBeenCalledWith(null, 'hi');
  });

  it('is sent normally when the user switched away and back before it was granted', async () => {
    const {engine, completions, sending} = await sendWhileHeld(() => {
      chatSessionStore.activeSessionId = 'session-2';
      chatSessionStore.activeSessionId = 'session-1';
    });
    await waitFor(() => expect(engine.completion).toHaveBeenCalledTimes(1));
    expect(userBubbles().map(m => (m as MessageType.Text).text)).toEqual([
      'hi',
    ]);
    expect(chatSessionStore.restoreUnsentText).not.toHaveBeenCalled();
    await act(async () => {
      completions[0].finish({text: 'a', content: 'a'});
      await sending;
    });
  });

  it('writes no row when the original chat was deleted during the wait', async () => {
    const sent = await sendWhileHeld(() => {
      chatSessionStore.sessions = chatSessionStore.sessions.filter(
        s => s.id !== 'session-1',
      );
      chatSessionStore.activeSessionId = null;
    });
    await expectNoRun(sent);
    expect(chatSessionStore.restoreUnsentText).toHaveBeenCalledWith(
      'session-1',
      'hi',
    );
  });

  it('adds no "model not loaded" message to the other chat when the model went away too', async () => {
    const {engine} = installEngine();
    const session = renderSession();
    (modelStore.acquireGeneration as jest.Mock).mockImplementationOnce(
      async () => {
        chatSessionStore.activeSessionId = 'session-2';
        return null;
      },
    );

    await act(async () => {
      await session.current.handleSendPress({...textMessage, text: 'hi'});
    });

    expect(chatSessionStore.addMessageToCurrentSession).not.toHaveBeenCalled();
    expect(engine.completion).not.toHaveBeenCalled();
    expect(chatSessionStore.restoreUnsentText).toHaveBeenCalledWith(
      'session-1',
      'hi',
    );
  });
});

describe('useChatSession: the turn a Stop leaves in the chat', () => {
  /** Replays the run's step writes the way ChatSessionStore applies them. */
  function persistedTurn(): MessageType.AssistantTurn {
    const emptyTurn = (
      chatSessionStore.addMessageToCurrentSession as jest.Mock
    ).mock.calls
      .map(([message]) => message as MessageType.Any)
      .find(message => message.type === 'assistant_turn')!;
    const writes = (
      [
        'pushAgentStep',
        'updateActiveStepStreaming',
        'finalizeActiveStep',
      ] as const
    )
      .flatMap(name => {
        const {calls, invocationCallOrder} = (
          chatSessionStore[name] as jest.Mock
        ).mock;
        return calls.map((args, i) => ({
          name,
          fields: args[2] as Partial<AgentStep>,
          order: invocationCallOrder[i],
        }));
      })
      .sort((a, b) => a.order - b.order);
    const steps: AgentStep[] = [];
    for (const {name, fields} of writes) {
      if (name === 'pushAgentStep') {
        steps.push(fields);
      } else if (steps.length > 0) {
        const last = steps.length - 1;
        steps[last] = {
          ...steps[last],
          ...(name === 'finalizeActiveStep' ? {partial: false} : fields),
        };
      }
    }
    const metadata = (chatSessionStore.updateMessage as jest.Mock).mock.calls
      .map(([, , update]) => update.metadata)
      .reduce((acc, next) => ({...acc, ...next}), emptyTurn.metadata);
    return {...(emptyTurn as MessageType.AssistantTurn), steps, metadata};
  }

  const nextPromptRoles = (turn: MessageType.AssistantTurn) =>
    convertToChatMessages([
      {...textMessage, id: 'follow-up', text: 'follow-up'},
      turn,
      textMessage,
    ]).map(message => message.role);

  async function stopInPrefill() {
    const {engine, completions} = installEngine();
    const session = renderSession();
    let sending!: Promise<void>;
    await act(async () => {
      sending = session.current.handleSendPress(textMessage);
    });
    await waitFor(() => expect(engine.completion).toHaveBeenCalledTimes(1));
    await session.current.handleStopPress();
    await act(async () => {
      completions[0].finish({interrupted: true});
      await sending;
    });
    return persistedTurn();
  }

  async function stopBeforeStart() {
    const {engine} = installEngine();
    let releaseSettings!: () => void;
    (
      chatSessionStore.getCurrentCompletionSettings as jest.Mock
    ).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          releaseSettings = () => resolve({});
        }),
    );
    const session = renderSession();
    let sending!: Promise<void>;
    await act(async () => {
      sending = session.current.handleSendPress(textMessage);
    });
    await waitFor(() => expect(releaseSettings).toBeDefined());
    await session.current.handleStopPress();
    await act(async () => {
      releaseSettings();
      await sending;
    });
    expect(engine.completion).not.toHaveBeenCalled();
    return persistedTurn();
  }

  it('a Stop before the completion starts leaves the same turn as a Stop in prefill, and the next prompt alternates', async () => {
    const inPrefill = await stopInPrefill();
    jest.clearAllMocks();
    const beforeStart = await stopBeforeStart();

    expect(inPrefill.steps).toEqual([{partial: false}]);
    expect(beforeStart.steps).toEqual(inPrefill.steps);
    expect(beforeStart.metadata?.copyable).toBe(true);
    expect(nextPromptRoles(inPrefill)).toEqual(['user', 'assistant', 'user']);
    expect(nextPromptRoles(beforeStart)).toEqual(['user', 'assistant', 'user']);
  });
});
