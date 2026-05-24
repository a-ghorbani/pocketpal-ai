import type {
  AgentStep,
  AgentToolCall,
  AgentToolOutcome,
} from '../../utils/types';
import type {
  ApiCompletionParams,
  CompletionEngine,
  CompletionResult,
} from '../../utils/completionTypes';
import type {TalentEngine} from '../talents/types';

/**
 * Tokens streamed from the engine, projected into a step-shaped delta.
 * The runner forwards these through the iterator so the reducer and
 * persistence layer can reconstruct the active step incrementally.
 */
export interface TokenDelta {
  content?: string;
  reasoningContent?: string;
  toolCalls?: AgentToolCall[];
}

/**
 * Final result of an agent run. Captures the full step list, whether
 * the loop hit `maxTurns`, and the engine's last completion result for
 * timing / metadata extraction by the hook.
 */
export interface AgentRunResult {
  steps: AgentStep[];
  hitMaxTurns: boolean;
  finalResult: CompletionResult;
}

/**
 * Discriminated union emitted by `runAgent`. Consumers (hook + reducer +
 * persistence layer) drive their state machines off this stream rather
 * than reading store state mid-run. Order is meaningful — consumers may
 * rely on `run_started` arriving before `step_started`, etc.
 */
export type AgentEvent =
  | {type: 'run_started'; messageId: string}
  | {type: 'step_started'; turn: number; isFollowUp: boolean}
  | {type: 'token'; delta: TokenDelta}
  | {type: 'marker_seen'; marker: string}
  | {type: 'tool_call_started'; call: AgentToolCall}
  | {type: 'tool_call_finished'; outcome: AgentToolOutcome}
  | {
      type: 'step_finished';
      turn: number;
      /**
       * The runner's authoritative normalized tool calls for this step,
       * attached when the step actually invoked tools. Optional because
       * text-only steps and the final step of a multi-turn chain don't
       * have any. When present, ids are reconciled with outcome callIds
       * via {@link normalizeToolCallIds} — the hook's `appendToolCall`
       * writer relies on this to make
       * `step.toolCalls[i].id === outcome.callId` true by construction.
       */
      toolCalls?: AgentToolCall[];
    }
  | {type: 'run_finished'; result: AgentRunResult}
  | {type: 'run_failed'; error: Error};

/**
 * UX-state derived from `AgentEvent`s by `agentStateReducer`. Lives on
 * `chatSessionStore.agentUiState`. Renderers compute "is this message
 * the active run?" once at ChatView level — see Active-vs-persisted
 * predicate in the story — and pass it down as `isActiveRun: boolean`.
 */
export interface AgentUiState {
  status:
    | 'idle'
    | 'prefill'
    | 'streaming_text'
    | 'generating_tool_call'
    | 'executing_tool'
    | 'done'
    | 'failed';
  pendingTalentNames: string[];
  hitMaxTurns: boolean;
}

export const initialAgentUiState: AgentUiState = {
  status: 'idle',
  pendingTalentNames: [],
  hitMaxTurns: false,
};

/**
 * Inputs to `runAgent`. The runner has no React/MobX/store imports —
 * the talent registry is injected via `talentLookup` and the message id
 * (already created by the hook before calling) is passed in.
 */
export interface AgentRunOptions {
  engine: CompletionEngine;
  initialParams: ApiCompletionParams;
  /** Names of talents this Pal advertises; outcomes for any other
   * talent the model invents are rejected with an error. */
  allowedTalentNames: string[];
  talentLookup: (name: string) => TalentEngine | undefined;
  /** Plain-text trigger markers (extracted from llama.rn
   * `grammar_triggers`) the streaming bridge scans for in
   * accumulated content. Precomputed by the hook before each
   * `runAgent` invocation — the runner never imports the cache or
   * `getFormattedChat`. Pass `[]` to disable marker detection;
   * `tool_call_started` still drives the UX status flip in that
   * case (one beat later). */
  triggerMarkers: string[];
  /** Pre-created message id for this run. The runner uses it only for
   * `run_started`; it does NOT touch any store. */
  messageId: string;
  maxTurns?: number;
  signal?: AbortSignal;
}
