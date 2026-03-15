import React, {useRef} from 'react';

import {toJS, runInAction} from 'mobx';

import {chatSessionRepository} from '../repositories/ChatSessionRepository';

import {randId} from '../utils';
import {L10nContext} from '../utils';
import {chatSessionStore, modelStore, palStore, uiStore} from '../store';

import {MessageType, User} from '../utils/types';
import {createMultimodalWarning} from '../utils/errors';
import {resolveSystemMessages} from '../utils/systemPromptResolver';
import {
  applyChatTemplate,
  convertToChatMessages,
  getEffectiveChatTemplateInterpreter,
  normalizeChatTemplateResult,
  removeThinkingParts,
} from '../utils/chat';
import {activateKeepAwake, deactivateKeepAwake} from '../utils/keepAwake';
import {
  buildCompletionParamProbe,
  getTextDiagnostics,
  previewText,
  scheduleVisionDebugHeartbeats,
  visionDebugLog,
} from '../utils/debug';
import {
  toApiCompletionParams,
  CompletionParams,
} from '../utils/completionTypes';

// Helper function to prepare completion parameters using OpenAI-compatible messages API
const prepareCompletion = async ({
  imageUris,
  message,
  systemMessages,
  context,
  assistant,
  conversationIdRef,
  isMultimodalEnabled,
  l10n,
  currentMessages,
}: {
  imageUris: string[];
  message: MessageType.PartialText;
  systemMessages: Array<{role: 'system'; content: string}>;
  context: any;
  assistant: User;
  conversationIdRef: string;
  isMultimodalEnabled: boolean;
  l10n: any;
  currentMessages: MessageType.Any[];
}) => {
  const mergeStopWords = (
    existingStops: unknown,
    additionalStops: string[],
  ) => {
    const mergedStops = new Set<string>(
      Array.isArray(existingStops)
        ? existingStops.filter(
            (stop): stop is string =>
              typeof stop === 'string' && stop.length > 0,
          )
        : [],
    );

    additionalStops.forEach(stop => {
      if (typeof stop === 'string' && stop.length > 0) {
        mergedStops.add(stop);
      }
    });

    return Array.from(mergedStops);
  };

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
  visionDebugLog('prepareCompletion:messages', {
    messageCount: messages.length,
    hasImages,
    isMultimodalEnabled,
    lastUserMessage: Array.isArray(userMessageContent)
      ? {
          parts: userMessageContent.map(part => part.type),
          textLength:
            userMessageContent.find(part => part.type === 'text')?.text
              ?.length ?? 0,
        }
      : {type: 'text', textLength: String(userMessageContent).length},
  });

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
  const thinkingAssembly = {
    enable_thinking: cleanCompletionParams.enable_thinking ?? false,
    reasoning_format: cleanCompletionParams.reasoning_format ?? null,
    include_thinking_in_context: includeThinkingInContext,
    add_generation_prompt:
      modelStore.activeModel?.chatTemplate?.addGenerationPrompt ?? false,
  };

  const modelTemplate =
    modelStore.activeModel?.chatTemplate?.chatTemplate?.trim();
  const contextTemplate = (context?.model as any)?.metadata?.[
    'tokenizer.chat_template'
  ];
  const contextArchitecture = String(
    (context?.model as any)?.metadata?.['general.architecture'] || '',
  ).toLowerCase();
  let formattedPromptPreview = '';
  let formattedPromptLength = 0;
  let formattedPromptError: string | undefined;
  let formattedPromptTextForRuntime = '';
  let formattedPromptAdditionalStops: string[] = [];
  let formattedPromptGrammar: string | undefined;
  let formattedPromptGrammarLazy: boolean | undefined;
  let formattedPromptGrammarTriggers: unknown[] | undefined;
  let formattedPromptPreservedTokens: unknown[] | undefined;
  let formattedPromptChatParser: string | undefined;
  let formattedPromptHasMedia = false;
  let formattedPromptMediaPaths: string[] = [];
  const effectiveTemplateInterpreter = getEffectiveChatTemplateInterpreter(
    modelStore.activeModel?.chatTemplate,
  );
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const formattedPrompt = await applyChatTemplate(
      messages as any,
      modelStore.activeModel ?? null,
      context ?? null,
    );
    const normalizedPrompt = normalizeChatTemplateResult(formattedPrompt);
    formattedPromptTextForRuntime = normalizedPrompt.prompt;
    formattedPromptLength = normalizedPrompt.prompt.length;
    formattedPromptPreview = previewText(normalizedPrompt.prompt);
    formattedPromptAdditionalStops = normalizedPrompt.additionalStops;
    formattedPromptGrammar = normalizedPrompt.grammar;
    formattedPromptGrammarLazy = normalizedPrompt.grammarLazy;
    formattedPromptGrammarTriggers = normalizedPrompt.grammarTriggers;
    formattedPromptPreservedTokens = normalizedPrompt.preservedTokens;
    formattedPromptChatParser = normalizedPrompt.chatParser;
    formattedPromptHasMedia = normalizedPrompt.hasMedia ?? false;
    formattedPromptMediaPaths = normalizedPrompt.mediaPaths;
  } catch (error) {
    formattedPromptError =
      error instanceof Error ? error.message : JSON.stringify(error);
  }

  if (formattedPromptAdditionalStops.length > 0) {
    cleanCompletionParams.stop = mergeStopWords(
      cleanCompletionParams.stop,
      formattedPromptAdditionalStops,
    );
  }

  if (formattedPromptGrammar) {
    (cleanCompletionParams as any).grammar = formattedPromptGrammar;
  }

  if (formattedPromptGrammarLazy !== undefined) {
    (cleanCompletionParams as any).grammar_lazy = formattedPromptGrammarLazy;
  }

  if (formattedPromptGrammarTriggers) {
    (cleanCompletionParams as any).grammar_triggers =
      formattedPromptGrammarTriggers;
  }

  if (formattedPromptPreservedTokens) {
    (cleanCompletionParams as any).preserved_tokens =
      formattedPromptPreservedTokens;
  }

  if (formattedPromptChatParser) {
    (cleanCompletionParams as any).chat_parser = formattedPromptChatParser;
  }

  if (hasImages && effectiveTemplateInterpreter === 'jinja' && modelTemplate) {
    (cleanCompletionParams as any).chatTemplate = modelTemplate;
  }

  // qwen35 fallback:
  // force prompt transport to bypass runtime messages+jinja formatting path.
  const canUsePromptTransportForMultimodal =
    hasImages && formattedPromptMediaPaths.length > 0;
  const usePromptFallbackForQwen35 =
    !hasImages &&
    contextArchitecture.includes('qwen35') &&
    !!formattedPromptTextForRuntime &&
    !formattedPromptError;
  const usePromptTransportForFormattedTemplate =
    !!formattedPromptTextForRuntime &&
    !formattedPromptError &&
    (!hasImages || canUsePromptTransportForMultimodal);

  if (usePromptFallbackForQwen35 || usePromptTransportForFormattedTemplate) {
    (cleanCompletionParams as any).prompt = formattedPromptTextForRuntime;
    delete (cleanCompletionParams as any).messages;
    (cleanCompletionParams as any).jinja = false;

    if (formattedPromptMediaPaths.length > 0) {
      (cleanCompletionParams as any).media_paths = formattedPromptMediaPaths;
    }

    delete (cleanCompletionParams as any).chatTemplate;
  }

  const completionTransport = usePromptFallbackForQwen35
    ? 'prompt-fallback-qwen35'
    : usePromptTransportForFormattedTemplate
      ? 'prompt-preformatted-template'
      : 'messages-api';

  // Core LLM observability logs: keep full template/system prompt/input.
  console.log('[LLM Input] request', {
    requestId,
    completionTransport,
    modelId: modelStore.activeModel?.id,
    modelName: modelStore.activeModel?.name,
    thinkingAssembly,
    systemMessages,
    userMessage: message.text,
    modelTemplateFull: modelTemplate || '',
    contextTemplateFull: String(contextTemplate || ''),
    formattedPromptFull: formattedPromptTextForRuntime,
    formattedPromptError,
  });

  visionDebugLog('prepareCompletion:params', {
    requestId,
    completionTransport,
    activeModel: modelStore.activeModel
      ? {
          id: modelStore.activeModel.id,
          name: modelStore.activeModel.name,
          filename: modelStore.activeModel.filename,
        }
      : undefined,
    activeProjectionModel: modelStore.activeProjectionModelId
      ? modelStore.models.find(
          model => model.id === modelStore.activeProjectionModelId,
        )
        ? {
            id: modelStore.models.find(
              model => model.id === modelStore.activeProjectionModelId,
            )?.id,
            name: modelStore.models.find(
              model => model.id === modelStore.activeProjectionModelId,
            )?.name,
            filename: modelStore.models.find(
              model => model.id === modelStore.activeProjectionModelId,
            )?.filename,
          }
        : undefined
      : undefined,
    input: {
      text: message.text,
      imageCount: imageUris.length,
      imageUris: imageUris.map(uri => uri.slice(0, 120)),
      systemMessageCount: systemMessages.length,
    },
    settings: {
      temperature: cleanCompletionParams.temperature,
      top_k: cleanCompletionParams.top_k,
      top_p: cleanCompletionParams.top_p,
      min_p: cleanCompletionParams.min_p,
      seed: cleanCompletionParams.seed,
      n_predict: cleanCompletionParams.n_predict,
      enable_thinking: cleanCompletionParams.enable_thinking,
      reasoning_format: cleanCompletionParams.reasoning_format,
      stop: cleanCompletionParams.stop,
    },
    settingsFull: cleanCompletionParams,
    transportPayload: {
      hasPrompt: typeof (cleanCompletionParams as any).prompt === 'string',
      promptLength: String((cleanCompletionParams as any).prompt ?? '').length,
      hasMessages: Array.isArray((cleanCompletionParams as any).messages),
      messageCount: Array.isArray((cleanCompletionParams as any).messages)
        ? (cleanCompletionParams as any).messages.length
        : 0,
      hasMediaPaths: Array.isArray((cleanCompletionParams as any).media_paths),
      mediaPathCount: Array.isArray((cleanCompletionParams as any).media_paths)
        ? (cleanCompletionParams as any).media_paths.length
        : 0,
      jinja: (cleanCompletionParams as any).jinja,
      chatTemplateLength: String(
        (cleanCompletionParams as any).chatTemplate ?? '',
      ).length,
    },
    template: {
      selectedTemplateName: modelStore.activeModel?.chatTemplate?.name,
      effectiveTemplateInterpreter,
      modelTemplateLength: modelTemplate?.length ?? 0,
      contextTemplateLength: String(contextTemplate || '').length,
      contextTemplatePreview: previewText(contextTemplate),
      modelTemplateFull: modelTemplate || '',
      contextTemplateFull: String(contextTemplate || ''),
      formattedPromptLength,
      formattedPromptPreview,
      formattedPromptFull: formattedPromptTextForRuntime,
      formattedPromptAdditionalStops,
      formattedPromptHasMedia,
      formattedPromptMediaPaths,
      formattedPromptChatParser,
      formattedPromptError,
      note: usePromptFallbackForQwen35
        ? 'Using formatted prompt fallback for qwen35 text completion.'
        : usePromptTransportForFormattedTemplate
          ? hasImages
            ? 'Runtime completion sends the preformatted multimodal prompt and media_paths directly to llama.rn.'
            : 'Runtime completion sends the preformatted prompt directly to llama.rn.'
          : 'Runtime completion currently sends messages directly to llama.rn.',
    },
    contextMetadata: {
      architecture: (context?.model as any)?.metadata?.['general.architecture'],
      eosTokenId: (context?.model as any)?.metadata?.[
        'tokenizer.ggml.eos_token_id'
      ],
      bosTokenId: (context?.model as any)?.metadata?.[
        'tokenizer.ggml.bos_token_id'
      ],
      chatTemplateHash: getTextDiagnostics(contextTemplate).hash,
    },
  });

  // Create empty assistant message in both database and store
  const createdAt = Date.now();
  const emptyMessage: MessageType.Text = {
    author: assistant,
    createdAt: createdAt,
    id: '', // Will be set by addMessageToCurrentSession
    text: '',
    type: 'text',
    metadata: {
      contextId: context.id,
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

  return {cleanCompletionParams, messageInfo, requestId, completionTransport};
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
    const context = modelStore.context;
    if (!context) {
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
        contextId: context.id,
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
    const {cleanCompletionParams, messageInfo, requestId, completionTransport} =
      await prepareCompletion({
        imageUris: imageUris || [],
        message,
        systemMessages,
        context,
        assistant,
        conversationIdRef: conversationIdRef.current,
        isMultimodalEnabled,
        l10n,
        currentMessages,
      });

    currentMessageInfo.current = messageInfo;

    let completionSettled = false;
    let cancelNativeCallHeartbeats = () => undefined;

    try {
      // Track time to first token
      const completionStartTime = Date.now();
      let timeToFirstToken: number | null = null;
      let streamChunkCount = 0;
      let streamedContentPreview = '';
      let streamedReasoningPreview = '';
      let firstAnomalousChunkLogged = false;
      let nativeBridgeReturned = false;
      let firstNativeChunkSeen = false;

      visionDebugLog('completion:pre-native-call', {
        requestId,
        transport: completionTransport,
        probe: buildCompletionParamProbe(cleanCompletionParams as any),
      });
      cancelNativeCallHeartbeats = scheduleVisionDebugHeartbeats(
        'completion:native-call-heartbeat',
        () => ({
          requestId,
          transport: completionTransport,
          nativeBridgeReturned,
          firstNativeChunkSeen,
          completionSettled,
          isStreaming: modelStore.isStreaming,
          inferencing: modelStore.inferencing,
        }),
      );

      // Create the completion promise and register it with modelStore
      // This enables safe context release by waiting for the promise to finish
      const completionPromise = context.completion(
        cleanCompletionParams,
        data => {
          if (currentMessageInfo.current) {
            // Capture time to first token on the first token received
            if (timeToFirstToken === null && (data.token || data.content)) {
              timeToFirstToken = Date.now() - completionStartTime;
            }

            if (
              !firstNativeChunkSeen &&
              (data.token || data.content || data.reasoning_content)
            ) {
              firstNativeChunkSeen = true;
              visionDebugLog('completion:first-native-chunk', {
                requestId,
                transport: completionTransport,
                callbackKeys: Object.keys(data || {}),
                tokenPreview: previewText((data as any)?.token, 120),
                contentPreview: previewText((data as any)?.content, 120),
                reasoningPreview: previewText(
                  (data as any)?.reasoning_content,
                  120,
                ),
              });
            }

            if (!modelStore.isStreaming) {
              modelStore.setIsStreaming(true);
            }

            // Use content and reasoning_content from the streaming data
            // llama.rn already separates these for us when enable_thinking is true
            const {content = '', reasoning_content: reasoningContent} = data;

            if (content || reasoningContent) {
              streamChunkCount += 1;
            }
            if (content && streamedContentPreview.length < 500) {
              streamedContentPreview = previewText(
                `${streamedContentPreview}${content}`,
              );
            }
            if (reasoningContent && streamedReasoningPreview.length < 500) {
              streamedReasoningPreview = previewText(
                `${streamedReasoningPreview}${reasoningContent}`,
              );
            }

            if (!firstAnomalousChunkLogged && (content || reasoningContent)) {
              const contentDiag = getTextDiagnostics(content);
              const reasoningDiag = getTextDiagnostics(reasoningContent);
              const suspiciousContent =
                contentDiag.symbolRatio > 0.45 ||
                contentDiag.repeatedCharMaxRun >= 6 ||
                contentDiag.repeatedBigramCount >= 10;
              const suspiciousReasoning =
                reasoningDiag.symbolRatio > 0.45 ||
                reasoningDiag.repeatedCharMaxRun >= 6 ||
                reasoningDiag.repeatedBigramCount >= 10;
              if (suspiciousContent || suspiciousReasoning) {
                firstAnomalousChunkLogged = true;
                visionDebugLog('completion:anomalous-chunk', {
                  requestId,
                  streamChunkCount,
                  callbackKeys: Object.keys(data || {}),
                  tokenPreview: previewText((data as any)?.token, 120),
                  contentDiag,
                  reasoningDiag,
                });
              }
            }

            // Update message with the separated content
            if (content || reasoningContent) {
              // Build the update object
              const update: any = {
                metadata: {
                  partialCompletionResult: {
                    reasoning_content: reasoningContent,
                    content: content.replace(/^\s+/, ''),
                  },
                },
              };

              // Only update text if we have actual content
              if (content) {
                update.text = content.replace(/^\s+/, '');
              }

              // Use the store's streaming update method which properly triggers reactivity
              chatSessionStore.updateMessageStreaming(
                currentMessageInfo.current.id,
                currentMessageInfo.current.sessionId,
                update,
              );
            }
          }
        },
      );
      nativeBridgeReturned = true;
      visionDebugLog('completion:post-native-call', {
        requestId,
        transport: completionTransport,
        nativeBridgeReturned,
        promiseCreated: Boolean(completionPromise),
      });

      // Register the promise so releaseContext can wait for it
      modelStore.registerCompletionPromise(completionPromise);

      // Await the completion
      const result = await completionPromise;
      completionSettled = true;
      cancelNativeCallHeartbeats();

      // Clear the promise after completion finishes
      modelStore.clearCompletionPromise();

      // Log completion result with time to first token for debugging
      console.log('[LLM Output] completion result:', {
        requestId,
        ...result.timings,
        time_to_first_token_ms: timeToFirstToken,
        reasoning_content: result.reasoning_content,
        content: result.content,
        text: result.text,
      });
      visionDebugLog('completion:result', {
        requestId,
        timeToFirstToken,
        streamChunkCount,
        finalTextLength: result.text?.length ?? 0,
        finalContentLength: result.content?.length ?? 0,
        finalReasoningLength: result.reasoning_content?.length ?? 0,
        streamedContentPreview,
        streamedReasoningPreview,
        finalTextPreview: previewText(result.text),
        finalContentPreview: previewText(result.content),
        finalReasoningPreview: previewText(result.reasoning_content),
        finalTextDiag: getTextDiagnostics(result.text),
        finalContentDiag: getTextDiagnostics(result.content),
        finalReasoningDiag: getTextDiagnostics(result.reasoning_content),
      });

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
          },
        },
      );
      modelStore.setInferencing(false);
      modelStore.setIsStreaming(false);
      chatSessionStore.setIsGenerating(false);
    } catch (error) {
      completionSettled = true;
      cancelNativeCallHeartbeats();
      // Clear the promise on error too
      modelStore.clearCompletionPromise();
      console.error('Completion error:', error);
      visionDebugLog('completion:error', {
        requestId,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      });
      modelStore.setInferencing(false);
      modelStore.setIsStreaming(false);
      chatSessionStore.setIsGenerating(false);

      // Clean up the empty assistant message that was created before the error
      if (currentMessageInfo.current) {
        try {
          await chatSessionRepository.deleteMessage(
            currentMessageInfo.current.id,
          );
          // Also remove from local state
          const session = chatSessionStore.sessions.find(
            s => s.id === currentMessageInfo.current!.sessionId,
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

      const errorMessage = (error as Error).message;
      if (errorMessage.includes('network')) {
        // TODO: This can be removed. We don't use network for chat.
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
    const context = modelStore.context;
    if (modelStore.inferencing && context) {
      context.stopCompletion();
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
