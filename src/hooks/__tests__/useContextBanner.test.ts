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
    (hasEnoughMemoryWithNCtx as jest.Mock).mockResolvedValue(true);
  });

  // B1 regression: dismissing a warning must flip the banner away. Before
  // dropping the useMemo around resolveBannerVariant, the MobX-wrapped Set
  // ref was stable across .add() so the memo never recomputed.
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

  // C5: handleConfirmIncrease must no-op while a run is in flight, even
  // when reachable via the pal-load-hint snackbar. We assert the
  // chatSessionStore side-effect did not fire — the modelStore reload
  // calls (releaseContext / initContext) are gated behind the same check.
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

  // No-session confirm path: the user accepts the increase before sending
  // a first message. The override has nowhere to live in the
  // session-keyed Map, so it lands on the pending slot until
  // createNewSession copies it over.
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
      expect(
        chatSessionStore.setSessionContextOverride,
      ).not.toHaveBeenCalled();
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

  // Single-surface invariant: when the confirm handler raises the reload
  // snackbar it must also dismiss the pal-load hint, so a render never
  // commits two snackbars at once. We assert the FINAL committed state
  // after act() resolves, not commit timing — per the design note in HOW.
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
