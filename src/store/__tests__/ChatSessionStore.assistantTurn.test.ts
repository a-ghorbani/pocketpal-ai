jest.unmock('../ChatSessionStore');

import {chatSessionStore, defaultCompletionSettings} from '../ChatSessionStore';
import {chatSessionRepository} from '../../repositories/ChatSessionRepository';
import {AgentStep, AgentToolOutcome, MessageType} from '../../utils/types';
import {initialAgentUiState} from '../../services/agent';

jest.spyOn(chatSessionRepository, 'updateMessage');
jest.spyOn(chatSessionRepository, 'updateSessionTitle');

const author = {id: 'assistant'};

function makeAssistantTurn(
  steps: AgentStep[] = [],
  overrides: Partial<MessageType.AssistantTurn> = {},
): MessageType.AssistantTurn {
  return {
    id: 'turn-1',
    type: 'assistant_turn',
    author,
    createdAt: 1700000000000,
    steps,
    metadata: {copyable: true},
    ...overrides,
  };
}

describe('ChatSessionStore — AssistantTurn extensions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chatSessionStore.sessions = [];
    chatSessionStore.activeSessionId = null;
    chatSessionStore.agentUiState = {...initialAgentUiState};
    (chatSessionRepository.updateMessage as jest.Mock).mockResolvedValue(true);
    (chatSessionRepository.updateSessionTitle as jest.Mock).mockResolvedValue(
      undefined,
    );
  });

  // ---------- agentUiState + isGeneratingToolCall computed ----------

  describe('agentUiState + isGeneratingToolCall (@computed)', () => {
    it('isGeneratingToolCall is computed from agentUiState.status', () => {
      chatSessionStore.setAgentUiState({
        status: 'generating_tool_call',
        pendingTalentNames: ['calculate'],
        hitMaxTurns: false,
      });
      expect(chatSessionStore.isGeneratingToolCall).toBe(true);

      chatSessionStore.setAgentUiState({
        status: 'streaming_text',
        pendingTalentNames: [],
        hitMaxTurns: false,
      });
      expect(chatSessionStore.isGeneratingToolCall).toBe(false);
    });

    it('setAgentUiState replaces the whole state object', () => {
      const next = {
        status: 'executing_tool' as const,
        pendingTalentNames: ['render_html'],
        hitMaxTurns: false,
      };
      chatSessionStore.setAgentUiState(next);
      expect(chatSessionStore.agentUiState).toEqual(next);
    });
  });

  // ---------- pushAgentStep / appendToolOutcome / finalizeActiveStep ----------

  describe('pushAgentStep', () => {
    it('appends a new step to an assistant_turn message and persists steps wholesale', async () => {
      const turn = makeAssistantTurn([{content: 'first'}]);
      chatSessionStore.sessions = [
        {
          id: 'session1',
          title: 'Session',
          date: new Date().toISOString(),
          messages: [turn],
          completionSettings: defaultCompletionSettings,
          settingsSource: 'pal',
        },
      ];
      chatSessionStore.activeSessionId = 'session1';

      const newStep: AgentStep = {partial: true};
      await chatSessionStore.pushAgentStep(turn.id, 'session1', newStep);

      const updated = chatSessionStore.sessions[0]
        .messages[0] as MessageType.AssistantTurn;
      expect(updated.steps).toHaveLength(2);
      expect(updated.steps[1]).toEqual(newStep);

      expect(chatSessionRepository.updateMessage).toHaveBeenCalledWith(
        turn.id,
        {steps: updated.steps},
      );
    });

    it('is a no-op when the message is not an assistant_turn', async () => {
      const textMsg: MessageType.Text = {
        id: 'm1',
        type: 'text',
        text: 'hi',
        author,
        createdAt: 1,
      };
      chatSessionStore.sessions = [
        {
          id: 'session1',
          title: 'Session',
          date: '',
          messages: [textMsg],
          completionSettings: defaultCompletionSettings,
          settingsSource: 'pal',
        },
      ];
      chatSessionStore.activeSessionId = 'session1';

      await chatSessionStore.pushAgentStep('m1', 'session1', {partial: true});
      expect(chatSessionRepository.updateMessage).not.toHaveBeenCalled();
    });
  });

  describe('appendToolOutcome', () => {
    it('#6 appends outcome onto the active (last) step of an assistant_turn', async () => {
      const initialStep: AgentStep = {
        content: 'thinking',
        toolCalls: [{id: 'c0', function: {name: 'calculate', arguments: '{}'}}],
      };
      const turn = makeAssistantTurn([{content: 'preamble'}, initialStep]);
      chatSessionStore.sessions = [
        {
          id: 'session1',
          title: 'Session',
          date: '',
          messages: [turn],
          completionSettings: defaultCompletionSettings,
          settingsSource: 'pal',
        },
      ];
      chatSessionStore.activeSessionId = 'session1';

      const outcome: AgentToolOutcome = {
        callId: 'c0',
        toolName: 'calculate',
        result: {type: 'text', summary: '42'},
        responseContent: '42',
      };
      await chatSessionStore.appendToolOutcome(turn.id, 'session1', outcome);

      const updated = chatSessionStore.sessions[0]
        .messages[0] as MessageType.AssistantTurn;
      // Earlier step untouched.
      expect(updated.steps[0]).toEqual({content: 'preamble'});
      // Last step gets the outcome appended.
      expect(updated.steps[1].toolOutcomes).toEqual([outcome]);
      expect(chatSessionRepository.updateMessage).toHaveBeenCalledWith(
        turn.id,
        {steps: updated.steps},
      );
    });

    it('returns silently when there are no steps yet', async () => {
      const turn = makeAssistantTurn([]);
      chatSessionStore.sessions = [
        {
          id: 'session1',
          title: '',
          date: '',
          messages: [turn],
          completionSettings: defaultCompletionSettings,
          settingsSource: 'pal',
        },
      ];
      chatSessionStore.activeSessionId = 'session1';

      await chatSessionStore.appendToolOutcome(turn.id, 'session1', {
        callId: 'c0',
        toolName: 'calculate',
        result: {type: 'text', summary: '0'},
        responseContent: '0',
      });
      expect(chatSessionRepository.updateMessage).not.toHaveBeenCalled();
    });
  });

  describe('finalizeActiveStep', () => {
    it('marks the last step as partial=false and persists wholesale', async () => {
      const turn = makeAssistantTurn([
        {content: 'preamble'},
        {content: 'final', partial: true},
      ]);
      chatSessionStore.sessions = [
        {
          id: 'session1',
          title: '',
          date: '',
          messages: [turn],
          completionSettings: defaultCompletionSettings,
          settingsSource: 'pal',
        },
      ];
      chatSessionStore.activeSessionId = 'session1';

      await chatSessionStore.finalizeActiveStep(turn.id, 'session1');

      const updated = chatSessionStore.sessions[0]
        .messages[0] as MessageType.AssistantTurn;
      expect(updated.steps[0]).toEqual({content: 'preamble'});
      expect(updated.steps[1].partial).toBe(false);
      expect(chatSessionRepository.updateMessage).toHaveBeenCalledWith(
        turn.id,
        {steps: updated.steps},
      );
    });
  });

  // ---------- updateActiveStepStreaming + throttle-share ----------

  describe('updateActiveStepStreaming', () => {
    let mockTime: number;
    let dateNowSpy: jest.SpyInstance;

    beforeEach(() => {
      mockTime = 2000000;
      dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => mockTime);
      jest.useFakeTimers();
      (chatSessionStore as any).lastStreamingUpdateTime = 0;
      (chatSessionStore as any).pendingStreamingUpdate = null;
      if ((chatSessionStore as any).streamingThrottleTimer) {
        clearTimeout((chatSessionStore as any).streamingThrottleTimer);
        (chatSessionStore as any).streamingThrottleTimer = null;
      }
    });

    afterEach(() => {
      jest.useRealTimers();
      dateNowSpy.mockRestore();
    });

    it('#5 merges into steps[steps.length - 1] only; earlier steps untouched', () => {
      const turn = makeAssistantTurn([
        {content: 'first', partial: false},
        {content: '', partial: true},
      ]);
      chatSessionStore.sessions = [
        {
          id: 'session1',
          title: '',
          date: '',
          messages: [turn],
          completionSettings: defaultCompletionSettings,
          settingsSource: 'pal',
        },
      ];
      chatSessionStore.activeSessionId = 'session1';

      chatSessionStore.updateActiveStepStreaming(turn.id, 'session1', {
        content: 'streaming text',
      });
      const updated = chatSessionStore.sessions[0]
        .messages[0] as MessageType.AssistantTurn;
      // Earlier step untouched.
      expect(updated.steps[0]).toEqual({content: 'first', partial: false});
      // Active step has streaming content.
      expect(updated.steps[1].content).toBe('streaming text');
      expect(updated.steps[1].partial).toBe(true);
    });

    it('#7 reuses the same throttle slot as updateMessageStreaming (per-token writes coalesce, not stack)', () => {
      const turn = makeAssistantTurn([{content: '', partial: true}]);
      chatSessionStore.sessions = [
        {
          id: 'session1',
          title: '',
          date: '',
          messages: [turn],
          completionSettings: defaultCompletionSettings,
          settingsSource: 'pal',
        },
      ];
      chatSessionStore.activeSessionId = 'session1';

      // First call: applies immediately (no throttle active).
      chatSessionStore.updateActiveStepStreaming(turn.id, 'session1', {
        content: 'a',
      });
      expect(
        (chatSessionStore.sessions[0].messages[0] as MessageType.AssistantTurn)
          .steps[0].content,
      ).toBe('a');

      // Subsequent calls within the throttle window: coalesce into the
      // single slot. The pendingStreamingUpdate is overwritten — never
      // appended to a queue.
      chatSessionStore.updateActiveStepStreaming(turn.id, 'session1', {
        content: 'a-b',
      });
      chatSessionStore.updateActiveStepStreaming(turn.id, 'session1', {
        content: 'a-b-c',
      });
      expect((chatSessionStore as any).pendingStreamingUpdate).toEqual({
        kind: 'step',
        id: turn.id,
        sessionId: 'session1',
        partial: {content: 'a-b-c'},
      });

      // Mixing in a legacy text update overwrites the same slot — confirms
      // the throttle slot is shared across paths, not per-shape.
      chatSessionStore.updateMessageStreaming(turn.id, 'session1', {
        text: 'legacy',
      });
      expect((chatSessionStore as any).pendingStreamingUpdate.kind).toBe(
        'text',
      );
    });
  });

  // ---------- updateMessage on assistant_turn ----------

  describe('updateMessage on assistant_turn (#8)', () => {
    it('writes {metadata: {interrupted: true}} without losing steps (regression guard for error rollback)', async () => {
      const steps: AgentStep[] = [
        {content: 'preamble', partial: false},
        {
          content: 'partial answer',
          partial: false,
          toolCalls: [
            {id: 'c0', function: {name: 'calculate', arguments: '{}'}},
          ],
        },
      ];
      const turn = makeAssistantTurn(steps, {
        metadata: {copyable: true, contextId: 'ctx-1'},
      });
      chatSessionStore.sessions = [
        {
          id: 'session1',
          title: '',
          date: '',
          messages: [turn],
          completionSettings: defaultCompletionSettings,
          settingsSource: 'pal',
        },
      ];
      chatSessionStore.activeSessionId = 'session1';

      await chatSessionStore.updateMessage(turn.id, 'session1', {
        metadata: {interrupted: true, copyable: true},
      });

      const updated = chatSessionStore.sessions[0]
        .messages[0] as MessageType.AssistantTurn;
      // Type unchanged.
      expect(updated.type).toBe('assistant_turn');
      // Steps preserved (unaffected by the metadata-only update).
      expect(updated.steps).toEqual(steps);
      // metadata merged with existing fields.
      expect(updated.metadata?.contextId).toBe('ctx-1');
      expect(updated.metadata?.copyable).toBe(true);
      expect(updated.metadata?.interrupted).toBe(true);
      // Repository called with the metadata-only update.
      expect(chatSessionRepository.updateMessage).toHaveBeenCalledWith(
        turn.id,
        {metadata: {interrupted: true, copyable: true}},
      );
    });

    it('updates assistant_turn steps top-level via updateMessage', async () => {
      const turn = makeAssistantTurn([{content: 'old'}]);
      chatSessionStore.sessions = [
        {
          id: 'session1',
          title: '',
          date: '',
          messages: [turn],
          completionSettings: defaultCompletionSettings,
          settingsSource: 'pal',
        },
      ];
      chatSessionStore.activeSessionId = 'session1';

      const newSteps: AgentStep[] = [{content: 'new', partial: false}];
      await chatSessionStore.updateMessage(turn.id, 'session1', {
        steps: newSteps,
      });

      const updated = chatSessionStore.sessions[0]
        .messages[0] as MessageType.AssistantTurn;
      expect(updated.steps).toEqual(newSteps);
    });
  });

  // ---------- updateSessionTitle on a session ending in assistant_turn (#9) ----------

  describe('updateSessionTitle on assistant_turn-ending sessions (#9)', () => {
    it('derives title from derivedText(message), not empty, when last message is assistant_turn', async () => {
      const turn = makeAssistantTurn([{content: 'Hello there, friend'}]);
      const session = {
        id: 'session1',
        title: 'New Session',
        date: new Date().toISOString(),
        messages: [turn],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as const,
      };

      await chatSessionStore.updateSessionTitle(session);
      expect(chatSessionRepository.updateSessionTitle).toHaveBeenCalledWith(
        session.id,
        'Hello there, friend',
      );
      expect(session.title).toBe('Hello there, friend');
    });

    it('multi-step turn: title joins step.content with blank line, then truncates if needed', async () => {
      const turn = makeAssistantTurn([
        {content: 'Let me look that up'},
        {content: 'The answer is 42'},
      ]);
      const session = {
        id: 'session1',
        title: 'New Session',
        date: '',
        messages: [turn],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as const,
      };
      await chatSessionStore.updateSessionTitle(session);
      // 'Let me look that up\n\nThe answer is 42' is 39 chars — under 40, so
      // no truncation.
      expect(session.title).toBe('Let me look that up\n\nThe answer is 42');
    });

    it('skips when steps yield no derived text', async () => {
      const turn = makeAssistantTurn([
        {
          toolCalls: [
            {id: 'c0', function: {name: 'calculate', arguments: '{}'}},
          ],
        },
      ]);
      const session = {
        id: 'session1',
        title: 'New Session',
        date: '',
        messages: [turn],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as const,
      };
      await chatSessionStore.updateSessionTitle(session);
      expect(chatSessionRepository.updateSessionTitle).not.toHaveBeenCalled();
      expect(session.title).toBe('New Session');
    });
  });
});
