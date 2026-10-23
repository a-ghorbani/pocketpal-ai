import React, {useRef} from 'react';
import {AccessibilityInfo} from 'react-native';

import {toJS} from 'mobx';
import type {JinjaFormattedChatResult} from 'llama.rn';

import {randId} from '../utils';
import {L10nContext} from '../utils';
import {
  chatSessionStore,
  modelStore,
  NEW_SESSION_TITLE,
  palStore,
  serverStore,
  ttsStore,
  uiStore,
} from '../store';
import type {GenerationLease} from '../store/generationLease';
import type {PersistedTurnTimings} from '../utils/completionTypes';
import {resolveReasoningCapability} from '../utils/reasoningCapability';

import {
  MessageType,
  ModelOrigin,
  User,
  type AgentToolCall,
} from '../utils/types';
import {
  RemoteModelNotReadyError,
  RemoteModelRequestWithdrawnError,
  createMultimodalWarning,
} from '../utils/errors';
import {routerFailureMessage} from '../utils/routerCopy';
import {
  assembleMessages,
  resolveSystemMessages,
} from '../utils/systemPromptResolver';
import {
  convertToChatMessages,
  removeThinkingParts,
  visibleStepContent,
} from '../utils/chat';
import {activateKeepAwake, deactivateKeepAwake} from '../utils/keepAwake';
import {
  toApiCompletionParams,
  ApiCompletionParams,
  CompletionParams,
  CompletionResult,
  CompletionResultSnapshot,
} from '../utils/completionTypes';
import {
  collectSystemPromptFragments,
  seedReadUrlAllowlist,
  talentRegistry,
} from '../services/talents';
import type {ToolDefinition} from '../services/talents/types';
import {
  DOCUMENT_GROUNDING,
  documentContentFor,
  documentKey,
  modeOf,
  renderExcerptBlock,
  withDocumentContent,
} from '../services/documents/render';
import {retrieveExcerpts} from '../services/documents/retrieve';
import {documentCountingOptions} from '../utils/documentCounting';
import {
  findMissingDocuments,
  loadDocumentTexts,
  releaseSendHold,
} from '../services/documents/store';
import {hasDocuments} from '../services/documents/budget';
import {
  documentPlan,
  rowsBefore,
  type BudgetVerdict,
  type Plan,
  type PlanInput,
} from '../services/documents/plan';
import type {DocumentRef} from '../services/documents/types';
import {
  agentStateReducer,
  createTriggerMarkerCache,
  DEFAULT_MAX_TURNS,
  initialAgentUiState,
  runAgent,
  type AgentEvent,
  type AgentUiState,
  type TokenDelta,
} from '../services/agent';
const documentGroundingFragment = (refs: DocumentRef[]): string[] =>
  refs.length > 0 ? [DOCUMENT_GROUNDING] : [];

/**
 * The system message (prompt, talent fragments, document grounding) and the
 * converted history: one builder for the send and for the budget plan.
 */
const buildPromptMessages = ({
  rows,
  systemMessages,
  settings,
  isMultimodalEnabled,
  refs,
  documentContent,
  tail,
}: {
  rows: MessageType.Any[];
  systemMessages: Array<{role: 'system'; content: string}>;
  settings: CompletionParams | undefined;
  isMultimodalEnabled: boolean;
  refs: DocumentRef[];
  documentContent?: (row: MessageType.Text) => string | undefined;
  tail: Parameters<typeof assembleMessages>[2][number];
}) => {
  const history = convertToChatMessages(
    rows.filter(msg => msg.type !== 'image'),
    isMultimodalEnabled,
    documentContent,
  );
  const chatMessages =
    settings?.include_thinking_in_context === false
      ? history.map(msg =>
          msg.role === 'assistant' && typeof msg.content === 'string'
            ? {...msg, content: removeThinkingParts(msg.content)}
            : msg,
        )
      : history;
  const toolNames = (
    (settings?.tools as ToolDefinition[] | undefined) ?? []
  ).map(tool => tool.function?.name ?? '');
  const fragments = [
    ...collectSystemPromptFragments(toolNames, {
      now: new Date(),
      maxToolTurns: DEFAULT_MAX_TURNS,
    }),
    ...documentGroundingFragment(refs),
  ];
  return assembleMessages(systemMessages, fragments, [...chatMessages, tail]);
};

const excerptBlockFor = async (
  textRows: MessageType.Text[],
  message: MessageType.PartialText,
  fullTexts: Map<string, string[] | 'missing'>,
  plan: Plan,
  assistantId: string,
): Promise<string> => {
  const searched = (refs: DocumentRef[] = []) =>
    refs.filter(ref => modeOf(ref) === 'searched');
  const counting = documentCountingOptions();
  const result = await retrieveExcerpts({
    query: message.text,
    previousQuery: textRows.find(row => row.author.id !== assistantId)?.text,
    searchedRefs: [
      ...[...textRows].reverse().flatMap(row => searched(row.documents)),
      ...searched(message.documents),
    ],
    load: async ref => {
      const key = documentKey(ref);
      const read = fullTexts.get(key);
      if (read !== undefined) {
        return read;
      }
      return (await loadDocumentTexts([ref])).get(key) ?? 'missing';
    },
    excerptBudget: plan.excerptBudget,
    measure: counting
      ? async excerpts => {
          try {
            return await counting.tokenize(
              renderExcerptBlock({kind: 'excerpts', excerpts}),
            );
          } catch {
            return undefined;
          }
        }
      : undefined,
  });
  return renderExcerptBlock(result);
};

// Helper function to prepare completion parameters using OpenAI-compatible
// messages API. Creates the empty `assistant_turn` row up-front so the
// active-vs-persisted predicate sees the right "last message" before the
// run flips to `preparing`.
const prepareCompletion = async ({
  imageUris,
  message,
  systemMessages,
  contextId,
  assistant,
  conversationIdRef,
  isMultimodalEnabled,
  l10n,
  currentMessages,
  plan,
}: {
  imageUris: string[];
  message: MessageType.PartialText;
  systemMessages: Array<{role: 'system'; content: string}>;
  contextId: string;
  assistant: User;
  conversationIdRef: string;
  isMultimodalEnabled: boolean;
  l10n: any;
  currentMessages: MessageType.Any[];
  plan?: Plan;
}) => {
  const sessionCompletionSettings =
    await chatSessionStore.getCurrentCompletionSettings();
  const stopWords = toJS(modelStore.activeModel?.stopWords);

  // Check if we have images and if multimodal is enabled
  const hasImages = imageUris && imageUris.length > 0;

  const textRows = currentMessages.filter(
    (msg): msg is MessageType.Text => msg.type === 'text',
  );
  const documentRefs = [
    ...textRows.flatMap(row => row.documents ?? []),
    ...(message.documents ?? []),
  ];
  const fullTexts = await loadDocumentTexts(
    documentRefs.filter(ref => modeOf(ref) === 'full'),
  );
  const searchedOnly = documentRefs.filter(
    ref => modeOf(ref) === 'searched' && !fullTexts.has(documentKey(ref)),
  );
  const missingSearched = await findMissingDocuments(searchedOnly);
  const documentTexts = new Map(fullTexts);
  for (const ref of searchedOnly) {
    const key = documentKey(ref);
    documentTexts.set(key, missingSearched.has(key) ? 'missing' : []);
  }
  const excerptBlock =
    plan && plan.excerptBudget > 0
      ? await excerptBlockFor(textRows, message, fullTexts, plan, assistant.id)
      : undefined;
  const newDocumentContent = documentContentFor(
    message.documents,
    documentTexts,
    excerptBlock,
  );
  const userText = newDocumentContent
    ? withDocumentContent(newDocumentContent, message.text)
    : message.text;

  // Create user message content - use array format only for multimodal,
  // string for text-only.
  let userMessageContent: any;

  if (hasImages && isMultimodalEnabled) {
    userMessageContent = [
      {
        type: 'text',
        text: userText,
      },
      ...imageUris.map(path => ({
        type: 'image_url',
        image_url: {url: path},
      })),
    ];
  } else {
    userMessageContent = userText;

    if (hasImages && !isMultimodalEnabled) {
      uiStore.setChatWarning(
        createMultimodalWarning(l10n.chat.multimodalNotEnabled),
      );
    }
  }

  const messages = buildPromptMessages({
    rows: currentMessages,
    systemMessages,
    settings: sessionCompletionSettings as CompletionParams,
    isMultimodalEnabled,
    refs: documentRefs,
    documentContent: row => documentContentFor(row.documents, documentTexts),
    tail: {role: 'user', content: userMessageContent},
  });

  // Reseed the read_url exfiltration allowlist for this run; the trust policy
  // (which sources count) lives in the talents module.
  seedReadUrlAllowlist(
    [
      ...textRows
        .filter(row => row.author.id !== assistant.id)
        .map(row => row.text),
      message.text,
    ],
    currentMessages,
  );

  const completionParamsWithAppProps = {
    ...sessionCompletionSettings,
    messages,
    stop: stopWords,
  };

  const cleanCompletionParams = toApiCompletionParams(
    completionParamsWithAppProps as CompletionParams,
  );

  // reasoning_format is always 'auto' for the local (llama.rn) path: a no-op for
  // non-reasoning models and the value that extracts reasoning into
  // reasoning_content instead of leaking raw channel/think markers into content
  // (e.g. gemma-4 emits an empty <|channel>thought block even when thinking is
  // off). On/off is carried solely by enable_thinking. "Off" stays a best-effort
  // hint — it never strips reasoning the model still returns (rendered by
  // ReasoningBlock); separate from include_thinking_in_context, which only
  // governs what prior <think> we SEND.
  const isReasoningCapable =
    resolveReasoningCapability(
      modelStore.activeModel,
      serverStore.remoteReasoning,
    ).isReasoning !== 'no';
  cleanCompletionParams.reasoning_format = 'auto';
  // The enable_thinking:false hint only matters for reasoning-capable models;
  // a non-reasoning model would just ignore it.
  if (isReasoningCapable && !cleanCompletionParams.enable_thinking) {
    cleanCompletionParams.chat_template_kwargs = {
      ...cleanCompletionParams.chat_template_kwargs,
      enable_thinking: false,
    };
  }
  // Graded effort (gpt-oss-style): carried by the resolver-populated intent.
  const reasoningEffort = cleanCompletionParams.reasoning?.effort;
  if (reasoningEffort) {
    cleanCompletionParams.chat_template_kwargs = {
      ...cleanCompletionParams.chat_template_kwargs,
      reasoning_effort: reasoningEffort,
    };
  }

  // Create the empty AssistantTurn row in the store BEFORE the run
  // flips agentUiState.status to `preparing` so the active-vs-persisted
  // predicate (last message AND status in active set) sees a coherent
  // state from the very first frame.
  const createdAt = Date.now();
  const emptyTurn: MessageType.AssistantTurn = {
    author: assistant,
    createdAt,
    id: '', // populated by addMessageToCurrentSession
    type: 'assistant_turn',
    steps: [],
    metadata: {
      contextId,
      conversationId: conversationIdRef,
      // copyable is intentionally absent here: the turn footer's copy
      // button renders iff metadata.copyable is set, and at this point
      // the turn has nothing worth copying yet. It is set later at
      // run_finished (success/maxTurns) or at the abort catch path with
      // partial content.
      multimodal: hasImages,
    },
  };

  await chatSessionStore.addMessageToCurrentSession(emptyTurn);

  const messageInfo = {
    createdAt,
    id: emptyTurn.id, // set by addMessageToCurrentSession
    sessionId: chatSessionStore.activeSessionId!,
  };

  return {cleanCompletionParams, messageInfo};
};

// Per-run TTS streaming state. The runner emits content/reasoning
// CUMULATIVE PER STEP on each `token` event (mirroring llama.rn's
// callback semantics); the TTS streaming hooks expect per-call deltas,
// so we diff cumulative against `prev*` (reset at each step) and
// forward only the new substring.
// Carried in ctx so a single run keeps a coherent audio stream.
type TtsRunState = {
  // Snapshot of autoSpeakEnabled at run start; gates the per-chunk
  // TTS hook. Per-run so mid-stream toggles don't flicker audio.
  enabled: boolean;
  started: boolean;
  mayEcho: boolean;
  prevContent: string;
  prevReasoning: string;
  stepMode: 'undecided' | 'streaming' | 'held';
  spokeAny: boolean;
};

const TTS_STEP_SEPARATOR = '\n\n';

function decideTtsStepMode(
  content: string,
  mayEcho: boolean,
): TtsRunState['stepMode'] {
  const firstChar = content.trimStart()[0];
  if (!firstChar) {
    return 'undecided';
  }
  return mayEcho && (firstChar === '{' || firstChar === '`')
    ? 'held'
    : 'streaming';
}

function spokenChunk(
  tts: TtsRunState,
  text: string,
  isStepStart: boolean,
): string {
  const chunk = isStepStart && tts.spokeAny ? TTS_STEP_SEPARATOR + text : text;
  tts.spokeAny = true;
  return chunk;
}

// Echo-shaped steps are held until step_finished, where the tool calls
// that decide visibility land; every other step streams per token.
function forwardTokenToTts(
  messageId: string,
  delta: TokenDelta,
  tts: TtsRunState,
): void {
  const cumulativeContent = delta.content ?? tts.prevContent;
  const cumulativeReasoning = delta.reasoningContent ?? tts.prevReasoning;
  if (!tts.started && (delta.content || delta.reasoningContent)) {
    tts.started = true;
    ttsStore.onAssistantMessageStart(messageId);
  }
  if (tts.stepMode === 'undecided') {
    tts.stepMode = decideTtsStepMode(cumulativeContent, tts.mayEcho);
  }
  if (tts.stepMode === 'held') {
    tts.prevContent = cumulativeContent;
  }
  const contentDelta =
    tts.stepMode === 'streaming' &&
    cumulativeContent.length > tts.prevContent.length
      ? cumulativeContent.slice(tts.prevContent.length)
      : '';
  const reasoningDelta =
    cumulativeReasoning.length > tts.prevReasoning.length
      ? cumulativeReasoning.slice(tts.prevReasoning.length)
      : '';
  if (!contentDelta && !reasoningDelta) {
    return;
  }
  const contentChunk = contentDelta
    ? spokenChunk(tts, contentDelta, tts.prevContent === '')
    : '';
  if (tts.stepMode === 'streaming') {
    tts.prevContent = cumulativeContent;
  }
  tts.prevReasoning = cumulativeReasoning;
  ttsStore.onAssistantMessageChunk(
    messageId,
    contentChunk,
    reasoningDelta || undefined,
  );
}

function releaseHeldStepToTts(
  messageId: string,
  toolCalls: AgentToolCall[] | undefined,
  tts: TtsRunState,
): void {
  const visible = visibleStepContent({content: tts.prevContent, toolCalls});
  if (visible) {
    ttsStore.onAssistantMessageChunk(
      messageId,
      spokenChunk(tts, visible, true),
      undefined,
    );
  }
}

// Normalise a finished turn's result into the snapshot the banner reads.
// `contextFull` is frozen here as the OR of the native full/truncated flags
// and (remote only) a 'length' finish reason derived from `stopped_limit`.
function deriveSnapshotFromResult(
  result: CompletionResult,
  isRemote: boolean,
): CompletionResultSnapshot {
  // Without a prompt term the total is a predicted-only tally, which is not an
  // occupancy number on either path.
  const used =
    result.tokens_evaluated === undefined
      ? undefined
      : result.tokens_evaluated + (result.tokens_predicted ?? 0);
  // Local turns set context_full/truncated directly; finishReason only bridges
  // the remote engine's signal (stopped_limit) into the OR predicate below, so
  // it is intentionally remote-only.
  const finishReason =
    isRemote && result.stopped_limit === 1 ? 'length' : undefined;
  const contextFull =
    result.context_full === true ||
    result.truncated === true ||
    finishReason === 'length';
  return {
    content: result.content,
    reasoning_content: result.reasoning_content,
    used,
    contextFull,
    tokensPredicted: result.tokens_predicted,
    finishReason,
    isRemote,
  };
}

/**
 * Map a single AgentEvent into the corresponding store mutation(s).
 * Free of business logic — every event maps to a known action surface
 * on `chatSessionStore`. This is the only place inside the run
 * lifecycle that writes to the store. The reducer
 * (`agentStateReducer`) updates `agentUiState` separately.
 */
async function applyEventToStore(
  event: AgentEvent,
  ctx: {
    messageId: string;
    sessionId: string;
    completionStartTime: number;
    timeToFirstTokenMs: {value: number | null};
    hasImages: boolean;
    isMultimodalEnabled: boolean;
    tts: TtsRunState;
  },
): Promise<void> {
  switch (event.type) {
    case 'run_started':
      // Status flip happens in the reducer; the empty AssistantTurn
      // already exists (created in prepareCompletion). Nothing else to
      // persist here — the message was added before the run started.
      return;
    case 'step_started':
      if (ctx.tts.enabled) {
        ctx.tts.prevContent = '';
        ctx.tts.prevReasoning = '';
        ctx.tts.stepMode = 'undecided';
      }
      await chatSessionStore.pushAgentStep(ctx.messageId, ctx.sessionId, {
        partial: true,
      });
      return;
    case 'token': {
      const hasFirstTokenSignal = !!(
        event.delta.content || event.delta.reasoningContent
      );
      if (ctx.timeToFirstTokenMs.value === null && hasFirstTokenSignal) {
        ctx.timeToFirstTokenMs.value = Date.now() - ctx.completionStartTime;
      }
      if (!modelStore.isStreaming) {
        modelStore.setIsStreaming(true);
      }
      // Learn-from-stream: the first time a model emits reasoning while the
      // resolver does not already know it reasons, persist the learned flag so
      // the pill becomes reachable on the next render. The store writer is
      // idempotent and never downgrades a user/learned 'yes'.
      if (
        event.delta.reasoningContent &&
        event.delta.reasoningContent.length > 0
      ) {
        const activeModel = modelStore.activeModel;
        if (
          activeModel &&
          resolveReasoningCapability(activeModel, serverStore.remoteReasoning)
            .isReasoning !== 'yes'
        ) {
          modelStore.recordReasoningObserved(activeModel.id);
        }
      }
      // Wrapped so a TTS failure cannot kill the completion stream.
      if (ctx.tts.enabled) {
        try {
          forwardTokenToTts(ctx.messageId, event.delta, ctx.tts);
        } catch (ttsErr) {
          console.warn('[useChatSession] TTS stream hook failed:', ttsErr);
        }
      }
      // Per-token writes go through the throttled streaming path so
      // they coalesce. Only forward fields that were actually present in
      // this delta to avoid clobbering existing content with empty.
      // toolCalls are not written here — the reducer still consumes
      // `event.delta.toolCalls` for pendingTalentNames, but the
      // canonical step.toolCalls write happens after step_finished via
      // appendToolCall so ids match outcomes by construction.
      const partial: Partial<MessageType.AssistantTurn['steps'][number]> = {};
      if (event.delta.content) {
        partial.content = event.delta.content.replace(/^\s+/, '');
      }
      if (event.delta.reasoningContent) {
        partial.reasoningContent = event.delta.reasoningContent;
      }
      if (Object.keys(partial).length > 0) {
        chatSessionStore.updateActiveStepStreaming(
          ctx.messageId,
          ctx.sessionId,
          partial,
        );
      }
      return;
    }
    case 'marker_seen':
      // Reducer handles status flip; no per-step persistence needed.
      return;
    case 'tool_call_started':
      // Reducer handles status flip; the call payload is already on
      // the active step from the preceding `token` event with toolCalls.
      return;
    case 'tool_call_finished':
      await chatSessionStore.appendToolOutcome(
        ctx.messageId,
        ctx.sessionId,
        event.outcome,
      );
      return;
    case 'step_finished':
      if (ctx.tts.enabled && ctx.tts.stepMode === 'held') {
        try {
          releaseHeldStepToTts(ctx.messageId, event.toolCalls, ctx.tts);
        } catch (ttsErr) {
          console.warn('[useChatSession] TTS stream hook failed:', ttsErr);
        }
      }
      // Land step.toolCalls AFTER step_finished with the runner's
      // authoritative normalized ids so they match outcomes' callIds by
      // construction. Skipped for text-only and final-of-chain steps
      // (no payload attached).
      if (event.toolCalls && event.toolCalls.length > 0) {
        await chatSessionStore.appendToolCall(
          ctx.messageId,
          ctx.sessionId,
          event.toolCalls,
        );
      }
      await chatSessionStore.finalizeActiveStep(ctx.messageId, ctx.sessionId);
      return;
    case 'run_finished': {
      // Final timings + observability for hit-max-turns. Kept here
      // (not in the runner) because timings are an observability
      // concern of the hook, not the runner.
      const finalResult = event.result.finalResult;
      const snapshot = deriveSnapshotFromResult(
        finalResult,
        modelStore.activeModel?.origin === ModelOrigin.REMOTE,
      );
      const draftTimings =
        finalResult.draft_tokens != null && finalResult.draft_tokens > 0
          ? {
              draft_tokens: finalResult.draft_tokens,
              draft_tokens_accepted: finalResult.draft_tokens_accepted,
            }
          : {};
      const timings: PersistedTurnTimings = {
        ...(finalResult.timings ?? {}),
        time_to_first_token_ms: ctx.timeToFirstTokenMs.value,
        ...draftTimings,
      };
      await chatSessionStore.updateMessage(ctx.messageId, ctx.sessionId, {
        metadata: {
          timings,
          copyable: true,
          multimodal: ctx.hasImages && ctx.isMultimodalEnabled,
          completionResult: snapshot,
          ...(event.result.hitMaxTurns ? {hitMaxTurns: true} : {}),
        },
      });
      chatSessionStore.recordCompletionSnapshot(snapshot);
      if (snapshot.isRemote) {
        modelStore.reprobeRemoteCapsAfterCompletion();
      }
      if (event.result.hitMaxTurns) {
        console.warn(
          '[useChatSession] agent run hit maxTurns; surfacing last available content',
        );
      }
      // Fire TTS auto-speak after the final text is observable. Store
      // enforces auto-speak / voice / idempotency gating internally.
      // Wrapped defensively — UI-path errors must not bubble.
      try {
        ttsStore.onAssistantMessageComplete(
          ctx.messageId,
          finalResult.text ?? '',
          {hadReasoning: !!finalResult.reasoning_content?.trim()},
        );
      } catch (ttsErr) {
        console.warn('[useChatSession] TTS complete hook failed:', ttsErr);
      }
      return;
    }
    case 'run_failed':
      // Failure handled by the surrounding try/catch in the hook.
      return;
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/**
 * Lets queued touches dispatch. Ends at once when `signal` aborts: JS timers
 * do not fire while the app is backgrounded, and a release there waits for
 * this run to drain.
 */
function yieldToTouches(signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, 0);
    signal.addEventListener('abort', done);
  });
}

export type UndoneSend = {
  message: MessageType.PartialText;
  sessionId: string;
  /** Set when the documents no longer fit at send time; nothing was written. */
  verdict?: Extract<BudgetVerdict, {kind: 'over'}>;
};

export type EvaluateSendBudget = (
  message: MessageType.PartialText,
  options?: {excludeFromId?: string},
) => Promise<Plan>;

const NO_DOCUMENTS_PLAN: Plan = {
  newModes: [],
  fullLoad: 0,
  room: undefined,
  excerptBudget: 0,
  verdict: {kind: 'fits'},
};

const plainText = (message: {content?: unknown; tool_calls?: unknown}) => {
  const {content} = message;
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .filter(part => part?.type === 'text' && part.text)
            .map(part => part.text)
            .join('\n')
        : '';
  return message.tool_calls
    ? `${text}${JSON.stringify(message.tool_calls)}`
    : text;
};

/** Everything `documentPlan` needs besides the rows, resolved the way a send resolves it. */
const planInputs = async (
  rows: MessageType.Any[],
  message: MessageType.PartialText,
): Promise<PlanInput> => {
  const palId = chatSessionStore.activePalId;
  const pal = palId ? palStore.pals.find(p => p.id === palId) : null;
  const settings = await chatSessionStore.getCurrentCompletionSettings();
  const tools = (settings?.tools as ToolDefinition[] | undefined) ?? [];
  const refs = [
    ...rows.flatMap(row => (row.type === 'text' ? (row.documents ?? []) : [])),
    ...(message.documents ?? []),
  ];
  const promptMessages = buildPromptMessages({
    rows,
    systemMessages: resolveSystemMessages({pal, model: modelStore.activeModel}),
    settings: settings as CompletionParams,
    isMultimodalEnabled: modelStore.activeModelCaps.visionActive,
    refs,
    tail: {role: 'user', content: message.text},
  });
  return {
    rows,
    message,
    windowTokens: modelStore.activeModelCaps.effectiveContextLength,
    activeModelId: modelStore.activeModelId,
    nonDocText: [
      ...promptMessages.map(plainText),
      tools.length > 0 ? JSON.stringify(tools) : '',
    ].join('\n'),
    missingKeys: await findMissingDocuments(refs),
  };
};

export const useChatSession = (
  currentMessageInfo: React.MutableRefObject<{
    createdAt: number;
    id: string;
    sessionId: string;
  } | null>,
  user: User,
  assistant: User,
) => {
  const l10n = React.useContext(L10nContext);
  const conversationIdRef = useRef<string>(randId());
  // Trigger-marker cache lifetime is scoped to the hook (useRef). No
  // module-level mutable state — see triggerMarkers.ts contract.
  // Resolved before each runAgent call; the resulting string[] is
  // passed into AgentRunOptions.triggerMarkers so the runner has no
  // direct dependency on the cache, modelStore, or getFormattedChat.
  const triggerCacheRef = useRef(createTriggerMarkerCache());
  const leaseRef = useRef<GenerationLease | null>(null);

  const addMessage = async (message: MessageType.Any) => {
    await chatSessionStore.addMessageToCurrentSession(message);
  };

  const systemRow = (text: string, metadata = {}): MessageType.Text => ({
    author: assistant,
    createdAt: Date.now(),
    id: randId(),
    text,
    type: 'text',
    metadata: {system: true, ...metadata},
  });

  const addSystemMessage = async (text: string, metadata = {}) => {
    await addMessage(systemRow(text, metadata));
  };

  /**
   * Returns a send cancelled by a chat switch: its text to the chat it was
   * typed in, its attachments to the composer, which stays with the user.
   */
  const unsent = (
    message: MessageType.PartialText,
    sentFrom: string | null,
  ): UndoneSend | undefined => {
    chatSessionStore.restoreUnsentText(sentFrom, message.text);
    if (!message.imageUris?.length && !message.documents?.length) {
      return undefined;
    }
    return {
      message: {...message, text: ''},
      sessionId: chatSessionStore.activeSessionId ?? '',
    };
  };

  const handleSendPress = async (
    message: MessageType.PartialText,
  ): Promise<UndoneSend | undefined> => {
    const sentFrom = chatSessionStore.activeSessionId;
    if (modelStore.isGenerationBusy) {
      chatSessionStore.setIsStopping(true);
    }
    const lease = await modelStore.acquireGeneration();
    chatSessionStore.setIsStopping(false);
    if (chatSessionStore.activeSessionId !== sentFrom) {
      lease?.end();
      return unsent(message, sentFrom);
    }
    if (!lease) {
      await addSystemMessage(l10n.chat.modelNotLoaded);
      return;
    }
    leaseRef.current = lease;

    // Run UI clears on abort, not on drain.
    let uiStopped = false;
    const uiStop = () => {
      if (uiStopped) {
        return;
      }
      uiStopped = true;
      modelStore.setInferencing(false);
      modelStore.setIsStreaming(false);
      chatSessionStore.setIsGenerating(false);
      chatSessionStore.setAgentUiState(initialAgentUiState);
      chatSessionStore.setToolCallTokenCount(0);
      try {
        deactivateKeepAwake();
      } catch (error) {
        console.error('Failed to deactivate keep awake after chat:', error);
      }
    };
    if (lease.signal.aborted) {
      uiStop();
    } else {
      lease.signal.addEventListener('abort', uiStop);
    }

    try {
      return await sendUnderLease(message, sentFrom, lease, {
        stop: uiStop,
        isStopped: () => uiStopped,
      });
    } finally {
      lease.signal.removeEventListener('abort', uiStop);
      uiStop();
      if (leaseRef.current === lease) {
        leaseRef.current = null;
      }
      lease.end();
    }
  };

  const sendUnderLease = async (
    message: MessageType.PartialText,
    sentFrom: string | null,
    lease: GenerationLease,
    runUi: {stop: () => void; isStopped: () => boolean},
  ): Promise<UndoneSend | undefined> => {
    const engine = lease.engine;
    const contextId = modelStore.contextId;
    if (!contextId) {
      await addSystemMessage(l10n.chat.modelNotLoaded);
      return;
    }

    const imageUris = message.imageUris;
    const hasImages = !!(imageUris && imageUris.length > 0);

    const isMultimodalEnabled = modelStore.activeModelCaps.visionActive;

    const currentMessages = toJS(chatSessionStore.currentSessionMessages);

    const plan = hasDocuments(currentMessages, message)
      ? documentPlan(await planInputs(currentMessages, message))
      : undefined;
    if (chatSessionStore.activeSessionId !== sentFrom) {
      return unsent(message, sentFrom);
    }
    if (plan?.verdict.kind === 'over') {
      return {
        message,
        sessionId: chatSessionStore.activeSessionId ?? '',
        verdict: plan.verdict,
      };
    }
    const documents = message.documents?.map((ref, i) => ({
      ...ref,
      mode: plan?.newModes[i],
    }));

    const textMessage: MessageType.Text = {
      author: user,
      createdAt: Date.now(),
      id: '',
      text: message.text,
      type: 'text',
      imageUris: hasImages ? imageUris : undefined,
      documents: documents?.length ? documents : undefined,
      metadata: {
        contextId,
        conversationId: conversationIdRef.current,
        copyable: true,
        multimodal: hasImages,
      },
    };
    const wasUntitled =
      (chatSessionStore.sessions.find(
        s => s.id === chatSessionStore.activeSessionId,
      )?.title ?? NEW_SESSION_TITLE) === NEW_SESSION_TITLE;
    await addMessage(textMessage);
    releaseSendHold((message.documents ?? []).map(ref => ref.id));
    if (!lease.signal.aborted) {
      modelStore.setInferencing(true);
      modelStore.setIsStreaming(false);
      chatSessionStore.setIsGenerating(true);
      try {
        activateKeepAwake();
      } catch (error) {
        console.error('Failed to activate keep awake during chat:', error);
      }
    }

    const activeSession = chatSessionStore.sessions.find(
      s => s.id === chatSessionStore.activeSessionId,
    );
    const pal = activeSession?.activePalId
      ? palStore.pals.find(p => p.id === activeSession.activePalId)
      : null;

    const systemMessages = resolveSystemMessages({
      pal,
      model: modelStore.activeModel,
    });

    const {cleanCompletionParams, messageInfo} = await prepareCompletion({
      imageUris: imageUris || [],
      message: {...message, documents},
      systemMessages,
      contextId,
      assistant,
      conversationIdRef: conversationIdRef.current,
      isMultimodalEnabled,
      l10n,
      currentMessages,
      plan,
    });

    currentMessageInfo.current = messageInfo;

    // Allowed talent names for this Pal. The runner rejects any
    // tool call whose function.name isn't in this list.
    const palTalents = (pal?.pact?.talents ?? []).map(t => t.name);

    const completionStartTime = Date.now();
    const timeToFirstTokenMs: {value: number | null} = {value: null};
    let uiState: AgentUiState = initialAgentUiState;

    // Precompute trigger markers via the per-hook cache. We use the
    // CLOSURE form of `getFormattedChat` (NOT `.bind(...)`) because the
    // method is multi-arg and requires `params: {tools, jinja: true}`
    // to populate `grammar_triggers`. A bare bind would call the
    // method with no arguments and silently return empty markers,
    // defeating marker detection. Failure is non-fatal: we fall back
    // to `[]` and let `tool_call_started` drive the UX flip (one beat
    // later) instead of `marker_seen`.
    const tools =
      (cleanCompletionParams.tools as ToolDefinition[] | undefined) ?? [];
    const tts: TtsRunState = {
      enabled: ttsStore.autoSpeakEnabled,
      started: false,
      mayEcho: tools.length > 0,
      prevContent: '',
      prevReasoning: '',
      stepMode: 'undecided',
      spokeAny: false,
    };
    let triggerMarkers: string[] = [];
    // Marker detection reads `grammar_triggers` from a local Jinja
    // `getFormattedChat` call — only meaningful when a local llama.rn
    // context exists. In server mode (`modelStore.context` undefined)
    // the remote llama.cpp parser handles tool-call detection on its
    // own, so this whole step is skipped. Without the guard the
    // non-null assertion below throws TypeError on every server-mode
    // turn (caught + warned, but noisy).
    const localContext = modelStore.context;
    if (localContext) {
      try {
        triggerMarkers = await triggerCacheRef.current.getMarkers(
          String(localContext.id),
          tools,
          () =>
            localContext.getFormattedChat(
              cleanCompletionParams.messages ?? [],
              undefined,
              {tools: cleanCompletionParams.tools, jinja: true},
            ) as Promise<JinjaFormattedChatResult>,
        );
      } catch (e) {
        console.warn('[chat] trigger marker compute failed; falling back', e);
      }
    }

    let undone: UndoneSend | undefined;
    try {
      const events = runAgent({
        engine,
        initialParams: cleanCompletionParams as ApiCompletionParams,
        allowedTalentNames: palTalents,
        talentLookup: name => talentRegistry.get(name),
        triggerMarkers,
        messageId: messageInfo.id,
        signal: lease.signal,
      });

      // The chunk-cycle would otherwise run entirely via microtask
      // resumption from queue.next(), starving the macrotask queue
      // where touch events ride — Stop taps could sit for tens of
      // seconds during long streams. A setTimeout(_, 0) yield every
      // YIELD_INTERVAL_MS lets touches dispatch. The yield also
      // decouples native production from consumption, so a backlog
      // can grow on fast models; the abort guard below drops queued
      // token events on stop while lifecycle events still run.
      let lastYieldTs = performance.now();
      const YIELD_INTERVAL_MS = 100;

      // Bucket the tool-token counter: PendingIndicator hides counts
      // below 10, so publish every increment up to 10, then only on
      // bucket boundaries. Drops the indicator's re-render rate by
      // ~10× without visible loss.
      let toolCallTokensRaw = 0;
      const TOOL_TOKEN_BUCKET = 10;

      for await (const event of events) {
        if (lease.signal.aborted && event.type === 'token') {
          continue;
        }

        // Reference guard before MobX write: deep observables wrap
        // values in a proxy, so equality inside the setter can't see
        // "same object". The reducer returns the input ref when nothing
        // changed; without this guard every event still publishes.
        const nextUiState = agentStateReducer(uiState, event);
        if (nextUiState !== uiState) {
          uiState = nextUiState;
          if (!runUi.isStopped()) {
            chatSessionStore.setAgentUiState(nextUiState);
          }
        }

        switch (event.type) {
          case 'run_started':
          case 'step_started':
          case 'tool_call_started':
          case 'run_finished':
          case 'run_failed':
            toolCallTokensRaw = 0;
            if (!runUi.isStopped()) {
              chatSessionStore.setToolCallTokenCount(0);
            }
            break;
          case 'token':
            if (event.delta.toolCalls && event.delta.toolCalls.length > 0) {
              toolCallTokensRaw += 1;
              if (
                toolCallTokensRaw < TOOL_TOKEN_BUCKET ||
                toolCallTokensRaw % TOOL_TOKEN_BUCKET === 0
              ) {
                chatSessionStore.setToolCallTokenCount(toolCallTokensRaw);
              }
            }
            break;
          default:
            break;
        }

        await applyEventToStore(event, {
          messageId: messageInfo.id,
          sessionId: messageInfo.sessionId,
          completionStartTime,
          timeToFirstTokenMs,
          hasImages,
          isMultimodalEnabled,
          tts,
        });

        if (performance.now() - lastYieldTs >= YIELD_INTERVAL_MS) {
          await yieldToTouches(lease.signal);
          lastYieldTs = performance.now();
        }

        if (event.type === 'run_failed') {
          throw event.error;
        }
      }
    } catch (error) {
      console.error('Completion error:', error);
      // Send stays blocked until an undone turn's rows are gone.
      if (!(error instanceof RemoteModelRequestWithdrawnError)) {
        runUi.stop();
      }

      // Stop any in-flight TTS — the completion errored, so buffered
      // audio should not keep playing.
      ttsStore.stop().catch(ttsErr => {
        console.warn('[useChatSession] TTS stop on error failed:', ttsErr);
      });

      const errorMessage = (error as Error).message;
      // Native tool-call parser throws on truncated JSON when the model
      // ran out of context mid-args (most often `render_html` with a
      // long string). Detect by error shape and route through the
      // turn's metadata so the footer can show a friendlier hint
      // instead of a multi-KB raw error dump.
      const isToolArgsParseError =
        /Failed to parse tool call arguments as JSON/i.test(errorMessage);
      // Prompt-processing overflow: when the prompt itself exceeds n_ctx
      // (ctx_shift is off — the llama.rn default), the native layer throws
      // "Context is full" before any token is generated, so it never reaches
      // run_finished. Treat it as an n_ctx-exhaustion signal so the banner
      // surfaces instead of a raw error dump.
      // LLAMARN-DEP: string-coupled to the native throw in RNLlamaJSI.cpp.
      // No typed flag exists yet; a llama.rn reword would silently stop the
      // prompt-overflow banner. Re-verify on upgrade; prefer a typed
      // CompletionResult flag upstream when available.
      const isContextFullError = /context is full/i.test(errorMessage);
      const treatAsContextFull = isToolArgsParseError || isContextFullError;
      // Low-RAM devices can fail to allocate the speculative draft context at
      // first completion (the load-time memory check has no term for it).
      // LLAMARN-DEP: string-coupled to the throw in rn-completion.cpp; a
      // reword would silently demote this back to the raw dump.
      const isSpeculativeInitError = /failed to create MTP draft context/i.test(
        errorMessage,
      );

      // Error rollback path. The empty/in-flight AssistantTurn row
      // already exists; preserve any partial steps and tag with
      // {interrupted, copyable} (plus {truncationLikely} on the
      // tool-call parse case). The store widening from step 2 ensures
      // this metadata write does not silently no-op on assistant_turn
      // rows and does not clobber metadata.steps.
      let turnAbsorbedError = false;
      const session = chatSessionStore.sessions.find(
        s => s.id === messageInfo.sessionId,
      );
      const currentMsg = session?.messages.find(
        msg => msg.id === messageInfo.id,
      );

      const hasAnyStepContent =
        currentMsg?.type === 'assistant_turn' &&
        ((currentMsg as MessageType.AssistantTurn).steps ?? []).some(
          s => (s.content?.length ?? 0) > 0 || (s.toolCalls?.length ?? 0) > 0,
        );
      const hasLegacyText =
        currentMsg?.type === 'text' && !!(currentMsg as MessageType.Text).text;
      const hasPartialContent = hasAnyStepContent || hasLegacyText;

      if (hasPartialContent) {
        // No finalResult on the abort path, so no turn reported a count.
        // truncationLikely is the n_ctx-exhaustion signal: when set, treat
        // the turn as full and pin `used` to the context window so the
        // sticky banner's freshness gate holds. Otherwise the count is
        // unknown, which is not zero.
        const isRemote = modelStore.activeModel?.origin === ModelOrigin.REMOTE;
        const effectiveNCtx = modelStore.activeModelCaps.effectiveContextLength;
        const abortSnapshot: CompletionResultSnapshot = {
          used: treatAsContextFull ? effectiveNCtx : undefined,
          contextFull: treatAsContextFull,
          isRemote,
        };
        await chatSessionStore.updateMessage(
          messageInfo.id,
          messageInfo.sessionId,
          {
            metadata: {
              interrupted: true,
              copyable: true,
              completionResult: abortSnapshot,
              ...(isToolArgsParseError ? {truncationLikely: true} : {}),
            },
          },
        );
        chatSessionStore.recordCompletionSnapshot(abortSnapshot);
        // The turn now carries the failure context; suppress the
        // duplicate `Completion failed: …` system message dump.
        turnAbsorbedError = true;
      } else {
        // A prompt that overflows n_ctx throws before any token, so there
        // is no content to keep — but still record the snapshot so the
        // banner surfaces the full state. The empty turn is cleaned up
        // below; the store snapshot drives the banner independently.
        // Per-process for this draft: with no message persisted, the banner
        // does not rehydrate after a session switch / restart (it re-fires
        // on the next overflowing send).
        if (isContextFullError) {
          const isRemote =
            modelStore.activeModel?.origin === ModelOrigin.REMOTE;
          const effectiveNCtx =
            modelStore.activeModelCaps.effectiveContextLength;
          chatSessionStore.recordCompletionSnapshot({
            used: effectiveNCtx,
            contextFull: true,
            isRemote,
          });
          turnAbsorbedError = true;
        }
        await chatSessionStore.deleteMessageFromSession(
          messageInfo.sessionId,
          messageInfo.id,
        );
      }

      if (turnAbsorbedError) {
        // Footer already surfaces interrupted / truncationLikely; nothing
        // more to add to chat.
      } else if (error instanceof RemoteModelRequestWithdrawnError) {
        if (!hasPartialContent) {
          await chatSessionStore.deleteMessageFromSession(
            messageInfo.sessionId,
            textMessage.id,
          );
          if (wasUntitled) {
            await chatSessionStore.updateSessionTitleBySessionId(
              messageInfo.sessionId,
              NEW_SESSION_TITLE,
            );
          }
          undone = {message, sessionId: messageInfo.sessionId};
        }
      } else if (error instanceof RemoteModelNotReadyError) {
        const text = routerFailureMessage(
          error.cause,
          error.serverMessage,
          l10n,
        );
        await chatSessionStore.addMessageToSession(
          messageInfo.sessionId,
          systemRow(text),
        );
        AccessibilityInfo.announceForAccessibility(text);
      } else if (errorMessage.includes('network')) {
        await addSystemMessage(l10n.common.networkError);
      } else if (isToolArgsParseError) {
        // No turn content to attach the hint to — fall back to a
        // friendly system message instead of the raw native error dump.
        await addSystemMessage(l10n.chat.toolCallTruncated);
      } else if (isSpeculativeInitError) {
        await addSystemMessage(l10n.chat.speculativeInitFailed);
      } else if (isContextFullError) {
        // No turn to attach to; surface the banner via a store snapshot
        // rather than dumping the raw "Context is full" native error.
        chatSessionStore.recordCompletionSnapshot({
          used: modelStore.activeModelCaps.effectiveContextLength,
          contextFull: true,
          isRemote: modelStore.activeModel?.origin === ModelOrigin.REMOTE,
        });
      } else {
        await addSystemMessage(`${l10n.chat.completionFailed}${errorMessage}`);
      }
    }
    return undone;
  };

  const evaluateSendBudget: EvaluateSendBudget = async (
    message,
    {excludeFromId} = {},
  ) => {
    const rows = rowsBefore(
      toJS(chatSessionStore.currentSessionMessages),
      excludeFromId,
    );
    if (!hasDocuments(rows, message)) {
      return NO_DOCUMENTS_PLAN;
    }
    return documentPlan(await planInputs(rows, message));
  };

  const handleResetConversation = async () => {
    conversationIdRef.current = randId();
    await addSystemMessage(l10n.chat.conversationReset);
  };

  const handleStopPress = async () => {
    leaseRef.current?.abort();
    // Stop any in-flight TTS so buffered audio doesn't keep playing
    // after the user tapped Stop.
    ttsStore.stop().catch(err => {
      console.warn('[useChatSession] TTS stop on user-stop failed:', err);
    });
  };

  return {
    handleSendPress,
    evaluateSendBudget,
    handleResetConversation,
    handleStopPress,
  };
};
