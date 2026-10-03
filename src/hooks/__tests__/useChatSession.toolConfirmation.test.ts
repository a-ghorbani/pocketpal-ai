import {LlamaContext} from 'llama.rn';
import {renderHook, act} from '@testing-library/react-native';

import {textMessage} from '../../../jest/fixtures';
import {sessionFixtures} from '../../../jest/fixtures/chatSessions';
import {
  mockLlamaContextParams,
  modelsList,
} from '../../../jest/fixtures/models';

import {useChatSession} from '../useChatSession';
import {activateKeepAwake, deactivateKeepAwake} from '../../utils/keepAwake';
import {chatSessionStore, modelStore, palStore} from '../../store';
import {runAgent} from '../../services/agent';
import type {ToolConfirmationRequest} from '../../services/agent/AgentRunner.types';

// Only runAgent is replaced: the hook's confirmation state machine is what is
// under test, so the run is held open by hand rather than driven by a model.
jest.mock('../../services/agent', () => ({
  ...jest.requireActual('../../services/agent'),
  runAgent: jest.fn(),
}));

const runAgentMock = runAgent as unknown as jest.Mock;
const mockAssistant = {id: 'h3o3lc5xj'};

const request = (callId: string): ToolConfirmationRequest =>
  ({
    call: {
      id: callId,
      type: 'function',
      function: {name: 'add_note', arguments: '{}'},
    },
    toolName: 'add_note',
    args: {id: 'n1'},
    detail: 'POST http://127.0.0.1:8765/notes/{{id}}',
  }) as ToolConfirmationRequest;

jest
  .spyOn(require('../../utils/chat'), 'applyChatTemplate')
  .mockImplementation(async () => 'mocked prompt');

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
    completion: jest.fn(async () => ({text: '', content: ''})),
    stopCompletion: jest.fn(async () => {}),
  } as any;
});

/**
 * Start a send whose run stays open until `release()` is called, and hand back
 * the `confirmToolCall` the hook injected into the runner.
 */
const startHeldRun = async () => {
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => {
    release = resolve;
  });
  let confirmToolCall:
    | ((req: ToolConfirmationRequest) => Promise<boolean>)
    | undefined;

  runAgentMock.mockImplementation(async function* (options: any) {
    confirmToolCall = options.confirmToolCall;
    await held;
  });

  const rendered = renderHook(() =>
    useChatSession({current: null}, textMessage.author, mockAssistant),
  );

  let sendPromise: Promise<void> | undefined;
  await act(async () => {
    sendPromise = rendered.result.current.handleSendPress(textMessage);
    await Promise.resolve();
  });

  return {rendered, release, sendPromise, getConfirm: () => confirmToolCall!};
};

describe('useChatSession tool confirmation', () => {
  it('opens a pending confirmation carrying the call id, name, args and detail', async () => {
    const {rendered, release, sendPromise, getConfirm} = await startHeldRun();

    let answered: Promise<boolean> | undefined;
    await act(async () => {
      answered = getConfirm()(request('call-1'));
      await Promise.resolve();
    });

    expect(rendered.result.current.pendingToolConfirmation).toMatchObject({
      callId: 'call-1',
      toolName: 'add_note',
      detail: 'POST http://127.0.0.1:8765/notes/{{id}}',
    });
    expect(rendered.result.current.pendingToolConfirmation!.argsJson).toContain(
      'n1',
    );

    release();
    await act(async () => {
      await sendPromise;
    });
    await expect(answered!).resolves.toBe(false);
  });

  it('settles only the matching call id, so a stale answer cannot decline the next call', async () => {
    const {rendered, release, sendPromise, getConfirm} = await startHeldRun();

    let answered: Promise<boolean> | undefined;
    await act(async () => {
      answered = getConfirm()(request('call-2'));
      await Promise.resolve();
    });

    // A late answer for the previous call must not touch this one.
    await act(async () => {
      rendered.result.current.resolveToolConfirmation('call-1', false);
    });
    expect(rendered.result.current.pendingToolConfirmation?.callId).toBe(
      'call-2',
    );

    await act(async () => {
      rendered.result.current.resolveToolConfirmation('call-2', true);
    });
    await expect(answered!).resolves.toBe(true);
    expect(rendered.result.current.pendingToolConfirmation).toBeNull();

    // A second answer for an already settled id is a no-op.
    await act(async () => {
      rendered.result.current.resolveToolConfirmation('call-2', false);
    });
    expect(rendered.result.current.pendingToolConfirmation).toBeNull();

    release();
    await act(async () => {
      await sendPromise;
    });
  });

  it('declines and clears when the run exits with a confirmation still pending', async () => {
    const {rendered, release, sendPromise, getConfirm} = await startHeldRun();

    let answered: Promise<boolean> | undefined;
    await act(async () => {
      answered = getConfirm()(request('call-3'));
      await Promise.resolve();
    });

    release();
    await act(async () => {
      await sendPromise;
    });

    await expect(answered!).resolves.toBe(false);
    expect(rendered.result.current.pendingToolConfirmation).toBeNull();
  });

  /** The run flags the re-take guard reads; neither is writable on the mock. */
  const setRunFlags = (isGenerating: boolean, isStopping: boolean) => {
    Object.assign(chatSessionStore, {isGenerating, isStopping});
  };

  it('releases the screen while pending and re-takes it while still generating', async () => {
    const {rendered, release, sendPromise, getConfirm} = await startHeldRun();
    setRunFlags(true, false);
    (deactivateKeepAwake as jest.Mock).mockClear();
    (activateKeepAwake as jest.Mock).mockClear();

    await act(async () => {
      getConfirm()(request('call-5'));
      await Promise.resolve();
    });

    expect(deactivateKeepAwake).toHaveBeenCalledTimes(1);
    expect(activateKeepAwake).not.toHaveBeenCalled();

    await act(async () => {
      rendered.result.current.resolveToolConfirmation('call-5', true);
    });

    expect(activateKeepAwake).toHaveBeenCalledTimes(1);

    release();
    await act(async () => {
      await sendPromise;
    });
    setRunFlags(false, false);
  });

  it('does not re-take the screen when the answer lands after Stop', async () => {
    const {rendered, release, sendPromise, getConfirm} = await startHeldRun();
    setRunFlags(true, false);

    await act(async () => {
      getConfirm()(request('call-6'));
      await Promise.resolve();
    });

    // Stop released the screen on purpose; the late answer must leave it alone.
    setRunFlags(true, true);
    (activateKeepAwake as jest.Mock).mockClear();

    await act(async () => {
      rendered.result.current.resolveToolConfirmation('call-6', true);
    });

    expect(activateKeepAwake).not.toHaveBeenCalled();

    release();
    await act(async () => {
      await sendPromise;
    });
    setRunFlags(false, false);
  });

  it('declines when the screen unmounts while a confirmation is pending', async () => {
    const {rendered, release, sendPromise, getConfirm} = await startHeldRun();

    let answered: Promise<boolean> | undefined;
    await act(async () => {
      answered = getConfirm()(request('call-4'));
      await Promise.resolve();
    });

    await act(async () => {
      rendered.unmount();
    });

    await expect(answered!).resolves.toBe(false);

    release();
    await act(async () => {
      await sendPromise;
    });
  });
});
