import {act, renderHook} from '@testing-library/react-native';

import {useContextBanner} from '../useContextBanner';
import {chatSessionStore, modelStore} from '../../store';
import {hasEnoughMemoryWithNCtx} from '../useMemoryCheck';
import {downloadedModel} from '../../../jest/fixtures/models';
import {l10n} from '../../locales';

// High-ratio snapshot: 1700/2048 = 0.83, above the 0.80 warning threshold.
const warningSnap = {
  tokensCached: 0,
  tokensEvaluated: 1500,
  tokensPredicted: 200,
  contextFull: false,
  finishReason: 'eos' as const,
};

describe('useContextBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chatSessionStore.activeSessionId = 'session-1';
    chatSessionStore.lastCompletionResult = null;
    chatSessionStore.dismissedBannerVariants.clear();
    chatSessionStore.sessionContextOverrides.clear();
    chatSessionStore.palLoadHintSeen.clear();
    chatSessionStore.consecutiveFullFailures = 0;
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
      await result.current.handleConfirmIncrease();
    });

    expect(chatSessionStore.setSessionContextOverride).not.toHaveBeenCalled();
    // Reload-in-progress snackbar must NOT appear.
    expect(result.current.reloadSnackbar).toBeNull();
    expect(result.current.isReloading).toBe(false);
  });
});
