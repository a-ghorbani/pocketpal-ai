import * as React from 'react';

import {chatSessionStore, modelStore} from '../store';
import {Pal} from '../types/pal';
import {MessageType, ModelOrigin} from '../utils/types';
import {
  runtimeNCtxFor,
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

interface SilentRevertSnackbarState {
  message: string;
  visible: boolean;
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
  // The banner reflects the running LlamaContext, not Settings.
  // `runtimeNCtx` is undefined when no context is loaded; we fall
  // back to configured only as a placeholder for the no-context
  // case (the resolver suppresses context-* variants anyway via
  // `hasLoadedContext`, so the value here is just for the slot).
  const runtimeNCtx =
    modelStore.runtimeNCtx ?? modelStore.contextInitParams.n_ctx;
  const effectiveNCtxForSession = runtimeNCtxFor(
    sessionOverrides,
    activeSessionId,
    runtimeNCtx,
    pendingOverride,
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
  // The remote weak-signal heuristic walks the assistant text to
  // check its terminator and length — pure derivation over the
  // memoised lastAssistantMsg. Memoise so streaming tokens (~33×/s)
  // don't re-allocate the joined string on every render.
  const lastAssistantText = React.useMemo(
    () => (lastAssistantMsg ? derivedText(lastAssistantMsg) : ''),
    [lastAssistantMsg],
  );
  const lastAssistantTurn =
    lastAssistantMsg?.type === 'assistant_turn'
      ? (lastAssistantMsg as MessageType.AssistantTurn)
      : undefined;

  const hasLoadedContext = modelStore.runtimeNCtx !== undefined;
  // Direct call — resolveBannerVariant is pure and cheap. useMemo with
  // a MobX-wrapped Set as a dep doesn't recompute on dismiss because the
  // set's reference is stable across .add()/.delete() mutations. The
  // resolver itself suppresses context-* variants when no LlamaContext
  // is loaded; html-soft-cap remains independent.
  const bannerVariant: BannerVariant = resolveBannerVariant({
    snapshot: snap,
    effectiveNCtx: effectiveNCtxForSession,
    isRemote: !!isRemoteSession,
    hasLoadedContext,
    htmlPreviewCount,
    consecutiveFullFailures,
    dismissedKeys,
    sessionId: activeSessionId,
    nextTierTokens,
    lastAssistantText,
    lastAssistantTurn,
  });

  const [increaseSheetVisible, setIncreaseSheetVisible] = React.useState(false);
  const [isReloading, setIsReloading] = React.useState(false);
  const [reloadSnackbar, setReloadSnackbar] =
    React.useState<ReloadSnackbarState | null>(null);
  const [silentRevertSnackbar, setSilentRevertSnackbar] =
    React.useState<SilentRevertSnackbarState | null>(null);

  // Silent-revert advisory: a previously confirmed session
  // override outlives the LlamaContext (e.g. OS evict +
  // auto-reload while activeSessionId was null), so the user
  // lands back in the session with override > loaded. The
  // resolver already caps the banner at the smaller real
  // capacity; this snackbar tells the user their saved larger
  // context was downgraded — one-shot per (sessionId, current
  // loaded n_ctx).
  const loadedRuntimeNCtx = modelStore.runtimeNCtx;
  const sessionOverrideForActive = activeSessionId
    ? sessionOverrides.get(activeSessionId)
    : undefined;
  const silentRevertDetected =
    !!activeSessionId &&
    loadedRuntimeNCtx !== undefined &&
    sessionOverrideForActive !== undefined &&
    sessionOverrideForActive > loadedRuntimeNCtx;
  const silentRevertKey =
    activeSessionId && loadedRuntimeNCtx !== undefined
      ? `${activeSessionId}:${loadedRuntimeNCtx}`
      : null;
  React.useEffect(() => {
    if (
      silentRevertDetected &&
      activeSessionId &&
      loadedRuntimeNCtx !== undefined &&
      sessionOverrideForActive !== undefined &&
      silentRevertKey &&
      !chatSessionStore.hasSilentRevertAcknowledged(
        activeSessionId,
        loadedRuntimeNCtx,
      )
    ) {
      setSilentRevertSnackbar({
        message: t(l10n.chat.contextWarning.silentRevertAdvisory, {
          requested: formatKLabel(sessionOverrideForActive),
          running: formatKLabel(loadedRuntimeNCtx),
        }),
        visible: true,
      });
      chatSessionStore.markSilentRevertAcknowledged(
        activeSessionId,
        loadedRuntimeNCtx,
      );
    }
  }, [
    silentRevertDetected,
    silentRevertKey,
    activeSessionId,
    loadedRuntimeNCtx,
    sessionOverrideForActive,
    l10n,
  ]);
  const dismissSilentRevertSnackbar = React.useCallback(() => {
    setSilentRevertSnackbar(prev => (prev ? {...prev, visible: false} : null));
  }, []);

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
    silentRevertSnackbar,
    dismissSilentRevertSnackbar,
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
