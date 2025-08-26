import React, {useRef, useCallback} from 'react';

import {toJS} from 'mobx';

import {chatSessionRepository} from '../repositories/ChatSessionRepository';

import {randId} from '../utils';
import {L10nContext} from '../utils';
import {chatSessionStore, modelStore, palStore, uiStore} from '../store';
import {createMultimodalWarning} from '../utils/errors';

import {MessageType, User} from '../utils/types';
import {activateKeepAwake, deactivateKeepAwake} from '../utils/keepAwake';
import {convertToChatMessages, removeThinkingParts} from '../utils/chat';
import {
  toApiCompletionParams,
  CompletionParams,
} from '../utils/completionTypes';

// Helper function to prepare completion parameters using OpenAI-compatible messages API
const prepareCompletion = async ({
  imageUris,
  message,
  getSystemMessage,
  activeSession,
  context,
  assistant,
  conversationIdRef,
  isMultimodalEnabled,
  l10n,
  currentMessages,
}: {
  imageUris: string[];
  message: MessageType.PartialText;
  getSystemMessage: () => any[];
  activeSession: any;
  context: any;
  assistant: User;
  conversationIdRef: string;
  isMultimodalEnabled: boolean;
  l10n: any;
  currentMessages: MessageType.Any[];
}) => {
  const sessionCompletionSettings = toJS(activeSession?.completionSettings);
  const stopWords = toJS(modelStore.activeModel?.stopWords);

  // Create user message content - always start with text
  const userMessageContent: any[] = [
    {
      type: 'text',
      text: message.text,
    },
  ];

  // Check if we have images and if multimodal is enabled
  const hasImages = imageUris && imageUris.length > 0;

  // Add images only if multimodal is enabled
  // If images exist but multimodal is not enabled, show warning but don't send images to API
  if (hasImages && isMultimodalEnabled) {
    userMessageContent.push(
      ...imageUris.map(path => ({
        type: 'image_url',
        image_url: {url: path}, // llama.rn handles file:// prefix removal
      })),
    );
  } else if (hasImages && !isMultimodalEnabled) {
    // Show warning for multimodal not enabled
    uiStore.setChatWarning(
      createMultimodalWarning(l10n.chat.multimodalNotEnabled),
    );
  }

  // Get system messages and convert chat session messages to llama.rn format
  const systemMessages = getSystemMessage();
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

  // Create message record in database
  const createdAt = Date.now();
  const newMessage = await chatSessionRepository.addMessageToSession(
    chatSessionStore.activeSessionId!,
    {
      author: assistant,
      createdAt: createdAt,
      id: '',
      text: '',
      type: 'text',
      metadata: {
        contextId: context.id,
        conversationId: conversationIdRef,
        copyable: true,
        multimodal: hasImages, // Simple check based on presence of images
      },
    },
  );

  const messageInfo = {
    createdAt,
    id: newMessage.id,
    sessionId: chatSessionStore.activeSessionId!,
  };

  return {cleanCompletionParams, messageInfo};
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

  // Time-based batch processing
  // Token queue for accumulating tokens
  const tokenQueue = useRef<
    Array<{token: string; createdAt: number; id: string; sessionId: string}>
  >([]);
  const isProcessingTokens = useRef(false);
  const isMounted = useRef(true); // we use Drawer.Navigator, so the screen won't unmount. Not sure how useful this is.
  const batchTimer = useRef<NodeJS.Timeout | null>(null);
  const batchTimeout = 100; // Process batch every 100ms

  // Process all accumulated tokens in a batch
  const processTokenBatch = useCallback(async () => {
    if (isProcessingTokens.current || tokenQueue.current.length === 0) {
      return;
    }

    isProcessingTokens.current = true;
    batchTimer.current = null;

    try {
      // Take all accumulated tokens
      const tokensToProcess = [...tokenQueue.current];
      tokenQueue.current = [];
      const context = modelStore.context;

      if (context && tokensToProcess.length > 0) {
        // Group tokens by message ID
        const messageUpdates: Record<string, string> = {};

        tokensToProcess.forEach(({token, id}) => {
          messageUpdates[id] = (messageUpdates[id] || '') + token;
        });

        // Update each message in a single operation
        for (const [id, combinedToken] of Object.entries(messageUpdates)) {
          try {
            await chatSessionStore.updateMessageToken(
              {token: combinedToken},
              tokensToProcess[0].createdAt, // Use first token's timestamp
              id,
              tokensToProcess[0].sessionId, // Use first token's session
              context,
            );
          } catch (error) {
            console.error('Error updating message token batch:', error);
          }
        }
      }
    } finally {
      isProcessingTokens.current = false;

      // Schedule next batch if there are new tokens
      if (tokenQueue.current.length > 0) {
        if (isMounted.current) {
          // Normal case - component is mounted, schedule next batch
          if (!batchTimer.current) {
            batchTimer.current = setTimeout(processTokenBatch, batchTimeout);
          }
        } else {
          // Component is unmounted but we still have tokens - process immediately
          // This ensures all tokens are saved even after navigation
          processTokenBatch();
        }
      }
    }
  }, [batchTimeout]);

  // Add token to queue and schedule processing
  const queueToken = useCallback(
    (token: string, createdAt: number, id: string, sessionId: string) => {
      // Add token to queue
      tokenQueue.current.push({token, createdAt, id, sessionId});

      // Schedule processing if not already scheduled
      if (!batchTimer.current && isMounted.current) {
        batchTimer.current = setTimeout(processTokenBatch, batchTimeout);
      }
    },
    [processTokenBatch, batchTimeout],
  );

  // Cleanup on unmount
  // In Drawer.Navigator, the screen won't unmount. Not sure how useful this is.
  React.useEffect(() => {
    isMounted.current = true;
    return () => {
      // Process any remaining tokens immediately instead of waiting for the timer
      if (tokenQueue.current.length > 0 && !isProcessingTokens.current) {
        // Force process the remaining tokens
        processTokenBatch();
      }

      // After a short delay to allow processing to complete, clean up
      setTimeout(() => {
        isMounted.current = false;
        // Clear any pending timer
        if (batchTimer.current) {
          clearTimeout(batchTimer.current);
          batchTimer.current = null;
        }
      }, 500); // Give 500ms for processing to complete
    };
  }, [processTokenBatch]);

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
    // Extract imageUris from the message object
    const imageUris = message.imageUris;
    const context = modelStore.context;
    if (!context) {
      await addSystemMessage(l10n.chat.modelNotLoaded);
      return;
    }

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
    let systemPrompt = '';
    if (activeSession?.activePalId) {
      const pal = palStore.pals.find(p => p.id === activeSession.activePalId);
      if (pal?.systemPrompt) {
        systemPrompt = pal.systemPrompt;
      }
    }

    const getSystemMessage = () => {
      // If no system prompt is available at all, return empty array
      if (
        !systemPrompt &&
        !modelStore.activeModel?.chatTemplate?.systemPrompt?.trim()
      ) {
        return [];
      }

      // Prefer custom system prompt, fall back to template's system prompt
      const finalSystemPrompt =
        systemPrompt ||
        modelStore.activeModel?.chatTemplate?.systemPrompt ||
        '';

      if (finalSystemPrompt?.trim() === '') {
        return [];
      }
      return [
        {
          role: 'system' as 'system',
          content: finalSystemPrompt,
        },
      ];
    };

    // Prepare completion parameters and create message record
    const {cleanCompletionParams, messageInfo} = await prepareCompletion({
      imageUris: imageUris || [],
      message,
      getSystemMessage,
      activeSession,
      context,
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

      const result = await context.completion(cleanCompletionParams, data => {
        if (data.token && currentMessageInfo.current) {
          // Capture time to first token on the first token received
          if (timeToFirstToken === null) {
            timeToFirstToken = Date.now() - completionStartTime;
          }

          if (!modelStore.isStreaming) {
            modelStore.setIsStreaming(true);
          }

          // Queue each token individually for processing
          queueToken(
            data.token,
            currentMessageInfo.current.createdAt,
            currentMessageInfo.current.id,
            currentMessageInfo.current.sessionId,
          );
        }
      });

      // Log completion result with time to first token for debugging
      if (__DEV__) {
        console.log('Completion result:', {
          ...result.timings,
          time_to_first_token_ms: timeToFirstToken,
        });
      }

      // No need to flush remaining tokens as each token is processed individually
      // Just wait for the queue to finish processing
      while (tokenQueue.current.length > 0 || isProcessingTokens.current) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Update only the metadata in the database
      // The text is already being updated with each token
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
          },
        },
      );
      modelStore.setInferencing(false);
      modelStore.setIsStreaming(false);
      chatSessionStore.setIsGenerating(false);
    } catch (error) {
      modelStore.setInferencing(false);
      modelStore.setIsStreaming(false);
      chatSessionStore.setIsGenerating(false);
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
    // Wait for any queued tokens to finish processing
    if (tokenQueue.current.length > 0 || isProcessingTokens.current) {
      try {
        // Wait for the queue to finish processing
        while (tokenQueue.current.length > 0 || isProcessingTokens.current) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch (error) {
        console.error('Error when stopping completion:', error);
      }
    }
    modelStore.setInferencing(false);
    modelStore.setIsStreaming(false);
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
