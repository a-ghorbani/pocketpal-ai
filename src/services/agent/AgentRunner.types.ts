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
  | {type: 'step_finished'; turn: number}
  | {type: 'run_finished'; result: AgentRunResult}
  | {type: 'run_failed'; error: Error};

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
  /** Pre-created message id for this run. The runner uses it only for
   * `run_started`; it does NOT touch any store. */
  messageId: string;
  maxTurns?: number;
  signal?: AbortSignal;
}
