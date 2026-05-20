import React, {useRef} from 'react';

import {toJS, runInAction} from 'mobx';
import type {JinjaFormattedChatResult} from 'llama.rn';

import {chatSessionRepository} from '../repositories/ChatSessionRepository';

import {randId} from '../utils';
import {L10nContext} from '../utils';
import {
  chatSessionStore,
  modelStore,
  palStore,
  ttsStore,
  uiStore,
} from '../store';

import {MessageType, User} from '../utils/types';
import {createMultimodalWarning} from '../utils/errors';
import {resolveSystemMessages} from '../utils/systemPromptResolver';
import {convertToChatMessages, removeThinkingParts} from '../utils/chat';
import {activateKeepAwake, deactivateKeepAwake} from '../utils/keepAwake';
import {
  toApiCompletionParams,
  ApiCompletionParams,
  CompletionParams,
} from '../utils/completionTypes';
import {talentRegistry} from '../services/talents';
import type {ToolDefinition} from '../services/talents/types';
import {
  agentStateReducer,
  createTriggerMarkerCache,
  initialAgentUiState,
  runAgent,
  type AgentEvent,
  type AgentUiState,
} from '../services/agent';

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
}) => {
  const sessionCompletionSettings =
    await chatSessionStore.getCurrentCompletionSettings();
  const stopWords = toJS(modelStore.activeModel?.stopWords);

  // Check if we have images and if multimodal is enabled
  const hasImages = imageUris && imageUris.length > 0;

  // Create user message content - use array format only for multimodal,
  // string for text-only.
  let userMessageContent: any;

  if (hasImages && isMultimodalEnabled) {
    userMessageContent = [
      {
        type: 'text',
        text: message.text,
      },
      ...imageUris.map(path => ({
        type: 'image_url',
        image_url: {url: path},
      })),
    ];
  } else {
    userMessageContent = message.text;

    if (hasImages && !isMultimodalEnabled) {
      uiStore.setChatWarning(
        createMultimodalWarning(l10n.chat.multimodalNotEnabled),
      );
    }
  }

  // Convert chat session messages to llama.rn format. Filtering
  // image-typed messages happens here (multimodal user messages carry
  // their images via imageUris on the Text row, not a separate Image
  // message). AssistantTurn rows pass through to convertToChatMessages,
  // which expands each step into assistant + tool API messages.
  let chatMessages = convertToChatMessages(
    currentMessages.filter(msg => msg.type !== 'image'),
    isMultimodalEnabled,
  );

  // Strip thinking parts from assistant context if the user opted out.
  const includeThinkingInContext =
    (sessionCompletionSettings as CompletionParams)
      ?.include_thinking_in_context !== false;
  if (!includeThinkingInContext) {
    chatMessages = chatMessages.map(msg => {
      if (msg.role === 'assistant' && typeof msg.content === 'string') {
        return {
          ...msg,
          content: removeThinkingParts(msg.content),
        };
      }
      return msg;
    });
  }

  const messages = [
    ...systemMessages,
    ...chatMessages,
    {
      role: 'user',
      content: userMessageContent,
    },
  ];

  const completionParamsWithAppProps = {
    ...sessionCompletionSettings,
    messages,
    stop: stopWords,
  };

  const cleanCompletionParams = toApiCompletionParams(
    completionParamsWithAppProps as CompletionParams,
  );

  if (cleanCompletionParams.enable_thinking) {
    cleanCompletionParams.reasoning_format = 'auto';
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

// Per-run TTS streaming state. The runner emits CUMULATIVE content/
// reasoning on each `token` event (mirroring llama.rn's callback
// semantics); the TTS streaming hooks expect per-call deltas, so we
// diff cumulative against `prev*` and forward only the new substring.
// Carried in ctx so a single run keeps a coherent audio stream.
type TtsRunState = {
  // Snapshot of `ttsStore.autoSpeakEnabled` at the start of the run.
  // When false, the per-token TTS hook in `applyEventToStore` is
  // skipped entirely — saving the cumulative-length compute and the
  // String.slice deltas that would otherwise run on every chunk only
  // to feed a no-op `onAssistantMessageChunk`. Captured per-run
  // (rather than read live on every chunk) so a mid-stream settings
  // toggle does not flicker the audio path; the next user message
  // will pick up the new value.
  enabled: boolean;
  started: boolean;
  prevContent: string;
  prevReasoning: string;
};

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
      await chatSessionStore.pushAgentStep(ctx.messageId, ctx.sessionId, {
        partial: true,
      });
      return;
    case 'token': {
      // Capture time-to-first-token on the first content/reasoning token.
      if (
        ctx.timeToFirstTokenMs.value === null &&
        (event.delta.content || event.delta.reasoningContent)
      ) {
        ctx.timeToFirstTokenMs.value = Date.now() - ctx.completionStartTime;
      }
      if (!modelStore.isStreaming) {
        modelStore.setIsStreaming(true);
      }
      // TTS streaming hooks. Open a StreamingHandle on the first token
      // that carries content OR reasoning, then forward each new
      // substring via onAssistantMessageChunk. Wrapped defensively so a
      // UI-path failure cannot kill the completion stream. Skipped
      // entirely when auto-speak is off for this run — the inner
      // ttsStore calls would early-return anyway, but the cumulative-
      // length compute and String.slice deltas are a real per-token
      // cost on low-end devices.
      if (ctx.tts.enabled) {
        try {
          const cumulativeContent = event.delta.content ?? ctx.tts.prevContent;
          const cumulativeReasoning =
            event.delta.reasoningContent ?? ctx.tts.prevReasoning;
          if (
            !ctx.tts.started &&
            (event.delta.content || event.delta.reasoningContent)
          ) {
            ctx.tts.started = true;
            ttsStore.onAssistantMessageStart(ctx.messageId);
          }
          const contentDelta =
            cumulativeContent.length > ctx.tts.prevContent.length
              ? cumulativeContent.slice(ctx.tts.prevContent.length)
              : '';
          const reasoningDelta =
            cumulativeReasoning.length > ctx.tts.prevReasoning.length
              ? cumulativeReasoning.slice(ctx.tts.prevReasoning.length)
              : '';
          if (contentDelta || reasoningDelta) {
            ctx.tts.prevContent = cumulativeContent;
            ctx.tts.prevReasoning = cumulativeReasoning;
            ttsStore.onAssistantMessageChunk(
              ctx.messageId,
              contentDelta,
              reasoningDelta || undefined,
            );
          }
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
      await chatSessionStore.updateMessage(ctx.messageId, ctx.sessionId, {
        metadata: {
          timings: {
            ...(finalResult.timings ?? {}),
            time_to_first_token_ms: ctx.timeToFirstTokenMs.value,
          },
          copyable: true,
          multimodal: ctx.hasImages && ctx.isMultimodalEnabled,
          ...(event.result.hitMaxTurns ? {hitMaxTurns: true} : {}),
        },
      });
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
  // AbortController for the active run. Replaced per run; signal is
  // forwarded to runAgent for stop-mid-tool semantics.
  const abortRef = useRef<AbortController | null>(null);

  const addMessage = async (message: MessageType.Any) => {
    await chatSessionStore.addMessageToCurrentSession(message);
  };

  const addSystemMessage = async (text: string, metadata = {}) => {
    const textMessage: MessageType.Text = {
      author: assistant,
      createdAt: Date.now(),
      id: randId(),
      text,
      type: 'text',
      metadata: {system: true, ...metadata},
    };
    await addMessage(textMessage);
  };

  const handleSendPress = async (message: MessageType.PartialText) => {
    const engine = modelStore.engine;
    if (!engine) {
      await addSystemMessage(l10n.chat.modelNotLoaded);
      return;
    }

    const contextId = modelStore.contextId;
    if (!contextId) {
      await addSystemMessage(l10n.chat.modelNotLoaded);
      return;
    }

    const imageUris = message.imageUris;
    const hasImages = !!(imageUris && imageUris.length > 0);

    const isMultimodalEnabled = await modelStore.isMultimodalEnabled();

    const currentMessages = toJS(chatSessionStore.currentSessionMessages);

    const textMessage: MessageType.Text = {
      author: user,
      createdAt: Date.now(),
      id: '',
      text: message.text,
      type: 'text',
      imageUris: hasImages ? imageUris : undefined,
      metadata: {
        contextId,
        conversationId: conversationIdRef.current,
        copyable: true,
        multimodal: hasImages,
      },
    };
    await addMessage(textMessage);
    modelStore.setInferencing(true);
    modelStore.setIsStreaming(false);
    chatSessionStore.setIsGenerating(true);

    try {
      activateKeepAwake();
    } catch (error) {
      console.error('Failed to activate keep awake during chat:', error);
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
      message,
      systemMessages,
      contextId,
      assistant,
      conversationIdRef: conversationIdRef.current,
      isMultimodalEnabled,
      l10n,
      currentMessages,
    });

    currentMessageInfo.current = messageInfo;

    // Allowed talent names for this Pal. The runner rejects any
    // tool call whose function.name isn't in this list.
    const palTalents = (pal?.pact?.talents ?? []).map(t => t.name);

    abortRef.current = new AbortController();
    const completionStartTime = Date.now();
    const timeToFirstTokenMs: {value: number | null} = {value: null};
    const tts: TtsRunState = {
      enabled: ttsStore.autoSpeakEnabled,
      started: false,
      prevContent: '',
      prevReasoning: '',
    };
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

    try {
      const events = runAgent({
        engine,
        initialParams: cleanCompletionParams as ApiCompletionParams,
        allowedTalentNames: palTalents,
        talentLookup: name => talentRegistry.get(name),
        triggerMarkers,
        messageId: messageInfo.id,
        signal: abortRef.current.signal,
      });

      // Cooperative yield + consumer-side abort guard.
      //
      // Without the yield, the chunk-cycle (native callback →
      // queue.push → microtask resume → consumer body → await
      // queue.next() suspend → next chunk callback) runs entirely
      // via microtask resumption from a Promise-resolved queue.next().
      // The macrotask queue — where touch events, the Stop button
      // onPress, and other low-priority callbacks are dispatched —
      // never gets a slot. Measured starvation: tens of seconds
      // during long streams on the OnePlus 6.
      //
      // Adding a setTimeout(_, 0) yield every YIELD_INTERVAL_MS of
      // body work fixes the macrotask starvation, but has a side
      // effect: it decouples native production from JS consumption.
      // Without the consumer body blocking the JSI chunk callback,
      // native runs at full speed. On a fast local model (SmolLM at
      // ~36 chunks/s) the consumer can fall behind and a multi-hundred-
      // event backlog accumulates. After the user taps Stop, the
      // runner's chunk-handler abort guard stops accepting new chunks
      // (so chunksAfterAbort stays near 0), but the queued backlog
      // still drains here — the chat would keep updating with stale
      // tokens for tens of seconds. The consumer-side guard below
      // drops queued token events once the abort signal fires; the
      // lifecycle events (step_finished, run_finished) still run so
      // the state machine winds down cleanly.
      let lastYieldTs = performance.now();
      const YIELD_INTERVAL_MS = 100;

      for await (const event of events) {
        if (abortRef.current?.signal.aborted && event.type === 'token') {
          continue;
        }

        // Drive the reducer first so renderers see the new status as
        // soon as the per-step persistence write lands.
        uiState = agentStateReducer(uiState, event);
        chatSessionStore.setAgentUiState(uiState);

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
          await new Promise(resolve => setTimeout(resolve, 0));
          lastYieldTs = performance.now();
        }

        if (event.type === 'run_failed') {
          throw event.error;
        }
      }

      modelStore.setInferencing(false);
      modelStore.setIsStreaming(false);
      chatSessionStore.setIsGenerating(false);
      chatSessionStore.setIsStopping(false);
    } catch (error) {
      console.error('Completion error:', error);
      modelStore.setInferencing(false);
      modelStore.setIsStreaming(false);
      chatSessionStore.setIsGenerating(false);
      chatSessionStore.setIsStopping(false);
      // Reset agentUiState back to idle so renderers don't get
      // stuck in a failed state across the next user message.
      chatSessionStore.setAgentUiState(initialAgentUiState);

      // Stop any in-flight TTS — the completion errored, so buffered
      // audio should not keep playing.
      ttsStore.stop().catch(ttsErr => {
        console.warn('[useChatSession] TTS stop on error failed:', ttsErr);
      });

      // Error rollback path. The empty/in-flight AssistantTurn row
      // already exists; preserve any partial steps and tag with
      // {interrupted, copyable}. The store widening from step 2
      // ensures this metadata write does not silently no-op on
      // assistant_turn rows and does not clobber metadata.steps.
      if (currentMessageInfo.current) {
        const session = chatSessionStore.sessions.find(
          s => s.id === currentMessageInfo.current!.sessionId,
        );
        const currentMsg = session?.messages.find(
          msg => msg.id === currentMessageInfo.current!.id,
        );

        const hasAnyStepContent =
          currentMsg?.type === 'assistant_turn' &&
          ((currentMsg as MessageType.AssistantTurn).steps ?? []).some(
            s => (s.content?.length ?? 0) > 0 || (s.toolCalls?.length ?? 0) > 0,
          );
        const hasLegacyText =
          currentMsg?.type === 'text' &&
          !!(currentMsg as MessageType.Text).text;
        const hasPartialContent = hasAnyStepContent || hasLegacyText;

        if (hasPartialContent) {
          await chatSessionStore.updateMessage(
            currentMessageInfo.current.id,
            currentMessageInfo.current.sessionId,
            {
              metadata: {
                interrupted: true,
                copyable: true,
              },
            },
          );
        } else {
          try {
            await chatSessionRepository.deleteMessage(
              currentMessageInfo.current.id,
            );
            if (session) {
              runInAction(() => {
                session.messages = session.messages.filter(
                  msg => msg.id !== currentMessageInfo.current!.id,
                );
              });
            }
          } catch (cleanupError) {
            console.error(
              'Failed to clean up empty message after error:',
              cleanupError,
            );
          }
        }
      }

      const errorMessage = (error as Error).message;
      if (errorMessage.includes('network')) {
        await addSystemMessage(l10n.common.networkError);
      } else {
        await addSystemMessage(`${l10n.chat.completionFailed}${errorMessage}`);
      }
    } finally {
      try {
        deactivateKeepAwake();
      } catch (error) {
        console.error('Failed to deactivate keep awake after chat:', error);
      }
    }
  };

  const handleResetConversation = async () => {
    conversationIdRef.current = randId();
    await addSystemMessage(l10n.chat.conversationReset);
  };

  const handleStopPress = async () => {
    // Enter the `stopping` state IMMEDIATELY: the user gets visible
    // feedback ("Stopping…") and the send button is gated off so a
    // new completion can't try to use the still-busy native context.
    // We do NOT touch `inferencing` / `isGenerating` here — those get
    // cleared by the for-await cleanup in handleSendPress once the
    // runner has actually exited (native llama.rn has returned from
    // its current llama_decode chunk; see ChatSessionStore.isStopping
    // for the rationale).
    chatSessionStore.setIsStopping(true);
    // The runner's abort listener calls engine.stopCompletion when the
    // signal fires — the explicit call here used to be a redundant
    // second hop that just added ~90 ms of await to the handler. The
    // signal dispatch below is the single source of stop intent.
    abortRef.current?.abort();
    // Stop any in-flight TTS so buffered audio doesn't keep playing
    // after the user tapped Stop. Inferencing/isStreaming/isGenerating
    // flags are NOT cleared here — those get cleared by the for-await
    // cleanup in handleSendPress once the runner has actually exited.
    ttsStore.stop().catch(err => {
      console.warn('[useChatSession] TTS stop on user-stop failed:', err);
    });

    // Note: deactivateKeepAwake intentionally stays here so the device
    // can sleep as soon as the user signals stop, even if native is
    // still finishing the current chunk.
    try {
      deactivateKeepAwake();
    } catch (error) {
      console.error(
        'Failed to deactivate keep awake after stopping chat:',
        error,
      );
    }
  };

  return {
    handleSendPress,
    handleResetConversation,
    handleStopPress,
    isMultimodalEnabled: async () => await modelStore.isMultimodalEnabled(),
  };
};
