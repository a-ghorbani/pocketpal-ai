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
        pendingToolTokens: 0,
        hitMaxTurns: false,
      };
    case 'step_started':
      // Both initial and follow-up steps route through `prefill` so the
      // indicator (D4, owned by ChatView) covers the dead zone between
      // step setup and the first content/reasoning token. The first
      // such token flips status to `streaming_text` via the regular
      // `case 'token'` path below (the prefill→streaming_text rule).
      //
      // For initial steps, `prefill` was already set by `run_started`,
      // but explicitly setting it here keeps the rule uniform across
      // both branches and prevents the indicator from disappearing in
      // the brief window between run_started and the first token.
      //
      // For follow-up steps, this transitions out of `executing_tool`
      // (where the previous step left us) into `prefill` until the
      // follow-up's first token lands. The `isFollowUp` flag remains on
      // the event for any per-step UI that needs it.
      return {
        ...state,
        status: 'prefill',
        pendingTalentNames: [],
        pendingToolTokens: 0,
      };
    case 'token': {
      const incomingToolCalls = event.delta.toolCalls;
      if (incomingToolCalls && incomingToolCalls.length > 0) {
        const names = incomingToolCalls
          .map(tc => tc.function?.name)
          .filter((n): n is string => !!n);
        // Each token event during tool-call generation = one token
        // emitted by the model. Counting events sidesteps engine
        // encoding details (cumulative vs incremental arguments;
        // llama.rn vs OpenAI streaming shape) — every emit is +1.
        const carryNames =
          state.status === 'generating_tool_call' &&
          state.pendingTalentNames.length > 0
            ? state.pendingTalentNames
            : names;
        return {
          ...state,
          status: 'generating_tool_call',
          // Preserve the names from the first delta — later deltas
          // sometimes drop the function name once it's already been
          // emitted, leaving us with anonymous calls. Honouring the
          // first non-empty set keeps the label stable across the run.
          pendingTalentNames: carryNames,
          pendingToolTokens: state.pendingToolTokens + 1,
        };
      }
      // Plain content/reasoning token: if we were waiting in `prefill`
      // (initial step or follow-up routed through prefill per WHAT §3),
      // the first such token flips status to `streaming_text` so the
      // indicator (D4) hides as soon as visible output starts. Do NOT
      // clear pendingTalentNames here — that's the regression guard for
      // the legacy metadata-bag bug where streamed content overwrote
      // the tool-call hint.
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
      return {
        ...state,
        status: 'generating_tool_call',
      };
    case 'tool_call_started':
      return {
        ...state,
        status: 'executing_tool',
        pendingTalentNames: [],
        pendingToolTokens: 0,
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
        pendingToolTokens: 0,
        hitMaxTurns: !!event.result.hitMaxTurns,
      };
    case 'run_failed':
      return {
        ...state,
        status: 'failed',
        pendingTalentNames: [],
        pendingToolTokens: 0,
      };
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}
