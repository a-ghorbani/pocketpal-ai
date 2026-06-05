import {act, renderHook, waitFor} from '@testing-library/react-native';

import {usePalLoadHint} from '../usePalLoadHint';
import {chatSessionStore, modelStore} from '../../store';
import {hasEnoughMemoryWithNCtx} from '../useMemoryCheck';
import {
  RenderHtmlEngine,
  registerDefaultTalents,
  talentRegistry,
} from '../../services/talents';
import {ModelOrigin} from '../../utils/types';
import {downloadedModel} from '../../../jest/fixtures/models';
import type {Pal} from '../../types/pal';

// The hook reads from L10nContext for copy strings. The default value of
// L10nContext is l10n.en (see src/utils/index.ts), so the hook works in
// tests without an explicit Provider wrapper.

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
  // RenderHtmlEngine advertises recommendedContextTokens = 4096, which is
  // strictly greater than the default n_ctx = 2048 the mock model exposes —
  // so the suppressor predicate fires for this pal at default ctx.
  pact: {talents: [{name: 'render_html', necessity: 'required'}]},
};

const lightPal: Pal = {
  ...heavyPal,
  id: 'pal-light',
  name: 'Light Pal',
  // Calculate does NOT declare recommendedContextTokens, so it should
  // never raise the hint.
  pact: {talents: [{name: 'calculate', necessity: 'optional'}]},
};

describe('usePalLoadHint', () => {
  beforeAll(() => {
    // Ensure built-in talents (render_html in particular) are registered
    // — the hook reads from talentRegistry.get(name).
    registerDefaultTalents();
    // Defensive: if a sibling test cleared the registry, re-register here.
    if (!talentRegistry.get('render_html')) {
      talentRegistry.register(new RenderHtmlEngine());
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    chatSessionStore.palLoadHintSeen.clear();
    chatSessionStore.activeSessionId = 'session-1';
    modelStore.activeModelId = downloadedModel.id;
    modelStore.contextInitParams.n_ctx = 2048;
    (modelStore as any).runtimeContextSettings = undefined;
    // Default: memory probe says yes — hint will offer "Increase context".
    (hasEnoughMemoryWithNCtx as jest.Mock).mockResolvedValue(true);
  });

  it('does not fire for a pal whose talents fit current n_ctx', async () => {
    const {result} = renderHook(() => usePalLoadHint(lightPal));

    // Let the effect run; no state should be set.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state).toBeNull();
  });

  it('does not fire when there is no active pal', async () => {
    const {result} = renderHook(() => usePalLoadHint(undefined));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state).toBeNull();
  });

  it('does not fire when the active model is remote', async () => {
    // Inject a REMOTE-origin model into the mock store's `models` array and
    // point activeModelId at it so the computed `activeModel` getter returns
    // a remote model. Restore afterwards.
    const remoteId = 'remote-test-model';
    const prevModels = modelStore.models;
    const prevActiveId = modelStore.activeModelId;
    modelStore.models = [
      ...prevModels,
      {...downloadedModel, id: remoteId, origin: ModelOrigin.REMOTE} as any,
    ];
    modelStore.activeModelId = remoteId;

    try {
      const {result} = renderHook(() => usePalLoadHint(heavyPal));
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.state).toBeNull();
    } finally {
      modelStore.models = prevModels;
      modelStore.activeModelId = prevActiveId;
    }
  });

  it('fires once for a heavy-talent pal at default n_ctx and marks the suppressor', async () => {
    const {result} = renderHook(() => usePalLoadHint(heavyPal));

    await waitFor(() => {
      expect(result.current.state).not.toBeNull();
    });

    const state = result.current.state!;
    expect(state.visible).toBe(true);
    expect(state.palId).toBe(heavyPal.id);
    expect(state.nCtx).toBe(2048);
    // Memory probe said yes → "increase" action with a concrete next tier.
    expect(state.action).toBe('increase');
    expect(state.nextTierTokens).toBe(4096);

    // The hint marks the suppressor at emit time, regardless of user action.
    expect(chatSessionStore.hasPalLoadHintSeen(heavyPal.id, 2048)).toBe(true);
  });

  it('falls back to newChat when no tier fits memory', async () => {
    (hasEnoughMemoryWithNCtx as jest.Mock).mockResolvedValue(false);

    const {result} = renderHook(() => usePalLoadHint(heavyPal));

    await waitFor(() => {
      expect(result.current.state).not.toBeNull();
    });
    expect(result.current.state!.action).toBe('newChat');
    expect(result.current.state!.nextTierTokens).toBeNull();
  });

  it('falls back to newChat when the memory probe throws', async () => {
    (hasEnoughMemoryWithNCtx as jest.Mock).mockRejectedValue(
      new Error('probe failed'),
    );

    const {result} = renderHook(() => usePalLoadHint(heavyPal));

    await waitFor(() => {
      expect(result.current.state).not.toBeNull();
    });
    expect(result.current.state!.action).toBe('newChat');
    expect(result.current.state!.nextTierTokens).toBeNull();
    // Suppressor still inserted on the failure path — the hint must not
    // retry on every render.
    expect(chatSessionStore.hasPalLoadHintSeen(heavyPal.id, 2048)).toBe(true);
  });

  it('does not fire when the suppressor already contains (palId, n_ctx)', async () => {
    chatSessionStore.markPalLoadHintSeen(heavyPal.id, 2048);

    const {result} = renderHook(() => usePalLoadHint(heavyPal));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state).toBeNull();
  });

  it('stops firing once a reload raises runtime n_ctx to the recommendation', async () => {
    chatSessionStore.markPalLoadHintSeen(heavyPal.id, 2048);

    const {result, rerender} = renderHook(() => usePalLoadHint(heavyPal));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state).toBeNull();

    // Banner Increase CTA fires elsewhere: it writes the global setting
    // and reloads. Runtime n_ctx is now 4096, which satisfies the
    // talent recommendation — hint must NOT re-fire at the new size.
    (modelStore as any).runtimeContextSettings = {n_ctx: 4096};
    rerender(undefined);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state).toBeNull();
  });

  it('dismiss flips visible=false but keeps the suppressor inserted', async () => {
    const {result} = renderHook(() => usePalLoadHint(heavyPal));

    await waitFor(() => {
      expect(result.current.state?.visible).toBe(true);
    });

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.state!.visible).toBe(false);
    // Suppressor stays — re-renders must not re-raise the same (pal, n_ctx).
    expect(chatSessionStore.hasPalLoadHintSeen(heavyPal.id, 2048)).toBe(true);
  });

  it('onAction returns the chosen action and clears visible', async () => {
    const {result} = renderHook(() => usePalLoadHint(heavyPal));
    await waitFor(() => {
      expect(result.current.state).not.toBeNull();
    });
    let resolved: any;
    await act(async () => {
      resolved = await result.current.onAction();
    });
    expect(resolved).toBe('increase');
    expect(result.current.state!.visible).toBe(false);
  });

  // Focus gate: while the chat surface is not focused the effect must
  // early-return so the snackbar can't appear over Settings / Pals /
  // Models screens. The suppressor key is also NOT marked off-focus, so
  // the same signature can still fire on the next focused render.
  describe('focus gate', () => {
    const nav = require('@react-navigation/native');

    afterEach(() => {
      // Default jest setup mocks useIsFocused -> true; restore for the
      // sibling tests that depend on the default.
      (nav.useIsFocused as jest.Mock).mockReturnValue(true);
    });

    it('does not raise the snackbar and does not mark the suppressor when chat is unfocused', async () => {
      jest.spyOn(nav, 'useIsFocused').mockReturnValue(false);

      const {result} = renderHook(() => usePalLoadHint(heavyPal));

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.state).toBeNull();
      // Critical: the one-shot opportunity must survive an off-focus
      // signature pass.
      expect(chatSessionStore.hasPalLoadHintSeen(heavyPal.id, 2048)).toBe(
        false,
      );
    });

    it('fires once after refocus when the predicate still holds', async () => {
      const useIsFocusedSpy = jest.spyOn(nav, 'useIsFocused');
      useIsFocusedSpy.mockReturnValue(false);

      const {result, rerender} = renderHook(() => usePalLoadHint(heavyPal));

      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.state).toBeNull();
      expect(chatSessionStore.hasPalLoadHintSeen(heavyPal.id, 2048)).toBe(
        false,
      );

      // Simulate the user navigating back to chat.
      useIsFocusedSpy.mockReturnValue(true);
      rerender(undefined);

      await waitFor(() => {
        expect(result.current.state).not.toBeNull();
      });
      expect(result.current.state!.visible).toBe(true);
      expect(chatSessionStore.hasPalLoadHintSeen(heavyPal.id, 2048)).toBe(true);
    });

    it('keeps a visible snackbar state through an off-focus render gate', async () => {
      // First fire happens while focused.
      const {result, rerender} = renderHook(() => usePalLoadHint(heavyPal));
      await waitFor(() => {
        expect(result.current.state?.visible).toBe(true);
      });

      // User navigates away. The JSX gate (in ChatView) suppresses the
      // render, but hook state must survive the off-focus pass.
      jest.spyOn(nav, 'useIsFocused').mockReturnValue(false);
      rerender(undefined);
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.state).not.toBeNull();
      expect(result.current.state!.visible).toBe(true);
    });
  });
});
