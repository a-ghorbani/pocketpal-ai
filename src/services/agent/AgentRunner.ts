import type {
  ApiCompletionParams,
  CompletionResult,
  CompletionStreamData,
} from '../../utils/completionTypes';
import type {ChatMessage} from '../../utils/types';
import type {AgentToolCall, AgentToolOutcome} from '../../utils/types';

import type {
  AgentEvent,
  AgentRunOptions,
  AgentRunResult,
  TokenDelta,
} from './AgentRunner.types';
import type {TalentResult} from '../talents/types';

const DEFAULT_MAX_TURNS = 5;

/**
 * Bridge a synchronous-callback engine into an async iterator. The
 * callback fires from JS land (or native, hopping the bridge) on every
 * token delta; the producer pushes events into the queue and resolves
 * any pending consumer wait. The consumer (the runner's outer loop)
 * pulls via `next()` and either gets a queued event immediately or
 * awaits the next push. The promise gets re-armed every pull so there
 * is no deadlock and no event drop.
 */
class EventQueue<T> {
  private queue: T[] = [];
  private waiter: ((value: IteratorResult<T>) => void) | null = null;
  private done = false;

  push(value: T): void {
    if (this.done) {
      return;
    }
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w({value, done: false});
      return;
    }
    this.queue.push(value);
  }

  finish(): void {
    if (this.done) {
      return;
    }
    this.done = true;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w({value: undefined as unknown as T, done: true});
    }
  }

  next(): Promise<IteratorResult<T>> {
    const queued = this.queue.shift();
    if (queued !== undefined) {
      return Promise.resolve({value: queued, done: false});
    }
    if (this.done) {
      return Promise.resolve({value: undefined as unknown as T, done: true});
    }
    return new Promise(resolve => {
      this.waiter = resolve;
    });
  }
}

/**
 * Project a llama.rn streaming chunk into a step-shaped delta. We
 * forward the parsed tool_calls (when present) so the reducer can
 * populate `pendingTalentNames` and the persistence layer can update
 * the active step's `toolCalls` field as soon as parsing succeeds.
 */
function projectStreamChunk(data: CompletionStreamData): TokenDelta {
  const delta: TokenDelta = {};
  if (data.content && data.content.length > 0) {
    delta.content = data.content;
  }
  if (data.reasoning_content && data.reasoning_content.length > 0) {
    delta.reasoningContent = data.reasoning_content;
  }
  if (data.tool_calls && data.tool_calls.length > 0) {
    delta.toolCalls = data.tool_calls.map(tc => ({
      id: tc.id ?? '',
      type: 'function',
      function: {
        name: tc.function?.name ?? '',
        arguments: tc.function?.arguments ?? '',
      },
    }));
  }
  return delta;
}

/**
 * Backfill stable synthetic ids onto raw tool calls. llama.rn sometimes
 * returns id=null; strict Jinja templates reject `tool_call_id: null`
 * in the next-turn tool response, so we synthesize deterministic ids
 * from a per-run seed + index. Same shape as the legacy hook used.
 */
function normalizeToolCallIds(
  raw: NonNullable<CompletionResult['tool_calls']>,
  seed: number,
): AgentToolCall[] {
  return raw.map((tc, i) => ({
    id: tc.id || `call_${seed}_${i}`,
    type: 'function',
    function: {
      name: tc.function?.name ?? '',
      arguments: tc.function?.arguments ?? '',
    },
  }));
}

/**
 * Execute one tool call and produce an `AgentToolOutcome`. Errors are
 * captured as `result.type === 'error'`; the outcome is always
 * produced (never thrown) so the loop stays driven by the iterator.
 */
async function executeOne(
  call: AgentToolCall,
  allowedTalentNames: string[],
  talentLookup: (name: string) => ReturnType<AgentRunOptions['talentLookup']>,
): Promise<AgentToolOutcome> {
  const fnName = call.function?.name ?? '';
  const callId = call.id;

  if (!fnName || !allowedTalentNames.includes(fnName)) {
    const summary = fnName
      ? `Talent "${fnName}" is not enabled for this Pal`
      : 'Unknown talent (no function name)';
    const result: TalentResult = {
      type: 'error',
      summary,
      errorMessage: summary,
    };
    return {callId, toolName: fnName, result, responseContent: summary};
  }

  const handler = talentLookup(fnName);
  if (!handler) {
    const summary = `Talent "${fnName}" is not available on this device`;
    const result: TalentResult = {
      type: 'error',
      summary,
      errorMessage: summary,
    };
    return {callId, toolName: fnName, result, responseContent: summary};
  }

  let parsedArgs: Record<string, unknown> = {};
  const args = call.function?.arguments;
  try {
    parsedArgs =
      typeof args === 'string' ? JSON.parse(args || '{}') : (args ?? {});
  } catch {
    const summary = `Error: invalid JSON arguments for ${fnName}`;
    const result: TalentResult = {
      type: 'error',
      summary,
      errorMessage: summary,
    };
    return {callId, toolName: fnName, result, responseContent: summary};
  }

  try {
    const toolResult = await handler.execute(parsedArgs);
    return {
      callId,
      toolName: fnName,
      result: toolResult,
      responseContent: toolResult.summary,
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    const summary = `Error executing ${fnName}: ${errMsg}`;
    const result: TalentResult = {
      type: 'error',
      summary,
      errorMessage: errMsg,
    };
    return {callId, toolName: fnName, result, responseContent: summary};
  }
}

/**
 * Build the API messages array for the next turn after a tool round.
 * The previous turn's assistant message + its tool responses are
 * appended in OpenAI-spec order (assistant-with-tool_calls precedes
 * its role:'tool' responses so tool_call_id back-refs resolve).
 */
function buildNextTurnMessages(
  prior: ApiCompletionParams['messages'],
  assistantContent: string,
  toolCalls: AgentToolCall[],
  outcomes: AgentToolOutcome[],
  reasoningContent?: string,
): ApiCompletionParams['messages'] {
  const assistantMsg: ChatMessage = {
    role: 'assistant',
    content: assistantContent,
    tool_calls: toolCalls.map(tc => ({
      id: tc.id,
      type: 'function',
      function: {
        name: tc.function.name,
        arguments:
          typeof tc.function.arguments === 'string'
            ? tc.function.arguments
            : JSON.stringify(tc.function.arguments ?? {}),
      },
    })) as NonNullable<ChatMessage['tool_calls']>,
  };
  if (reasoningContent && reasoningContent.length > 0) {
    assistantMsg.reasoning_content = reasoningContent;
  }
  const toolMsgs: ChatMessage[] = outcomes.map(o => ({
    role: 'tool',
    tool_call_id: o.callId,
    content: o.responseContent,
  }));
  // The `messages` field on ApiCompletionParams is typed as
  // llama.rn's RNLlamaOAICompatibleMessage[]. Our ChatMessage shape
  // is the on-the-wire-equivalent — cast at the boundary.
  return [
    ...(prior ?? []),
    assistantMsg as unknown as NonNullable<
      ApiCompletionParams['messages']
    >[number],
    ...(toolMsgs as unknown as NonNullable<
      ApiCompletionParams['messages']
    >[number][]),
  ];
}

/**
 * The agent loop. Returns an `AsyncIterable<AgentEvent>` so the hook
 * can drive the reducer + per-step persistence in lockstep with
 * `for await`. Zero React/MobX/store imports — see test #15.
 */
export async function* runAgent(
  options: AgentRunOptions,
): AsyncGenerator<AgentEvent, void, void> {
  const {
    engine,
    initialParams,
    allowedTalentNames,
    talentLookup,
    messageId,
    maxTurns = DEFAULT_MAX_TURNS,
    signal,
  } = options;

  yield {type: 'run_started', messageId};

  let messages = initialParams.messages;
  let turn = 0;
  // Holds the engine's CompletionResult after each turn finishes.
  // Mutated from inside the streaming-bridge `.then` handler (the
  // `as CompletionResult | null` cast is a TS hint so that the
  // outer-loop reads after `await completionPromise` see the right
  // type — without it, narrowing through the closure collapses to
  // `never`).
  let lastResult: CompletionResult | null = null as CompletionResult | null;
  const callIdSeed = Date.now();

  try {
    while (turn < maxTurns) {
      if (signal?.aborted) {
        break;
      }

      yield {type: 'step_started', turn, isFollowUp: turn > 0};

      // Bridge engine streaming callback into the iterator.
      const queue = new EventQueue<AgentEvent>();
      let lastSeenToolCallSet: string | null = null;
      const turnParams: ApiCompletionParams = {...initialParams, messages};

      const completionPromise = engine
        .completion(turnParams, data => {
          const delta = projectStreamChunk(data);
          if (
            delta.content ||
            delta.reasoningContent ||
            (delta.toolCalls && delta.toolCalls.length > 0)
          ) {
            queue.push({type: 'token', delta});
          }
          // Emit tool_call_started exactly once per call, on first
          // sighting. The set key uses ids in stable order so partial
          // streaming updates don't double-fire.
          if (delta.toolCalls && delta.toolCalls.length > 0) {
            const setKey = delta.toolCalls
              .map(tc => tc.id || tc.function?.name || '')
              .sort()
              .join('|');
            if (setKey !== lastSeenToolCallSet) {
              lastSeenToolCallSet = setKey;
            }
          }
        })
        .then(result => {
          lastResult = result;
          queue.finish();
          return result;
        })
        .catch(err => {
          queue.push({type: 'run_failed', error: err as Error});
          queue.finish();
          throw err;
        });

      // Drain the queue until the engine completes. The queue closes
      // when `completionPromise` resolves (success or failure paths
      // both call `queue.finish()`).
      while (true) {
        const next = await queue.next();
        if (next.done) {
          break;
        }
        yield next.value;
        if (next.value.type === 'run_failed') {
          // The thrown error from `completionPromise` will surface
          // below; bail out of the inner loop now.
          break;
        }
      }

      // Surface any rejection from the engine (also re-runs the
      // catch-block below for the run_failed event already yielded).
      try {
        await completionPromise;
      } catch (err) {
        // Already yielded run_failed above; don't yield it twice.
        return;
      }

      yield {type: 'step_finished', turn};

      const finishedResult = lastResult;
      if (!finishedResult) {
        break;
      }

      const rawToolCalls = finishedResult.tool_calls ?? [];
      if (rawToolCalls.length === 0) {
        // No tools requested — final answer landed.
        break;
      }

      const calls = normalizeToolCallIds(rawToolCalls, callIdSeed + turn);

      const outcomes: AgentToolOutcome[] = [];
      for (const call of calls) {
        yield {type: 'tool_call_started', call};
        const outcome = await executeOne(call, allowedTalentNames, talentLookup);
        outcomes.push(outcome);
        yield {type: 'tool_call_finished', outcome};
      }

      // Stop-mid-tool: if the abort fired during execution, the
      // outcomes for in-flight calls have been emitted (we don't
      // cancel synchronous-ish talents). Bail out at this turn
      // boundary; the next turn would just be a follow-up the user
      // doesn't want.
      if (signal?.aborted) {
        break;
      }

      messages = buildNextTurnMessages(
        messages,
        finishedResult.text ?? finishedResult.content ?? '',
        calls,
        outcomes,
        finishedResult.reasoning_content,
      );
      turn += 1;
    }

    const result: AgentRunResult = {
      // The runner does NOT track the steps[] internally — the hook
      // builds them from events. We pass an empty array here; the
      // reducer/persistence layer is the source of truth for the
      // final step list. `hitMaxTurns` and `finalResult` are the
      // useful fields.
      steps: [],
      hitMaxTurns: turn >= maxTurns,
      finalResult: lastResult ?? ({
        text: '',
        content: '',
      } as CompletionResult),
    };
    yield {type: 'run_finished', result};
  } catch (error) {
    yield {type: 'run_failed', error: error as Error};
  }
}
