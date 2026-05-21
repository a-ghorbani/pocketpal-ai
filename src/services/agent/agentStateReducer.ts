import type {AgentEvent, AgentUiState} from './AgentRunner.types';

/**
 * Reducer over the `AgentEvent` stream. Drives
 * `chatSessionStore.agentUiState`.
 *
 * Returns the same `state` reference when no semantic change occurred;
 * the chat hook's call-site guard relies on this to skip redundant
 * MobX writes (load-bearing for streaming perf).
 *
 * Never clears `pendingTalentNames` on a content/reasoning `token` —
 * streamed text must not overwrite a tool-call hint already on the step.
 */
export function agentStateReducer(
  state: AgentUiState,
  event: AgentEvent,
): AgentUiState {
  switch (event.type) {
    case 'run_started':
      return {
        status: 'prefill',
        pendingTalentNames: [],
        hitMaxTurns: false,
      };
    case 'step_started':
      // Both initial and follow-up steps route through `prefill` so the
      // pending indicator covers the dead zone until the first token.
      return {
        ...state,
        status: 'prefill',
        pendingTalentNames: [],
      };
    case 'token': {
      const incomingToolCalls = event.delta.toolCalls;
      if (incomingToolCalls && incomingToolCalls.length > 0) {
        const names = incomingToolCalls
          .map(tc => tc.function?.name)
          .filter((n): n is string => !!n);
        const alreadyGenerating = state.status === 'generating_tool_call';
        // Carry names — later deltas sometimes drop the function name
        // once it's been emitted, leaving anonymous calls.
        const carryNames =
          alreadyGenerating && state.pendingTalentNames.length > 0
            ? state.pendingTalentNames
            : names;
        if (alreadyGenerating && carryNames === state.pendingTalentNames) {
          return state;
        }
        return {
          ...state,
          status: 'generating_tool_call',
          pendingTalentNames: carryNames,
        };
      }
      // First content/reasoning token flips out of prefill.
      const hasVisibleDelta =
        (event.delta.content && event.delta.content.length > 0) ||
        (event.delta.reasoningContent &&
          event.delta.reasoningContent.length > 0);
      if (state.status === 'prefill' && hasVisibleDelta) {
        return {
          ...state,
          status: 'streaming_text',
        };
      }
      return state;
    }
    case 'marker_seen':
      if (state.status === 'generating_tool_call') {
        return state;
      }
      return {
        ...state,
        status: 'generating_tool_call',
      };
    case 'tool_call_started':
      return {
        ...state,
        status: 'executing_tool',
        pendingTalentNames: [],
      };
    case 'tool_call_finished':
    case 'step_finished':
      // Outcomes accumulate on the step; status flips on the next event.
      return state;
    case 'run_finished':
      return {
        status: 'done',
        pendingTalentNames: [],
        hitMaxTurns: !!event.result.hitMaxTurns,
      };
    case 'run_failed':
      return {
        ...state,
        status: 'failed',
        pendingTalentNames: [],
      };
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}
