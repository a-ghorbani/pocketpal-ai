import {useCallback} from 'react';

import Clipboard from '@react-native-clipboard/clipboard';

import {chatSessionStore, modelStore} from '../store';

import {derivedText} from '../utils/chat';
import {MessageType, User} from '../utils/types';

/**
 * Either a legacy `Text` message or an `AssistantTurn` row. Used by
 * Copy / TryAgain handlers — both shapes are first-class. Edit is
 * gated to `Text` only inside `handleEdit` (the single source of truth
 * for "edit disallowed on assistant_turn").
 */
type CopyableMessage = MessageType.Text | MessageType.AssistantTurn;

interface UseMessageActionsProps {
  user: User;
  messages: MessageType.Any[];
  handleSendPress: (message: MessageType.PartialText) => Promise<void>;
  setInputText?: (text: string) => void;
  setInputImages?: (images: string[]) => void;
}

export const useMessageActions = ({
  user,
  messages,
  handleSendPress,
  setInputText,
  setInputImages,
}: UseMessageActionsProps) => {
  const handleCopy = useCallback((message: CopyableMessage) => {
    if (message.type !== 'text' && message.type !== 'assistant_turn') {
      return;
    }
    Clipboard.setString(derivedText(message).trim());
  }, []);

  const handleEdit = useCallback(
    async (message: CopyableMessage) => {
      // Edit is intentionally disallowed on assistant_turn — this is
      // the single source of truth (no store-level guard).
      if (message.type !== 'text' || message.author.id !== user.id) {
        return;
      }

      // Enter edit mode and set input text and images
      chatSessionStore.enterEditMode(message.id);
      setInputText?.(message.text);
      setInputImages?.(message.imageUris || []);
    },
    [setInputText, setInputImages, user.id],
  );

  const handleTryAgain = useCallback(
    async (message: CopyableMessage) => {
      if (message.type !== 'text' && message.type !== 'assistant_turn') {
        return;
      }

      // If it's the user's message (only Text rows can be authored by
      // the user), resubmit it.
      if (message.type === 'text' && message.author.id === user.id) {
        const messageText = message.text;
        const relatedImages = message.imageUris;

        await chatSessionStore.removeMessagesFromId(message.id, true);
        await handleSendPress({
          text: messageText,
          type: 'text',
          imageUris:
            relatedImages && relatedImages.length > 0
              ? relatedImages
              : undefined,
        });
        return;
      }

      // Assistant message (Text or AssistantTurn) — find and resubmit
      // the last user message. The walk-back logic is index-based and
      // doesn't depend on assistant text content, so AssistantTurn
      // rows behave identically to legacy Text rows here.
      const messageIndex = messages.findIndex(msg => msg.id === message.id);
      const previousMessage = messages
        .slice(messageIndex + 1)
        .find(msg => msg.author.id === user.id && msg.type === 'text') as
        | MessageType.Text
        | undefined;

      if (previousMessage && previousMessage.text) {
        const messageText = previousMessage.text;
        const relatedImages = previousMessage.imageUris;
        await chatSessionStore.removeMessagesFromId(previousMessage.id, true);
        await handleSendPress({
          text: messageText,
          type: 'text',
          imageUris:
            relatedImages && relatedImages.length > 0
              ? relatedImages
              : undefined,
        });
      }
    },
    [messages, handleSendPress, user.id],
  );

  const handleTryAgainWith = useCallback(
    async (modelId: string, message: CopyableMessage) => {
      if (modelId === modelStore.activeModelId) {
        await handleTryAgain(message);
        return;
      }
      const model = modelStore.availableModels.find(m => m.id === modelId);
      if (model) {
        await modelStore.selectModel(model);
        await handleTryAgain(message);
      }
    },
    [handleTryAgain],
  );

  return {
    handleCopy,
    handleEdit,
    handleTryAgain,
    handleTryAgainWith,
  };
};
