import * as React from 'react';

import {chatSessionStore, modelStore} from '../store';
import {Pal} from '../types/pal';
import {MessageType, ModelOrigin} from '../utils/types';
import {
  effectiveNCtx,
  pickNextTier,
  resolveBannerVariant,
  type BannerVariant,
} from '../utils/bannerVariantResolver';
import {derivedText} from '../utils/chat';
import {hasEnoughMemoryWithNCtx} from './useMemoryCheck';
import {usePalLoadHint} from './usePalLoadHint';

interface UseContextBannerArgs {
  activePal: Pal | undefined;
  htmlPreviewCount: number;
  messages: MessageType.Any[];
  l10n: any;
}

interface ReloadSnackbarState {
  message: string;
  visible: boolean;
  duration?: number;
}

/**
 * Owns the per-session context-warning banner: snapshot reads, the
 * memory-aware next-tier probe, dismiss/increase/new-chat handlers, the
 * reload snackbar, and the pal-load hint passthrough. ChatView calls
 * this once and wires the returned bundle into the JSX surface.
 */
export const useContextBanner = ({
  activePal,
  htmlPreviewCount,
  messages,
  l10n,
}: UseContextBannerArgs) => {
  const snap = chatSessionStore.lastCompletionResult;
  const dismissedKeys = chatSessionStore.dismissedBannerVariants;
  const consecutiveFullFailures = chatSessionStore.consecutiveFullFailures;
  const activeSessionId = chatSessionStore.activeSessionId;
  const sessionOverrides = chatSessionStore.sessionContextOverrides;
  const activeModel = modelStore.activeModel;
  const baseNCtx = modelStore.contextInitParams.n_ctx;
  const effectiveNCtxForSession = effectiveNCtx(
    sessionOverrides,
    activeSessionId,
    baseNCtx,
  );
  const isRemoteSession = activeModel?.origin === ModelOrigin.REMOTE;
  const isRunActive =
    chatSessionStore.isGenerating || chatSessionStore.isStopping;

  const [nextTierTokens, setNextTierTokens] = React.useState<number | null>(
    null,
  );
  React.useEffect(() => {
    let cancelled = false;
    if (!activeModel || isRemoteSession) {
      setNextTierTokens(null);
      return () => {
        cancelled = true;
      };
    }
    pickNextTier(effectiveNCtxForSession, n =>
      hasEnoughMemoryWithNCtx(activeModel, n),
    )
      .then(tier => {
        if (!cancelled) {
          setNextTierTokens(tier);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNextTierTokens(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeModel, isRemoteSession, effectiveNCtxForSession]);

  const lastAssistantMsg = React.useMemo(
    () =>
      messages.find(m => m.type === 'assistant_turn' || m.type === 'text') as
        | MessageType.Any
        | undefined,
    [messages],
  );
  const lastAssistantText = lastAssistantMsg
    ? derivedText(lastAssistantMsg)
    : '';
  const lastAssistantTurn =
    lastAssistantMsg?.type === 'assistant_turn'
      ? (lastAssistantMsg as MessageType.AssistantTurn)
      : undefined;

  const bannerVariant: BannerVariant = React.useMemo(
    () =>
      resolveBannerVariant({
        snapshot: snap,
        effectiveNCtx: effectiveNCtxForSession,
        isRemote: !!isRemoteSession,
        htmlPreviewCount,
        consecutiveFullFailures,
        dismissedKeys,
        sessionId: activeSessionId,
        nextTierTokens,
        lastAssistantText,
        lastAssistantTurn,
      }),
    [
      snap,
      effectiveNCtxForSession,
      isRemoteSession,
      htmlPreviewCount,
      consecutiveFullFailures,
      dismissedKeys,
      activeSessionId,
      nextTierTokens,
      lastAssistantText,
      lastAssistantTurn,
    ],
  );

  const [increaseSheetVisible, setIncreaseSheetVisible] = React.useState(false);
  const [isReloading, setIsReloading] = React.useState(false);
  const [reloadSnackbar, setReloadSnackbar] =
    React.useState<ReloadSnackbarState | null>(null);

  const handleDismissBanner = React.useCallback(
    (kind: BannerVariant['kind']) => {
      if (!activeSessionId) {
        return;
      }
      chatSessionStore.setBannerDismissed(activeSessionId, kind);
    },
    [activeSessionId],
  );

  const handleConfirmIncrease = React.useCallback(async () => {
    if (!activeSessionId || !activeModel || nextTierTokens === null) {
      return;
    }
    const target = nextTierTokens;
    const priorOverride = sessionOverrides.get(activeSessionId);
    chatSessionStore.setSessionContextOverride(activeSessionId, target);
    setIsReloading(true);
    setReloadSnackbar({
      message: l10n.chat.contextWarning.reloadingSubcopy,
      visible: true,
      // Stay visible until success / failure dismisses it explicitly.
      duration: Number.MAX_SAFE_INTEGER,
    });
    setIncreaseSheetVisible(false);
    try {
      await modelStore.releaseContext();
      await modelStore.initContext(activeModel);
      setReloadSnackbar({
        message: l10n.chat.contextWarning.sheet.successSnackbar,
        visible: true,
      });
    } catch (err) {
      if (priorOverride === undefined) {
        chatSessionStore.clearSessionContextOverride(activeSessionId);
      } else {
        chatSessionStore.setSessionContextOverride(
          activeSessionId,
          priorOverride,
        );
      }
      console.warn('[ChatView] increase context failed:', err);
      setReloadSnackbar({
        message: l10n.chat.contextWarning.sheet.failureSnackbar,
        visible: true,
      });
    } finally {
      setIsReloading(false);
    }
  }, [activeSessionId, activeModel, nextTierTokens, sessionOverrides, l10n]);

  const handleNewChat = React.useCallback(() => {
    chatSessionStore.resetActiveSession();
  }, []);

  const handleIncrease = React.useCallback(() => {
    setIncreaseSheetVisible(true);
  }, []);

  const handleCloseIncreaseSheet = React.useCallback(() => {
    setIncreaseSheetVisible(false);
  }, []);

  const dismissReloadSnackbar = React.useCallback(() => {
    setReloadSnackbar(prev => (prev ? {...prev, visible: false} : null));
  }, []);

  // One-shot per (palId, n_ctx) per session.
  // Lives on the snackbar surface so the one-banner invariant is preserved.
  const palLoadHint = usePalLoadHint(activePal);
  const handlePalLoadHintAction = React.useCallback(async () => {
    const action = await palLoadHint.onAction();
    if (action === 'increase') {
      setIncreaseSheetVisible(true);
    } else if (action === 'newChat') {
      chatSessionStore.resetActiveSession();
    }
  }, [palLoadHint]);

  return {
    bannerVariant,
    isRunActive,
    activeModel,
    effectiveNCtxForSession,
    nextTierTokens,
    increaseSheetVisible,
    isReloading,
    reloadSnackbar,
    handleIncrease,
    handleCloseIncreaseSheet,
    handleConfirmIncrease,
    handleDismissBanner,
    handleNewChat,
    dismissReloadSnackbar,
    palLoadHint,
    handlePalLoadHintAction,
  };
};
