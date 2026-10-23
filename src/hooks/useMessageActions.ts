import {useCallback} from 'react';

import Clipboard from '@react-native-clipboard/clipboard';

import {chatSessionStore, modelStore} from '../store';

import {derivedText} from '../utils/chat';
import {MessageType, User} from '../utils/types';
import {hasDocuments} from '../services/documents/budget';
import type {BudgetVerdict} from '../services/documents/plan';
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
  /**
   * Sends an existing row again in place of `replaceFromId` and the rows
   * after it; it must not touch the composer.
   */
  resendPress: (
    message: MessageType.PartialText,
    replaceFromId: string,
  ) => Promise<void>;
  setInputText?: (text: string) => void;
  setInputImages?: (images: string[]) => void;
  setInputDocuments?: (documents: DocumentRef[]) => void;
  evaluateSendBudget?: EvaluateSendBudget;
  /** The resend no longer fits; the caller puts `row` in edit mode. */
  onBudgetOver?: (
    verdict: Extract<BudgetVerdict, {kind: 'over'}>,
    row: MessageType.Text,
  ) => void;
}

export const useMessageActions = ({
  user,
  messages,
  resendPress,
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
      if (chatSessionStore.isStopping) {
        return;
      }
      const message: MessageType.PartialText = {
        text: row.text,
        type: 'text',
        imageUris: row.imageUris?.length ? row.imageUris : undefined,
        documents: row.documents?.length ? row.documents : undefined,
      };
      const gated = !!evaluateSendBudget && hasDocuments(messages, message);
      const documentIds = (row.documents ?? []).map(ref => ref.id);
      const sessionId = chatSessionStore.activeSessionId;
      holdForSend(documentIds);
      try {
        if (gated) {
          const {verdict} = await evaluateSendBudget(message, {
            excludeFromId: row.id,
          });
          if (sessionId !== chatSessionStore.activeSessionId) {
            return;
          }
          if (verdict.kind === 'over') {
            onBudgetOver?.(verdict, row);
            return;
          }
        }
        if (chatSessionStore.isStopping) {
          return;
        }
        await resendPress(message, row.id);
      } finally {
        releaseSendHold(documentIds);
      }
    },
    [messages, evaluateSendBudget, onBudgetOver, resendPress],
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
