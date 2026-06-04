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
import {t} from '../locales';
import {hasEnoughMemoryWithNCtx} from './useMemoryCheck';
import {usePalLoadHint} from './usePalLoadHint';

const formatKLabel = (tokens: number): string => {
  const k = tokens / 1024;
  return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
};

interface UseContextBannerArgs {
  activePal: Pal | undefined;
  htmlPreviewCount: number;
  messages: MessageType.Any[];
  l10n: any;
}

type ReloadPhase = 'reloading' | 'success' | 'failure';

interface ReloadSnackbarState {
  message: string;
  visible: boolean;
  duration?: number;
  phase: ReloadPhase;
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
  const pendingOverride = chatSessionStore.pendingContextOverride;
  const activeModel = modelStore.activeModel;
  // The banner reflects the LIVE LlamaContext, not Settings. Reading
  // `contextInitParams.n_ctx` would misreport whenever the user
  // changed Settings without reloading (e.g. raised 2048 → 8192
  // before tapping reload — banner would dilute the ratio and stay
  // silent at the real cap). `activeContextSettings` is the n_ctx
  // the running context was actually loaded with; falls back to
  // configured only when no context is live yet.
  const loadedCtx = modelStore.activeContextSettings;
  const loadedNCtx = loadedCtx?.n_ctx ?? modelStore.contextInitParams.n_ctx;
  const effectiveNCtxForSession = effectiveNCtx(
    sessionOverrides,
    activeSessionId,
    loadedNCtx,
    pendingOverride,
    loadedNCtx,
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

  // Without an active LlamaContext, banner variants are inactionable:
  // the user can't increase context, the snapshot (potentially
  // hydrated from session metadata) is stale relative to whatever
  // model loads next, and the existing "Increase context" /
  // "New chat" controls would target nothing. Suppress to 'none'
  // and let model-load surfaces drive the user back to a working
  // state. Remote sessions don't need a local LlamaContext, so we
  // leave them alone.
  const hasLoadedContext = !!loadedCtx;
  // Direct call — resolveBannerVariant is pure and cheap. useMemo with
  // a MobX-wrapped Set as a dep doesn't recompute on dismiss because the
  // set's reference is stable across .add()/.delete() mutations.
  const bannerVariant: BannerVariant =
    hasLoadedContext || isRemoteSession
      ? resolveBannerVariant({
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
        })
      : {kind: 'none'};

  const [increaseSheetVisible, setIncreaseSheetVisible] = React.useState(false);
  const [isReloading, setIsReloading] = React.useState(false);
  const [reloadSnackbar, setReloadSnackbar] =
    React.useState<ReloadSnackbarState | null>(null);

  // One-shot per (palId, n_ctx) per session. Declared before the
  // confirm-increase callback so the latter can synchronously dismiss
  // the hint to preserve the single-surface invariant.
  const palLoadHint = usePalLoadHint(activePal);

  const handleDismissBanner = React.useCallback(
    (kind: BannerVariant['kind']) => {
      if (!activeSessionId) {
        return;
      }
      chatSessionStore.setBannerDismissed(activeSessionId, kind);
    },
    [activeSessionId],
  );

  const handleConfirmIncrease = React.useCallback(
    async (target: number) => {
      if (!activeModel || !Number.isFinite(target)) {
        return;
      }
      // Defense-in-depth: reachable via the pal-load-hint snackbar even
      // when the in-banner button is disabled.
      if (chatSessionStore.isGenerating || chatSessionStore.isStopping) {
        return;
      }
      // No-session branch: stage the override on the pending slot so
      // the next initContext picks it up; `createNewSession` will copy
      // it onto the new id. Session branch: write directly to the
      // session-keyed Map.
      const isNoSession = !activeSessionId;
      const priorSessionOverride = activeSessionId
        ? sessionOverrides.get(activeSessionId)
        : undefined;
      const priorPending = chatSessionStore.pendingContextOverride;
      if (isNoSession) {
        chatSessionStore.setPendingContextOverride(target);
      } else {
        chatSessionStore.setSessionContextOverride(activeSessionId, target);
      }
      // Single-surface invariant: dismiss the pal-load hint snackbar
      // synchronously (batched with the reload setter) so we never
      // commit a frame with two coexisting snackbars.
      palLoadHint.dismiss();
      setIsReloading(true);
      setReloadSnackbar({
        message: l10n.chat.contextWarning.reloadingSubcopy,
        visible: true,
        // RNP Snackbar treats only Infinity as indefinite; large finite
        // values overflow setTimeout and fire immediately.
        duration: Infinity,
        phase: 'reloading',
      });
      setIncreaseSheetVisible(false);
      try {
        await modelStore.releaseContext();
        await modelStore.initContext(activeModel);
        const sizeLabel = formatKLabel(target);
        const palName = activePal?.name;
        const successMsg = palName
          ? t(l10n.chat.contextWarning.sheet.successSnackbar, {
              size: sizeLabel,
              palName,
            })
          : t(l10n.chat.contextWarning.sheet.successSnackbarNoPal, {
              size: sizeLabel,
            });
        setReloadSnackbar({
          message: successMsg,
          visible: true,
          phase: 'success',
        });
      } catch (err) {
        if (isNoSession) {
          if (priorPending === undefined) {
            chatSessionStore.clearPendingContextOverride();
          } else {
            chatSessionStore.setPendingContextOverride(priorPending);
          }
        } else if (priorSessionOverride === undefined) {
          chatSessionStore.clearSessionContextOverride(activeSessionId);
        } else {
          chatSessionStore.setSessionContextOverride(
            activeSessionId,
            priorSessionOverride,
          );
        }
        console.warn('[ChatView] increase context failed:', err);
        setReloadSnackbar({
          message: l10n.chat.contextWarning.sheet.failureSnackbar,
          visible: true,
          phase: 'failure',
        });
      } finally {
        setIsReloading(false);
      }
    },
    [
      activeSessionId,
      activeModel,
      activePal,
      sessionOverrides,
      l10n,
      palLoadHint,
    ],
  );

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
