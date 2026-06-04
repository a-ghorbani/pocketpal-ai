import {act, renderHook, waitFor} from '@testing-library/react-native';

import {useContextBanner} from '../useContextBanner';
import {chatSessionStore, modelStore} from '../../store';
import {hasEnoughMemoryWithNCtx} from '../useMemoryCheck';
import {downloadedModel} from '../../../jest/fixtures/models';
import {l10n} from '../../locales';
import {
  RenderHtmlEngine,
  registerDefaultTalents,
  talentRegistry,
} from '../../services/talents';
import type {Pal} from '../../types/pal';

// High-ratio snapshot: 1700/2048 = 0.83, above the 0.80 warning threshold.
const warningSnap = {
  tokensCached: 0,
  tokensEvaluated: 1500,
  tokensPredicted: 200,
  contextFull: false,
  finishReason: 'eos' as const,
};

// Pal whose required talents declare a higher recommendedContextTokens than
// the default 2048 mock n_ctx — drives the pal-load hint into the
// "visible" state for single-surface coverage.
const heavyPal: Pal = {
  type: 'local',
  id: 'pal-heavy',
  name: 'Heavy Pal',
  description: '',
  systemPrompt: '',
  originalSystemPrompt: '',
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {},
  parameterSchema: [],
  source: 'local',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  pact: {talents: [{name: 'render_html', necessity: 'required'}]},
};

describe('useContextBanner', () => {
  beforeAll(() => {
    registerDefaultTalents();
    if (!talentRegistry.get('render_html')) {
      talentRegistry.register(new RenderHtmlEngine());
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    chatSessionStore.activeSessionId = 'session-1';
    chatSessionStore.lastCompletionResult = null;
    chatSessionStore.dismissedBannerVariants.clear();
    chatSessionStore.sessionContextOverrides.clear();
    chatSessionStore.palLoadHintSeen.clear();
    chatSessionStore.pendingContextOverride = undefined;
    chatSessionStore.consecutiveFullFailures = 0;
    (chatSessionStore as any).isGenerating = false;
    (chatSessionStore as any).isStopping = false;
    modelStore.activeModelId = downloadedModel.id;
    modelStore.contextInitParams.n_ctx = 2048;
    // Banner pipeline gates on a loaded LlamaContext. Tests run
    // without a real context, so we stand in `runtimeContextSettings`
    // for the n_ctx the resolver reads.
    (modelStore as any).runtimeContextSettings = {n_ctx: 2048};
    chatSessionStore.silentRevertAcknowledged.clear();
    (hasEnoughMemoryWithNCtx as jest.Mock).mockResolvedValue(true);
  });

  // Guards against the MobX-Set + useMemo trap: the wrapped Set's
  // reference is stable across mutations, so any memo over it would
  // never recompute on dismiss.
  it('drops to "none" after the warning is dismissed', () => {
    chatSessionStore.lastCompletionResult = warningSnap;

    const {result, rerender} = renderHook(() =>
      useContextBanner({
        activePal: undefined,
        htmlPreviewCount: 0,
        messages: [],
        l10n: l10n.en,
      }),
    );

    expect(result.current.bannerVariant.kind).toBe('context-warning');

    act(() => {
      chatSessionStore.setBannerDismissed('session-1', 'context-warning');
    });
    rerender({});

    expect(result.current.bannerVariant.kind).toBe('none');
  });

  it('handleConfirmIncrease no-ops while a run is active', async () => {
    chatSessionStore.lastCompletionResult = warningSnap;

    const {result} = renderHook(() =>
      useContextBanner({
        activePal: undefined,
        htmlPreviewCount: 0,
        messages: [],
        l10n: l10n.en,
      }),
    );

    // Let the async tier probe settle so nextTierTokens leaves null and
    // the run-active guard becomes the only thing standing in the way.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    (chatSessionStore as any).isStopping = true;

    await act(async () => {
      await result.current.handleConfirmIncrease(4096);
    });

    expect(chatSessionStore.setSessionContextOverride).not.toHaveBeenCalled();
    // Reload-in-progress snackbar must NOT appear.
    expect(result.current.reloadSnackbar).toBeNull();
    expect(result.current.isReloading).toBe(false);
  });

  describe('handleConfirmIncrease with no active session', () => {
    beforeEach(() => {
      chatSessionStore.activeSessionId = null;
      (modelStore as any).releaseContext = jest
        .fn()
        .mockResolvedValue(undefined);
    });

    it('writes the target to pendingContextOverride and does not touch sessionContextOverrides', async () => {
      const {result} = renderHook(() =>
        useContextBanner({
          activePal: undefined,
          htmlPreviewCount: 0,
          messages: [],
          l10n: l10n.en,
        }),
      );

      await act(async () => {
        await result.current.handleConfirmIncrease(4096);
      });

      expect(chatSessionStore.setPendingContextOverride).toHaveBeenCalledWith(
        4096,
      );
      expect(chatSessionStore.pendingContextOverride).toBe(4096);
      // Session-keyed write must NOT happen on the no-session branch.
      expect(chatSessionStore.setSessionContextOverride).not.toHaveBeenCalled();
      expect(chatSessionStore.sessionContextOverrides.size).toBe(0);
      // Native reload still runs so the next initContext picks up the
      // lifted n_ctx via the pending slot.
      expect((modelStore as any).releaseContext).toHaveBeenCalled();
      expect(modelStore.initContext).toHaveBeenCalled();
    });

    it('reverts the pending slot when initContext rejects', async () => {
      (modelStore.initContext as jest.Mock).mockRejectedValueOnce(
        new Error('OOM'),
      );

      const {result} = renderHook(() =>
        useContextBanner({
          activePal: undefined,
          htmlPreviewCount: 0,
          messages: [],
          l10n: l10n.en,
        }),
      );

      await act(async () => {
        await result.current.handleConfirmIncrease(4096);
      });

      // Failure clears the slot (no prior value to restore) so the
      // user's clean slate stays clean and they can retry.
      expect(chatSessionStore.clearPendingContextOverride).toHaveBeenCalled();
      expect(chatSessionStore.pendingContextOverride).toBeUndefined();
      expect(result.current.reloadSnackbar?.phase).toBe('failure');
    });

    it('restores a prior pending value when a second attempt fails', async () => {
      chatSessionStore.pendingContextOverride = 4096;
      (modelStore.initContext as jest.Mock).mockRejectedValueOnce(
        new Error('OOM'),
      );

      const {result} = renderHook(() =>
        useContextBanner({
          activePal: undefined,
          htmlPreviewCount: 0,
          messages: [],
          l10n: l10n.en,
        }),
      );

      await act(async () => {
        await result.current.handleConfirmIncrease(8192);
      });

      // The hook set 8192 then reverted to the prior 4096; the user
      // keeps the override they originally consented to.
      expect(chatSessionStore.pendingContextOverride).toBe(4096);
    });
  });

  describe('reads runtime n_ctx (not configured)', () => {
    it('fires warning relative to loaded n_ctx when Settings was raised without reload', () => {
      // Configured 8192 (Settings change), loaded 2048 (no reload), used 1700.
      // Ratio over configured = 0.21 (silent — the bug). Ratio over loaded
      // = 0.83 ≥ 0.80 → warning. Banner must fire.
      modelStore.contextInitParams.n_ctx = 8192;
      (modelStore as any).runtimeContextSettings = {n_ctx: 2048};
      chatSessionStore.lastCompletionResult = {
        tokensCached: 0,
        tokensEvaluated: 1500,
        tokensPredicted: 200,
        contextFull: false,
        finishReason: 'eos' as const,
      };

      const {result} = renderHook(() =>
        useContextBanner({
          activePal: undefined,
          htmlPreviewCount: 0,
          messages: [],
          l10n: l10n.en,
        }),
      );

      expect(result.current.bannerVariant.kind).toBe('context-warning');
    });

    it('does not falsely fire FULL when Settings was lowered below used (loaded is still large)', () => {
      // Configured 2048 (Settings lowered), loaded 8192, used 3000.
      // Ratio over configured = 1.47 → would falsely look FULL.
      // Ratio over loaded = 0.37 → NONE. Loaded wins.
      modelStore.contextInitParams.n_ctx = 2048;
      (modelStore as any).runtimeContextSettings = {n_ctx: 8192};
      chatSessionStore.lastCompletionResult = {
        tokensCached: 0,
        tokensEvaluated: 2800,
        tokensPredicted: 200,
        contextFull: false,
        finishReason: 'eos' as const,
      };

      const {result} = renderHook(() =>
        useContextBanner({
          activePal: undefined,
          htmlPreviewCount: 0,
          messages: [],
          l10n: l10n.en,
        }),
      );

      expect(result.current.bannerVariant.kind).toBe('none');
    });

    it('uses session override when set, capped to loaded n_ctx', () => {
      // Override 8192 staged for session-1 (e.g. confirmed before a
      // silent OS-evict reload). Loaded came back at 2048. Used 1700.
      // Override-uncapped would show ratio 0.21 → silent (wrong);
      // capped → ratio 0.83 over 2048 → warning.
      modelStore.contextInitParams.n_ctx = 2048;
      (modelStore as any).runtimeContextSettings = {n_ctx: 2048};
      chatSessionStore.sessionContextOverrides.set('session-1', 8192);
      chatSessionStore.lastCompletionResult = {
        tokensCached: 0,
        tokensEvaluated: 1500,
        tokensPredicted: 200,
        contextFull: false,
        finishReason: 'eos' as const,
      };

      const {result} = renderHook(() =>
        useContextBanner({
          activePal: undefined,
          htmlPreviewCount: 0,
          messages: [],
          l10n: l10n.en,
        }),
      );

      expect(result.current.bannerVariant.kind).toBe('context-warning');
    });

    describe('silent revert advisory snackbar', () => {
      it('fires once per (session, loadedNCtx) when override > loaded', () => {
        (modelStore as any).runtimeContextSettings = {n_ctx: 2048};
        chatSessionStore.sessionContextOverrides.set('session-1', 4096);

        const {result, rerender} = renderHook(() =>
          useContextBanner({
            activePal: undefined,
            htmlPreviewCount: 0,
            messages: [],
            l10n: l10n.en,
          }),
        );

        expect(result.current.silentRevertSnackbar?.visible).toBe(true);
        expect(result.current.silentRevertSnackbar?.message).toMatch(
          /Currently running at 2K/,
        );
        expect(
          chatSessionStore.hasSilentRevertAcknowledged('session-1', 2048),
        ).toBe(true);

        // Re-render without changing the (session, loadedNCtx) pair —
        // suppressor prevents another fire.
        act(() => {
          result.current.dismissSilentRevertSnackbar();
        });
        rerender({});
        expect(result.current.silentRevertSnackbar?.visible).toBe(false);
      });

      it('does not fire when override fits within loaded', () => {
        (modelStore as any).runtimeContextSettings = {n_ctx: 8192};
        chatSessionStore.sessionContextOverrides.set('session-1', 4096);

        const {result} = renderHook(() =>
          useContextBanner({
            activePal: undefined,
            htmlPreviewCount: 0,
            messages: [],
            l10n: l10n.en,
          }),
        );

        expect(result.current.silentRevertSnackbar).toBeNull();
      });

      it('does not fire when no LlamaContext is loaded', () => {
        (modelStore as any).runtimeContextSettings = undefined;
        chatSessionStore.sessionContextOverrides.set('session-1', 4096);

        const {result} = renderHook(() =>
          useContextBanner({
            activePal: undefined,
            htmlPreviewCount: 0,
            messages: [],
            l10n: l10n.en,
          }),
        );

        expect(result.current.silentRevertSnackbar).toBeNull();
      });
    });

    it('hides banner entirely when no LlamaContext is loaded', () => {
      // Snapshot hydrated from session metadata says "near full" — but
      // no context is loaded. Acting on the banner (Increase / New chat)
      // would target nothing. Suppress.
      modelStore.contextInitParams.n_ctx = 2048;
      (modelStore as any).runtimeContextSettings = undefined;
      chatSessionStore.lastCompletionResult = warningSnap;

      const {result} = renderHook(() =>
        useContextBanner({
          activePal: undefined,
          htmlPreviewCount: 0,
          messages: [],
          l10n: l10n.en,
        }),
      );

      expect(result.current.bannerVariant.kind).toBe('none');
    });
  });

  // Confirm must dismiss the pal-load hint as it raises the reload
  // snackbar — never two snackbars on screen at once.
  describe('single-surface invariant on confirm', () => {
    beforeEach(() => {
      (modelStore as any).releaseContext = jest
        .fn()
        .mockResolvedValue(undefined);
    });

    it('dismisses the visible pal-load hint while raising the reload snackbar', async () => {
      const {result} = renderHook(() =>
        useContextBanner({
          activePal: heavyPal,
          htmlPreviewCount: 0,
          messages: [],
          l10n: l10n.en,
        }),
      );

      // Wait for the pal-load hint's tier probe to settle so the hint
      // becomes visible.
      await waitFor(() => {
        expect(result.current.palLoadHint.state?.visible).toBe(true);
      });

      await act(async () => {
        await result.current.handleConfirmIncrease(4096);
      });

      // Hint must be dismissed by the time the reload snackbar enters
      // its 'reloading' / 'success' phase.
      expect(result.current.palLoadHint.state?.visible).toBe(false);
      // Reload snackbar carries through to 'success' (default duration)
      // because initContext resolved.
      expect(result.current.reloadSnackbar?.visible).toBe(true);
      expect(['reloading', 'success']).toContain(
        result.current.reloadSnackbar?.phase,
      );
    });
  });
});
