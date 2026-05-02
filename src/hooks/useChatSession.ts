import React, {useRef} from 'react';

import {toJS, runInAction} from 'mobx';

import {chatSessionRepository} from '../repositories/ChatSessionRepository';

import {randId} from '../utils';
import {L10nContext} from '../utils';
import {chatSessionStore, modelStore, palStore, uiStore} from '../store';

import {MessageType, User} from '../utils/types';
import {createMultimodalWarning} from '../utils/errors';
import {resolveSystemMessages} from '../utils/systemPromptResolver';
import {convertToChatMessages, removeThinkingParts} from '../utils/chat';
import {activateKeepAwake, deactivateKeepAwake} from '../utils/keepAwake';
import {
  toApiCompletionParams,
  CompletionParams,
} from '../utils/completionTypes';
import {talentRegistry} from '../services/talents';
import type {TalentResult} from '../services/talents/types';

// Helper function to prepare completion parameters using OpenAI-compatible messages API
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

  // Create user message content - use array format only for multimodal, string for text-only
  let userMessageContent: any;

  if (hasImages && isMultimodalEnabled) {
    // Multimodal: use array format with text and images
    userMessageContent = [
      {
        type: 'text',
        text: message.text,
      },
      ...imageUris.map(path => ({
        type: 'image_url',
        image_url: {url: path}, // llama.rn handles file:// prefix removal
      })),
    ];
  } else {
    // Text-only: use simple string format
    userMessageContent = message.text;

    // Show warning if user tried to send images but multimodal is not enabled
    if (hasImages && !isMultimodalEnabled) {
      uiStore.setChatWarning(
        createMultimodalWarning(l10n.chat.multimodalNotEnabled),
      );
    }
  }

  // Convert chat session messages to llama.rn format
  let chatMessages = convertToChatMessages(
    currentMessages.filter(msg => msg.type !== 'image'),
    isMultimodalEnabled,
  );

  // Check if we should include thinking parts in the context
  const includeThinkingInContext =
    (sessionCompletionSettings as CompletionParams)
      ?.include_thinking_in_context !== false;

  // If the user has disabled including thinking parts, remove them from assistant messages
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

  // Create the messages array for llama.rn - same format for all cases
  const messages = [
    ...systemMessages,
    ...chatMessages,
    {
      role: 'user',
      content: userMessageContent,
    },
  ];

  // Create completion params with app-specific properties
  const completionParamsWithAppProps = {
    ...sessionCompletionSettings,
    messages,
    stop: stopWords,
  };

  // Strip app-specific properties before passing to llama.rn
  const cleanCompletionParams = toApiCompletionParams(
    completionParamsWithAppProps as CompletionParams,
  );

  // If enable_thinking is true, set reasoning_format to 'auto'
  // This returns the reasoning content in a separate field (reasoning_content)
  if (cleanCompletionParams.enable_thinking) {
    cleanCompletionParams.reasoning_format = 'auto';
  }

  // Create empty assistant message in both database and store
  const createdAt = Date.now();
  const emptyMessage: MessageType.Text = {
    author: assistant,
    createdAt: createdAt,
    id: '', // Will be set by addMessageToCurrentSession
    text: '',
    type: 'text',
    metadata: {
      contextId,
      conversationId: conversationIdRef,
      copyable: true,
      multimodal: hasImages, // Simple check based on presence of images
    },
  };

  // Use store method to ensure message is added to both database AND MobX observable store
  await chatSessionStore.addMessageToCurrentSession(emptyMessage);

  const messageInfo = {
    createdAt,
    id: emptyMessage.id, // This is now set by addMessageToCurrentSession
    sessionId: chatSessionStore.activeSessionId!,
  };

  return {cleanCompletionParams, sessionCompletionSettings, messageInfo};
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
    // Guard on engine instead of context -- supports both local and remote models
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

    // Extract imageUris from the message object
    const imageUris = message.imageUris;
    // Check if we have images in the current message
    const hasImages = imageUris && imageUris.length > 0;

    const isMultimodalEnabled = await modelStore.isMultimodalEnabled();

    // Get the current session messages BEFORE adding the new user message
    // Use toJS to get a snapshot and avoid MobX reactivity issues
    const currentMessages = toJS(chatSessionStore.currentSessionMessages);

    // Create the user message with embedded images
    const textMessage: MessageType.Text = {
      author: user,
      createdAt: Date.now(),
      id: '', // Will be set by the database
      text: message.text,
      type: 'text',
      imageUris: hasImages ? imageUris : undefined, // Include images directly in the text message
      metadata: {
        contextId,
        conversationId: conversationIdRef.current,
        copyable: true,
        multimodal: hasImages, // Mark as multimodal if it has images
      },
    };
    await addMessage(textMessage);
    modelStore.setInferencing(true);
    modelStore.setIsStreaming(false);
    chatSessionStore.setIsGenerating(true);

    // Keep screen awake during completion
    try {
      activateKeepAwake();
    } catch (error) {
      console.error('Failed to activate keep awake during chat:', error);
      // Continue with chat even if keep awake fails
    }

    const activeSession = chatSessionStore.sessions.find(
      s => s.id === chatSessionStore.activeSessionId,
    );

    // Resolve system messages using utility function
    const pal = activeSession?.activePalId
      ? palStore.pals.find(p => p.id === activeSession.activePalId)
      : null;

    const systemMessages = resolveSystemMessages({
      pal,
      model: modelStore.activeModel,
    });

    // Prepare completion parameters and create message record
    const {cleanCompletionParams, sessionCompletionSettings, messageInfo} =
      await prepareCompletion({
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

    try {
      // Track time to first token
      const completionStartTime = Date.now();
      let timeToFirstToken: number | null = null;

      // Streaming callback shared by initial and follow-up completions.
      // Streams content/reasoning into the current assistant message and
      // flags pending talent names when tool_calls arrive.
      const createStreamCallback =
        (
          msgInfo: React.MutableRefObject<{
            id: string;
            sessionId: string;
          } | null>,
        ) =>
        (data: any) => {
          if (!msgInfo.current) {
            return;
          }

          // Capture time to first token on the first token received
          if (timeToFirstToken === null && (data.token || data.content)) {
            timeToFirstToken = Date.now() - completionStartTime;
          }

          if (!modelStore.isStreaming) {
            modelStore.setIsStreaming(true);
          }

          const {content = '', reasoning_content: reasoningContent} = data;

          if (data.tool_calls && data.tool_calls.length > 0) {
            const names = data.tool_calls
              .map((tc: any) => tc.function?.name)
              .filter(Boolean);
            chatSessionStore.updateMessageStreaming(
              msgInfo.current.id,
              msgInfo.current.sessionId,
              {
                metadata: {
                  pendingTalentNames: names.length > 0 ? names : ['unknown'],
                },
              },
            );
          }

          if (content || reasoningContent) {
            const update: any = {
              metadata: {
                partialCompletionResult: {
                  reasoning_content: reasoningContent,
                  content: content.replace(/^\s+/, ''),
                },
              },
            };
            if (content) {
              update.text = content.replace(/^\s+/, '');
            }
            chatSessionStore.updateMessageStreaming(
              msgInfo.current.id,
              msgInfo.current.sessionId,
              update,
            );
          }
        };

      // Execute talent engines for a set of tool calls.
      // Returns tool response messages and a result map keyed by call id.
      const executeTalentCalls = async (
        calls: Array<{id: string; function?: {name?: string; arguments?: any}}>,
        allowedTalents: string[],
      ) => {
        const msgs: Array<{tool_call_id: string; content: string}> = [];
        const results: Record<string, TalentResult> = {};

        for (const tc of calls) {
          const fnName = tc.function?.name;
          const callId = tc.id;
          if (!fnName || !allowedTalents.includes(fnName)) {
            const summary = fnName
              ? `Talent "${fnName}" is not enabled for this Pal`
              : 'Unknown talent (no function name)';
            msgs.push({tool_call_id: callId, content: summary});
            results[callId] = {type: 'error', summary, errorMessage: summary};
            continue;
          }
          const handler = talentRegistry.get(fnName);
          if (!handler) {
            const summary = `Talent "${fnName}" is not available on this device`;
            msgs.push({tool_call_id: callId, content: summary});
            results[callId] = {type: 'error', summary, errorMessage: summary};
            continue;
          }

          let parsedArgs: Record<string, any>;
          try {
            parsedArgs =
              typeof tc.function?.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : (tc.function?.arguments ?? {});
          } catch {
            const summary = `Error: invalid JSON arguments for ${fnName}`;
            msgs.push({tool_call_id: callId, content: summary});
            results[callId] = {type: 'error', summary, errorMessage: summary};
            continue;
          }

          try {
            const toolResult = await handler.execute(parsedArgs);
            msgs.push({tool_call_id: callId, content: toolResult.summary});
            results[callId] = toolResult;
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            const summary = `Error executing ${fnName}: ${errMsg}`;
            msgs.push({tool_call_id: callId, content: summary});
            results[callId] = {type: 'error', summary, errorMessage: errMsg};
          }
        }

        return {toolMessages: msgs, talentResultsMap: results};
      };

      // Create the completion promise using the engine interface
      // This works for both local (LlamaContext wrapper) and remote (OpenAI SSE) models
      const completionPromise = engine.completion(
        cleanCompletionParams,
        createStreamCallback(currentMessageInfo),
      );

      // Only register completion promise for local models -- protects native context from being freed mid-completion
      // For remote models, stopCompletion() via AbortController handles cleanup
      if (modelStore.context) {
        modelStore.registerCompletionPromise(completionPromise);
      }

      // Await the completion
      let result = await completionPromise;

      // Clear the promise after completion finishes
      modelStore.clearCompletionPromise();

      // Log completion result with time to first token for debugging
      if (__DEV__) {
        console.log('Completion result:', {
          ...result.timings,
          time_to_first_token_ms: timeToFirstToken,
          reasoning_content: result.reasoning_content,
          content: result.content,
          text: result.text,
        });
        console.log('result', result);
      }

      // Talent dispatch (PACT: render_html, calculate, datetime, etc.)
      // Pal opts in via pact.talents. Engines are name-keyed in the
      // global registry — no Pal-id coupling.
      const palTalents = (pal?.pact?.talents ?? []).map(t => t.name);
      // llama.rn sometimes returns tool_calls with id: null. Strict Jinja
      // templates reject `tool_call_id: null` in the next-turn tool response,
      // so we backfill a stable synthetic id before storing or echoing it.
      const normalizeToolCallIds = (
        rawCalls: any[],
      ): Array<{id: string; function?: {name?: string; arguments?: any}}> => {
        const seed = Date.now();
        return rawCalls.map((tc, i) => ({
          ...tc,
          id: tc.id || `call_${seed}_${i}`,
        }));
      };

      let currentToolCalls = normalizeToolCallIds(result.tool_calls ?? []);
      let {
        toolMessages: currentToolMessages,
        talentResultsMap: currentTalentResults,
      } = await executeTalentCalls(currentToolCalls, palTalents);

      // --- Follow-up completion loop for text-result talents ---
      // Some talents (calculate, datetime) need the model to see the tool
      // result and produce a natural-language answer. Visual talents
      // (render_html) are self-rendering and skip this.
      const MAX_TOOL_TURNS = 5;
      let turnCount = 0;

      while (turnCount < MAX_TOOL_TURNS) {
        const needsFollowUp = currentToolCalls.some(tc => {
          const eng = talentRegistry.get(tc.function?.name ?? '');
          return eng?.requiresModelResponse === true;
        });

        if (!needsFollowUp || currentToolMessages.length === 0) {
          break;
        }

        // Bail if user pressed stop between tool execution and follow-up
        if (!chatSessionStore.isGenerating) {
          break;
        }

        turnCount++;

        // Persist tool-call metadata so convertToChatMessages can
        // reconstruct [assistant-with-tool_calls, tool_response] history
        await chatSessionStore.updateMessage(
          currentMessageInfo.current.id,
          currentMessageInfo.current.sessionId,
          {
            metadata: {
              talentCalls: currentToolCalls,
              toolMessages: currentToolMessages,
              talentResults: currentTalentResults,
            },
          },
        );

        // Rebuild messages from the full conversation (now includes tool-call turn)
        const updatedMessages = toJS(chatSessionStore.currentSessionMessages);
        let followUpChatMessages = convertToChatMessages(
          updatedMessages.filter(msg => msg.type !== 'image'),
          isMultimodalEnabled,
        );

        const includeThinking =
          (sessionCompletionSettings as CompletionParams)
            ?.include_thinking_in_context !== false;
        if (!includeThinking) {
          followUpChatMessages = followUpChatMessages.map(msg =>
            msg.role === 'assistant' && typeof msg.content === 'string'
              ? {...msg, content: removeThinkingParts(msg.content)}
              : msg,
          );
        }

        const followUpParams = {
          ...cleanCompletionParams,
          messages: [...systemMessages, ...followUpChatMessages],
        };

        // Register follow-up so the stop button works
        // Follow-up text intentionally overwrites first-turn text. Tool-calling
        // models rarely emit meaningful content alongside tool_calls, and the
        // follow-up response IS the user-facing answer.
        const followUpPromise = engine.completion(
          followUpParams,
          createStreamCallback(currentMessageInfo),
        );
        if (modelStore.context) {
          modelStore.registerCompletionPromise(followUpPromise);
        }

        const followUpResult = await followUpPromise;
        modelStore.clearCompletionPromise();

        const followUpRawCalls = followUpResult.tool_calls ?? [];
        if (followUpRawCalls.length === 0) {
          // No more tool calls — use follow-up as the final result
          result = followUpResult;
          break;
        }

        // Model chained more tool calls — execute and loop
        result = followUpResult;
        currentToolCalls = normalizeToolCallIds(followUpRawCalls);
        ({
          toolMessages: currentToolMessages,
          talentResultsMap: currentTalentResults,
        } = await executeTalentCalls(currentToolCalls, palTalents));
      }

      // Update final completion metadata
      await chatSessionStore.updateMessage(
        currentMessageInfo.current.id,
        currentMessageInfo.current.sessionId,
        {
          metadata: {
            timings: {
              ...result.timings,
              time_to_first_token_ms: timeToFirstToken,
            },
            copyable: true,
            // Add multimodal flag if this was a multimodal completion
            multimodal: hasImages && isMultimodalEnabled,
            // Save the final completion result with reasoning_content
            completionResult: {
              reasoning_content: result.reasoning_content,
              content: result.text,
            },
            ...(currentToolCalls.length > 0
              ? {talentCalls: currentToolCalls}
              : {}),
            ...(currentToolMessages.length > 0
              ? {toolMessages: currentToolMessages}
              : {}),
            ...(Object.keys(currentTalentResults).length > 0
              ? {talentResults: currentTalentResults}
              : {}),
          },
        },
      );
      modelStore.setInferencing(false);
      modelStore.setIsStreaming(false);
      chatSessionStore.setIsGenerating(false);
    } catch (error) {
      // Clear the promise on error too
      modelStore.clearCompletionPromise();
      console.error('Completion error:', error);
      modelStore.setInferencing(false);
      modelStore.setIsStreaming(false);
      chatSessionStore.setIsGenerating(false);

      // For remote models: preserve partial message if tokens were already streamed
      // Instead of deleting the message, keep what we have and show error toast
      if (currentMessageInfo.current) {
        const session = chatSessionStore.sessions.find(
          s => s.id === currentMessageInfo.current!.sessionId,
        );
        const currentMsg = session?.messages.find(
          msg => msg.id === currentMessageInfo.current!.id,
        );
        const hasPartialContent =
          currentMsg && 'text' in currentMsg && currentMsg.text;

        if (hasPartialContent) {
          // Partial content exists -- keep it and add error metadata
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
          // No content was streamed -- clean up the empty assistant message
          try {
            await chatSessionRepository.deleteMessage(
              currentMessageInfo.current.id,
            );
            // Also remove from local state
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
      // Always try to deactivate keep awake in finally block
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
    // Use engine.stopCompletion() for both local and remote models
    if (modelStore.inferencing && modelStore.engine) {
      modelStore.engine.stopCompletion();
    }
    modelStore.setInferencing(false);
    modelStore.setIsStreaming(false);
    chatSessionStore.setIsGenerating(false);

    // Deactivate keep awake when stopping completion
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
    // Add a method to check if multimodal is enabled
    isMultimodalEnabled: async () => await modelStore.isMultimodalEnabled(),
  };
};
