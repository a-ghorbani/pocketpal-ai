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
  try {
    parsedArgs = JSON.parse(call.function?.arguments || '{}');
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
        arguments: tc.function.arguments,
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
    triggerMarkers,
    messageId,
    maxTurns = DEFAULT_MAX_TURNS,
    signal,
  } = options;

  yield {type: 'run_started', messageId};

  // When the consumer aborts mid-stream (e.g. user taps the stop
  // button while the engine is generating tokens), the runner is the
  // only layer that has BOTH the abort signal AND the engine handle —
  // so it owns the abort→engine.stopCompletion translation. Without
  // this, the signal would only be observed between turns and the
  // in-flight engine.completion call could keep running native
  // generation while the JS layer believed the run had stopped. The
  // async IIFE handles all return shapes (Promise that resolves /
  // rejects, sync function returning undefined, sync throw) without
  // ever propagating an error out of the abort handler.
  const onAbort = () => {
    (async () => {
      try {
        await engine.stopCompletion?.();
      } catch (err) {
        console.warn('[agent] engine.stopCompletion failed:', err);
      }
    })();
  };
  signal?.addEventListener('abort', onAbort);

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

      // Per-iteration locals for marker detection. Declared INSIDE the
      // while body so each turn gets a fresh value automatically — no
      // function-scope state, no manual reset. A multi-step run with a
      // marker in step 0 and another in step 1 yields exactly two
      // `marker_seen` events because each iteration redeclares these.
      let accumulatedText = '';
      let markerSeenThisStep = false;
      // Per-step generation metrics (post-hoc display in chip / preview
      // footer). Counts streaming `token` events that carry tool_calls
      // and tracks the time between the first such event and step
      // finalisation. Reset every iteration via the surrounding `let`s.
      let toolCallTokenCount = 0;
      let toolCallStartedAt: number | null = null;

      // Bridge engine streaming callback into the iterator.
      const queue = new EventQueue<AgentEvent>();
      const turnParams: ApiCompletionParams = {...initialParams, messages};

      // Track engine failure separately so we can fully await the
      // promise (no unhandled rejection) before yielding the
      // run_failed event. The .then/.catch chain returns a fully-
      // settled promise — never rejects — by capturing the error in
      // `engineError` for surface above.
      let engineError: Error | null = null;
      const completionPromise = engine
        .completion(turnParams, data => {
          const delta = projectStreamChunk(data);
          if (
            delta.content ||
            delta.reasoningContent ||
            (delta.toolCalls && delta.toolCalls.length > 0)
          ) {
            // Order matters: enqueue the `token` event BEFORE the
            // `marker_seen` event. Consumers see the token arrive
            // normally, then transition on the marker. Test #19 asserts
            // this explicit sequence for a marker that straddles two
            // chunks.
            queue.push({type: 'token', delta});
            if (delta.toolCalls && delta.toolCalls.length > 0) {
              if (toolCallStartedAt === null) {
                toolCallStartedAt = Date.now();
              }
              toolCallTokenCount += 1;
            }
            if (delta.content) {
              accumulatedText += delta.content;
              if (!markerSeenThisStep && triggerMarkers.length > 0) {
                const matched = triggerMarkers.find(m =>
                  accumulatedText.includes(m),
                );
                if (matched) {
                  queue.push({type: 'marker_seen', marker: matched});
                  markerSeenThisStep = true;
                }
              }
            }
          }
        })
        .then(result => {
          lastResult = result;
          queue.finish();
        })
        .catch((err: unknown) => {
          engineError = err instanceof Error ? err : new Error(String(err));
          queue.finish();
        });

      // Drain the queue until the engine completes. The queue closes
      // when `completionPromise` resolves (success or failure both
      // call `queue.finish()`); the promise itself never rejects.
      while (true) {
        const next = await queue.next();
        if (next.done) {
          break;
        }
        yield next.value;
      }

      // Wait for the promise to settle (it can only fulfill at this
      // point; the .catch above swallows rejection into engineError).
      await completionPromise;

      if (engineError) {
        yield {type: 'run_failed', error: engineError};
        return;
      }

      // Compute normalized tool calls BEFORE the step_finished yield so
      // the event payload can carry them. The hook's appendToolCall
      // writer lands them on step.toolCalls with ids that match the
      // upcoming outcomes by construction.
      const finishedResult = lastResult;
      const rawToolCalls = finishedResult?.tool_calls ?? [];
      const callsWithoutMetrics =
        rawToolCalls.length === 0
          ? undefined
          : normalizeToolCallIds(rawToolCalls, callIdSeed + turn);
      // Attach per-step generation metrics: tokens counted across the
      // streaming run and ms from first tool-call token to here. The
      // step total is replicated onto each call — for multi-tool steps
      // this slightly overstates per-call cost, but the alternative
      // (omitting metrics on multi-tool) is worse UX and the case is
      // rare. Only attach when we actually saw tool-call tokens.
      const calls =
        callsWithoutMetrics && toolCallStartedAt !== null
          ? callsWithoutMetrics.map(call => ({
              ...call,
              metrics: {
                tokens: toolCallTokenCount,
                durationMs: Date.now() - toolCallStartedAt!,
              },
            }))
          : callsWithoutMetrics;

      yield {type: 'step_finished', turn, toolCalls: calls};

      if (!finishedResult) {
        break;
      }

      if (!calls || calls.length === 0) {
        // No tools requested — final answer landed.
        break;
      }

      const outcomes: AgentToolOutcome[] = [];
      for (const call of calls) {
        yield {type: 'tool_call_started', call};
        const outcome = await executeOne(
          call,
          allowedTalentNames,
          talentLookup,
        );
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

      // Use `content` (parsed natural-language preamble), NOT `text`
      // (raw streamed bytes). For tool-calling turns `text` includes
      // the model's tool-call markers and the full arguments JSON
      // (e.g. the entire `render_html` html string); putting that into
      // assistantMsg.content makes the chat template render the
      // tool_call TWICE on replay — once via `content` and once via
      // the structured `tool_calls` field. That doubles the prompt
      // size and breaks KV-cache prefix-match against turn N-1's
      // streamed bytes, so the engine fully prefills again. `content`
      // is the clean preamble (often empty for tool-only turns); the
      // structured `tool_calls` arg below carries the actual call.
      messages = buildNextTurnMessages(
        messages,
        finishedResult.content ?? '',
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
      finalResult:
        lastResult ??
        ({
          text: '',
          content: '',
        } as CompletionResult),
    };
    yield {type: 'run_finished', result};
  } catch (error) {
    yield {type: 'run_failed', error: error as Error};
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
