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
    const {cleanCompletionParams, messageInfo} = await prepareCompletion({
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

    try {
      // Track time to first token
      const completionStartTime = Date.now();
      let timeToFirstToken: number | null = null;

      const result = await context.completion(cleanCompletionParams, data => {
        if (currentMessageInfo.current) {
          // Capture time to first token on the first token received
          if (timeToFirstToken === null && (data.token || data.content)) {
            timeToFirstToken = Date.now() - completionStartTime;
          }

          if (!modelStore.isStreaming) {
            modelStore.setIsStreaming(true);
          }

          // Use content and reasoning_content from the streaming data
          // llama.rn already separates these for us when enable_thinking is true
          const {content = '', reasoning_content: reasoningContent} = data;

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
      });

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
          },
        },
      );
      modelStore.setInferencing(false);
      modelStore.setIsStreaming(false);
      chatSessionStore.setIsGenerating(false);
    } catch (error) {
      console.error('Completion error:', error);
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
