import type {AgentEvent, AgentUiState} from './AgentRunner.types';

/**
 * Pure reducer over the `AgentEvent` stream produced by `runAgent`.
 * Hand-rolled (no XState dependency). Used by the chat hook to derive
 * `chatSessionStore.agentUiState` — the single observable bag that
 * powers every "the agent is doing X right now" UI signal.
 *
 * Invariants:
 *  - No side effects, no async, no React/MobX/store imports.
 *  - Idempotent on re-application of the same event (same input + state
 *    yields the same output).
 *  - Exhaustive switch over `AgentEvent.type`; the `never` default
 *    catches new event variants at compile time.
 *  - `pendingTalentNames` is purely transient — populated when parsed
 *    `toolCalls` first land in the stream and cleared once execution
 *    starts (`tool_call_started`) or the run finishes.
 *  - The reducer NEVER clears `pendingTalentNames` on a plain `token`
 *    event that carries `content` (regression guard for the metadata-bag
 *    bug where the streamed text overwrote the tool-call hint).
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
      return {
        ...state,
        status: 'streaming_text',
        pendingTalentNames: [],
      };
    case 'token': {
      const incomingToolCalls = event.delta.toolCalls;
      if (incomingToolCalls && incomingToolCalls.length > 0) {
        const names = incomingToolCalls
          .map(tc => tc.function?.name)
          .filter((n): n is string => !!n);
        return {
          ...state,
          status: 'generating_tool_call',
          pendingTalentNames: names,
        };
      }
      // Plain content/reasoning token: preserve current status and
      // pendingTalentNames. Critically, do NOT clear pendingTalentNames
      // when content arrives during a tool-call assembly — the
      // legacy metadata-bag bug that motivated this refactor.
      return state;
    }
    case 'marker_seen':
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
      // Stay in executing_tool until step_finished or the next token
      // event flips status; outcomes accumulate on the step itself.
      return state;
    case 'step_finished':
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
