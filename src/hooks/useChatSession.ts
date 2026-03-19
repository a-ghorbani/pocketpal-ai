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
  removeThinkingParts,
} from '../utils/chat';
import {activateKeepAwake, deactivateKeepAwake} from '../utils/keepAwake';
import {
  buildCompletionParamProbe,
  engineInputLog,
  engineOutputLog,
  getTextDiagnostics,
  paramSourceLog,
  previewText,
  promptBuildLog,
  scheduleEngineOutputHeartbeats,
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
  promptBuildLog('prepareCompletion:messages', {
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

  const effectiveTemplateInterpreter = getEffectiveChatTemplateInterpreter(
    modelStore.activeModel?.chatTemplate,
  );
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Determine completion path based on template interpreter and multimodal status
  const isNunjucks = effectiveTemplateInterpreter === 'nunjucks';
  let completionTransport: string;
  let nunjucksRenderError: string | undefined;

  if (isNunjucks && !hasImages) {
    // ⑤ Nunjucks + text-only → Path B (only case that needs JS-side rendering)
    try {
      const renderedPrompt = await applyChatTemplate(
        messages as any,
        modelStore.activeModel ?? null,
        context ?? null,
      );
      const promptStr =
        typeof renderedPrompt === 'string' ? renderedPrompt : '';
      if (promptStr) {
        (cleanCompletionParams as any).prompt = promptStr;
        delete (cleanCompletionParams as any).messages;
        (cleanCompletionParams as any).jinja = false;
      }
    } catch (error) {
      nunjucksRenderError =
        error instanceof Error ? error.message : JSON.stringify(error);
    }
    completionTransport = (cleanCompletionParams as any).prompt
      ? 'prompt-preformatted-template'
      : 'messages-api';
  } else {
    // ①②③④⑥ → Path A (native handles template rendering + all metadata)
    (cleanCompletionParams as any).jinja = true;

    if (!isNunjucks && modelTemplate) {
      // ③④: Pass user's custom Jinja template to override model built-in
      (cleanCompletionParams as any).chatTemplate = modelTemplate;
    }
    // ①②: No chatTemplate → native uses model's built-in Jinja template
    // ⑥: Nunjucks + multimodal → Nunjucks ignored, native uses built-in

    completionTransport = 'messages-api';
  }

  // 🔍 DIAGNOSTIC: Check if getFormattedChat properly renders thinking tokens
  // Compare what getFormattedChat produces vs what completion() will do internally
  if (context?.getFormattedChat && cleanCompletionParams.enable_thinking) {
    try {
      const diagResult = await (context as any).getFormattedChat(
        (cleanCompletionParams as any).messages,
        (cleanCompletionParams as any).chatTemplate || null,
        {
          jinja: true,
          enable_thinking: cleanCompletionParams.enable_thinking,
          reasoning_format: cleanCompletionParams.reasoning_format,
        },
      );
      const diagPrompt =
        typeof diagResult === 'string'
          ? diagResult
          : diagResult?.prompt || JSON.stringify(diagResult);
      engineInputLog('thinking-diagnostic', {
        requestId,
        getFormattedChatResultType: typeof diagResult,
        hasThinkTag: diagPrompt.includes('<think>'),
        hasEnableThinkingInTemplate: diagPrompt.includes('enable_thinking'),
        promptPreview: diagPrompt,
        promptLength: diagPrompt.length,
      });
    } catch (diagError) {
      engineInputLog('thinking-diagnostic-error', {
        requestId,
        error:
          diagError instanceof Error ? diagError.message : String(diagError),
      });
    }
  }

  // 类1: 引擎输入 — 实际发送给 llama.rn 的参数包
  engineInputLog('request', {
    requestId,
    completionTransport,
    model: {
      id: modelStore.activeModel?.id,
      name: modelStore.activeModel?.name,
    },
    input: {
      userMessageLength: message.text.length,
      imageCount: imageUris.length,
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
    template: {
      effectiveInterpreter: effectiveTemplateInterpreter,
      hasCustomTemplate: Boolean(!isNunjucks && modelTemplate),
      isNunjucksFallback: isNunjucks && hasImages,
      nunjucksRenderError,
    },
    probe: buildCompletionParamProbe(cleanCompletionParams as any),
  });

  // 类4: 参数来源 — thinkingAssembly 推导链
  paramSourceLog('thinkingAssembly', {requestId, thinkingAssembly});

  // 类3: Prompt 构建 — 模板来源信息
  promptBuildLog('prepareCompletion:params', {
    requestId,
    completionTransport,
    template: {
      selectedTemplateName: modelStore.activeModel?.chatTemplate?.name,
      effectiveTemplateInterpreter,
      modelTemplateFull: modelTemplate || '',
      contextTemplateFull: String(contextTemplate || ''),
      nunjucksRenderError,
    },
    systemMessages,
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
    let cancelNativeCallHeartbeats: () => void = () => undefined;

    try {
      // Track time to first token
      const completionStartTime = Date.now();
      let timeToFirstToken: number | null = null;
      let streamChunkCount = 0;
      let firstAnomalousChunkLogged = false;
      let nativeBridgeReturned = false;
      let firstNativeChunkSeen = false;
      let firstCallbackKeys: string[] = [];
      let firstTokenPreview = '';

      // State machine for real-time <think> tag parsing when RF is off.
      // When RF is on, llama.rn natively splits reasoning_content/content.
      // When RF is off, <think>...</think> is embedded in content stream.
      let thinkParseInBlock = false; // currently inside <think>...</think>
      let thinkParseDone = false; // </think> has been seen, now pure response
      let thinkParseBuffer = ''; // partial tag buffer for split-chunk detection
      let thinkParseAccumReasoning = ''; // accumulated reasoning for partial update

      cancelNativeCallHeartbeats = scheduleEngineOutputHeartbeats(
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
              firstCallbackKeys = Object.keys(data || {});
              firstTokenPreview = previewText((data as any)?.token, 120);
            }

            if (!modelStore.isStreaming) {
              modelStore.setIsStreaming(true);
            }

            // Use content and reasoning_content from the streaming data.
            // When RF is on, llama.rn natively splits them. When RF is off,
            // we parse <think>...</think> from the content stream in real-time.
            let {content = '', reasoning_content: reasoningContent} = data;
            if (!reasoningContent && content && !thinkParseDone) {
              // RF is off — run state machine on this chunk
              let chunk = thinkParseBuffer + content;
              thinkParseBuffer = '';
              let parsedReasoning = '';
              let parsedContent = '';
              let i = 0;
              while (i < chunk.length) {
                if (!thinkParseInBlock && !thinkParseDone) {
                  const openIdx = chunk.indexOf('<think>', i);
                  if (openIdx === i) {
                    thinkParseInBlock = true;
                    i += 7;
                  } else if (openIdx !== -1) {
                    parsedContent += chunk.slice(i, openIdx);
                    thinkParseInBlock = true;
                    i = openIdx + 7;
                  } else {
                    // Check if chunk ends with a partial '<think>' prefix
                    const tag = '<think>';
                    let overlap = 0;
                    for (let k = 1; k < tag.length; k++) {
                      if (chunk.endsWith(tag.slice(0, k))) {
                        overlap = k;
                      }
                    }
                    if (overlap > 0) {
                      parsedContent += chunk.slice(i, chunk.length - overlap);
                      thinkParseBuffer = chunk.slice(chunk.length - overlap);
                    } else {
                      parsedContent += chunk.slice(i);
                    }
                    break;
                  }
                } else if (thinkParseInBlock) {
                  const closeIdx = chunk.indexOf('</think>', i);
                  if (closeIdx !== -1) {
                    parsedReasoning += chunk.slice(i, closeIdx);
                    thinkParseInBlock = false;
                    thinkParseDone = true;
                    i = closeIdx + 8;
                  } else {
                    // Check for partial '</think>' at end
                    const tag = '</think>';
                    let overlap = 0;
                    for (let k = 1; k < tag.length; k++) {
                      if (chunk.endsWith(tag.slice(0, k))) {
                        overlap = k;
                      }
                    }
                    if (overlap > 0) {
                      parsedReasoning += chunk.slice(i, chunk.length - overlap);
                      thinkParseBuffer = chunk.slice(chunk.length - overlap);
                    } else {
                      parsedReasoning += chunk.slice(i);
                    }
                    break;
                  }
                } else {
                  // thinkParseDone — rest is pure response
                  parsedContent += chunk.slice(i);
                  break;
                }
              }
              if (parsedReasoning) {
                thinkParseAccumReasoning += parsedReasoning;
              }
              content = parsedContent;
              reasoningContent = thinkParseAccumReasoning || undefined;
            }

            if (content || reasoningContent) {
              streamChunkCount += 1;
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
                engineOutputLog('completion:anomalous-chunk', {
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

      // Register the promise so releaseContext can wait for it
      modelStore.registerCompletionPromise(completionPromise);

      // Await the completion
      const result = await completionPromise;
      completionSettled = true;
      cancelNativeCallHeartbeats();

      // Clear the promise after completion finishes
      modelStore.clearCompletionPromise();

      // 类2: 引擎输出 — 完成结果与性能数据
      engineOutputLog('completion:result', {
        requestId,
        timings: result.timings,
        time_to_first_token_ms: timeToFirstToken,
        streamChunkCount,
        firstCallbackKeys,
        firstTokenPreview,
        finalTextDiag: getTextDiagnostics(result.text),
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
            // Save the final completion result with reasoning_content.
            // Parse </think> tag: model always embeds <think>...</think> in result.text.
            // Strip it out so displayed content is clean, and use it as reasoning_content
            // when RF is off (result.reasoning_content is empty). Also prevents OOM crash
            // when RF is on and result.text === result.reasoning_content (identical content).
            completionResult: (() => {
              const thinkEnd = result.text.indexOf('</think>');
              if (thinkEnd !== -1) {
                const thinkStart = result.text.indexOf('<think>');
                const thinkContent =
                  thinkStart !== -1
                    ? result.text.slice(thinkStart + 7, thinkEnd)
                    : result.text.slice(0, thinkEnd);
                const cleanText = result.text.slice(thinkEnd + 8).trimStart();
                return {
                  reasoning_content: result.reasoning_content || thinkContent,
                  content: cleanText,
                };
              }
              return {
                reasoning_content: result.reasoning_content,
                content: result.text,
              };
            })(),
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
      engineOutputLog('completion:error', {
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
