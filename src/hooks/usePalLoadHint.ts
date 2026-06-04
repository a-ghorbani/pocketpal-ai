import {useContext, useEffect, useRef, useState} from 'react';
import {useIsFocused} from '@react-navigation/native';

import {chatSessionStore, modelStore} from '../store';
import {talentRegistry} from '../services/talents';
import type {Pal} from '../types/pal';
import {L10nContext} from '../utils';
import {t} from '../locales';
import {ModelOrigin} from '../utils/types';
import {hasEnoughMemoryWithNCtx} from './useMemoryCheck';
import {effectiveNCtx, pickNextTier} from '../utils/bannerVariantResolver';

export type PalLoadHintAction = 'increase' | 'newChat';

export interface PalLoadHintState {
  visible: boolean;
  message: string;
  actionLabel: string;
  action: PalLoadHintAction;
  /** Snapshot of `(palId, n_ctx)` the hint was raised against — used by
   *  the dismiss path to insert the suppressor key. */
  palId: string;
  nCtx: number;
  /** Pre-picked next tier when `action === 'increase'`. Null when no
   *  tier fits memory (`action === 'newChat'`). */
  nextTierTokens: number | null;
}

/**
 * One-shot pal-load hint. Watches the active pal, active model, and
 * effective n_ctx; when a pal declares a talent whose
 * `recommendedContextTokens` exceeds the current n_ctx and the
 * `palLoadHintSeen` set does not already contain `${palId}:${n_ctx}`,
 * raises a snackbar with either "Increase context" (if a tier fits) or
 * "Start new chat" (otherwise). Process restart clears the gate.
 */
export function usePalLoadHint(activePal: Pal | undefined): {
  state: PalLoadHintState | null;
  dismiss: () => void;
  onAction: () => Promise<PalLoadHintAction | null>;
} {
  // `L10nContext` is consumed only to resolve copy at the action
  // moment; we don't react to language changes mid-snackbar.
  const l10n = useContext(L10nContext);
  const isFocused = useIsFocused();
  const [state, setState] = useState<PalLoadHintState | null>(null);
  const lastSignatureRef = useRef<string | null>(null);

  const activeModelId = modelStore.activeModelId;
  const activeModel = modelStore.activeModel;
  const baseNCtx = modelStore.contextInitParams.n_ctx;
  const activeSessionId = chatSessionStore.activeSessionId;
  const overrides = chatSessionStore.sessionContextOverrides;
  const pendingOverride = chatSessionStore.pendingContextOverride;
  const effectiveNCtxForSession = effectiveNCtx(
    overrides,
    activeSessionId,
    baseNCtx,
    pendingOverride,
  );
  const isRemote = activeModel?.origin === ModelOrigin.REMOTE;

  // Stable signature so the effect only fires at the edges (pal load,
  // model load completing, talent-set change). React handles n_ctx
  // changes naturally — when the user lifts n_ctx via the CTA the new
  // signature opens a fresh fire opportunity (the suppressor key is
  // also keyed by n_ctx).
  const talentSignature = (activePal?.pact?.talents ?? [])
    .map(tt => tt.name)
    .join(',');
  const signature = `${activePal?.id ?? '-'}|${activeModelId ?? '-'}|${effectiveNCtxForSession}|${talentSignature}`;

  useEffect(() => {
    if (lastSignatureRef.current === signature) {
      return;
    }
    // Focus gate: only let the chat screen raise this hint. Drawer /
    // model picker / settings stay clear so the snackbar doesn't
    // surface over an unrelated surface. Marker is set only after the
    // predicate actually evaluated, so the hint can still fire on the
    // next focus event with the same signature.
    if (!isFocused) {
      return;
    }
    lastSignatureRef.current = signature;
    if (!activePal || !activeModel || isRemote) {
      return;
    }
    const talents = activePal.pact?.talents ?? [];
    const recommend = talents
      .map(tt => talentRegistry.get(tt.name)?.recommendedContextTokens)
      .filter((n): n is number => typeof n === 'number');
    if (recommend.length === 0) {
      return;
    }
    const maxRecommend = Math.max(...recommend);
    if (maxRecommend <= effectiveNCtxForSession) {
      return;
    }
    if (
      chatSessionStore.hasPalLoadHintSeen(activePal.id, effectiveNCtxForSession)
    ) {
      return;
    }

    let cancelled = false;
    pickNextTier(effectiveNCtxForSession, n =>
      hasEnoughMemoryWithNCtx(activeModel, n),
    )
      .then(tier => {
        if (cancelled) {
          return;
        }
        const fits = tier !== null;
        setState({
          visible: true,
          message: t(l10n.chat.contextWarning.palLoadHint.message, {
            palName: activePal.name,
          }),
          actionLabel: fits
            ? l10n.chat.contextWarning.palLoadHint.increase
            : l10n.chat.contextWarning.palLoadHint.newChat,
          action: fits ? 'increase' : 'newChat',
          palId: activePal.id,
          nCtx: effectiveNCtxForSession,
          nextTierTokens: tier,
        });
        // One-shot semantics: insert the key at emit time regardless of
        // user action.
        chatSessionStore.markPalLoadHintSeen(
          activePal.id,
          effectiveNCtxForSession,
        );
      })
      .catch(() => {
        // Memory probe failed — fall back to "Start new chat" so the
        // user still gets actionable feedback.
        if (cancelled) {
          return;
        }
        setState({
          visible: true,
          message: t(l10n.chat.contextWarning.palLoadHint.message, {
            palName: activePal.name,
          }),
          actionLabel: l10n.chat.contextWarning.palLoadHint.newChat,
          action: 'newChat',
          palId: activePal.id,
          nCtx: effectiveNCtxForSession,
          nextTierTokens: null,
        });
        chatSessionStore.markPalLoadHintSeen(
          activePal.id,
          effectiveNCtxForSession,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    signature,
    activePal,
    activeModel,
    isRemote,
    effectiveNCtxForSession,
    isFocused,
    l10n,
  ]);

  const dismiss = () => {
    setState(prev => (prev ? {...prev, visible: false} : null));
  };

  const onAction = async (): Promise<PalLoadHintAction | null> => {
    if (!state) {
      return null;
    }
    // Dismiss synchronously so the React 18 auto-batched setState in
    // the caller (raising the reload snackbar) commits a single frame
    // — never two snackbars at once.
    dismiss();
    return state.action;
  };

  return {state, dismiss, onAction};
}
