import {useCallback} from 'react';

import Clipboard from '@react-native-clipboard/clipboard';

import {chatSessionStore, modelStore} from '../store';

import {derivedText} from '../utils/chat';
import {MessageType, User} from '../utils/types';
import {hasDocuments, type BudgetVerdict} from '../services/documents/budget';
import {holdForSend, releaseSendHold} from '../services/documents/store';
import type {DocumentRef} from '../services/documents/types';
import type {EvaluateSendBudget} from './useChatSession';

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
  handleSendPress: (
    message: MessageType.PartialText,
    options?: {preChecked?: boolean},
  ) => Promise<void>;
  setInputText?: (text: string) => void;
  setInputImages?: (images: string[]) => void;
  setInputDocuments?: (documents: DocumentRef[]) => void;
  evaluateSendBudget?: EvaluateSendBudget;
  onBudgetOver?: (verdict: Extract<BudgetVerdict, {kind: 'over'}>) => void;
}

export const useMessageActions = ({
  user,
  messages,
  handleSendPress,
  setInputText,
  setInputImages,
  setInputDocuments,
  evaluateSendBudget,
  onBudgetOver,
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
      setInputDocuments?.(message.documents ?? []);
    },
    [setInputText, setInputImages, setInputDocuments, user.id],
  );

  /** Resends a user row. A row whose documents no longer fit is never
   * removed; it opens in edit mode instead. */
  const resend = useCallback(
    async (row: MessageType.Text) => {
      const message: MessageType.PartialText = {
        text: row.text,
        type: 'text',
        imageUris: row.imageUris?.length ? row.imageUris : undefined,
        documents: row.documents?.length ? row.documents : undefined,
      };
      const gated = !!evaluateSendBudget && hasDocuments(messages, message);
      const documentIds = (row.documents ?? []).map(ref => ref.id);
      holdForSend(documentIds);
      try {
        if (gated) {
          const verdict = await evaluateSendBudget(message, {
            excludeFromId: row.id,
          });
          if (verdict.kind === 'over') {
            await handleEdit(row);
            onBudgetOver?.(verdict);
            return;
          }
        }
        await chatSessionStore.removeMessagesFromId(row.id, true);
        await (gated
          ? handleSendPress(message, {preChecked: true})
          : handleSendPress(message));
      } finally {
        releaseSendHold(documentIds);
      }
    },
    [messages, evaluateSendBudget, handleEdit, onBudgetOver, handleSendPress],
  );

  const handleTryAgain = useCallback(
    async (message: CopyableMessage) => {
      if (message.type !== 'text' && message.type !== 'assistant_turn') {
        return;
      }

      // If it's the user's message (only Text rows can be authored by
      // the user), resubmit it.
      if (message.type === 'text' && message.author.id === user.id) {
        await resend(message);
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
        await resend(previousMessage);
      }
    },
    [messages, resend, user.id],
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
