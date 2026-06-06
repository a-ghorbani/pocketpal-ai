import {act, renderHook} from '@testing-library/react-hooks';

import {chatSessionStore, modelStore} from '../../store';
import {registerDefaultTalents} from '../../services/talents';
import type {Pal} from '../../types/pal';

import {usePalLoadHint} from '../usePalLoadHint';

// talentRegistry (src/services/talents) is the real singleton in Jest — only
// src/services/index is centrally mocked. Register the built-in engines so
// render_html (recommendedContextTokens=4096) and the light engines
// (datetime/calculate, no field) are available.
registerDefaultTalents();

const setNCtx = (n: number | undefined) => {
  (modelStore as any).activeContextSettings =
    n === undefined ? undefined : {n_ctx: n};
};

const palWith = (talentNames: string[]): Pal =>
  ({
    id: 'pal-1',
    pact: {
      talents: talentNames.map(name => ({name, required: true})),
    },
  }) as unknown as Pal;

describe('usePalLoadHint', () => {
  beforeEach(() => {
    chatSessionStore.palLoadHintSeen = new Set();
    (chatSessionStore.markPalLoadHintSeen as jest.Mock).mockImplementation(
      (sig: string) => {
        chatSessionStore.palLoadHintSeen.add(sig);
      },
    );
    setNCtx(2048);
  });

  afterEach(() => {
    setNCtx(undefined);
    (chatSessionStore.markPalLoadHintSeen as jest.Mock).mockReset();
  });

  it('fires once when a heavy-talent pal loads below its recommended context', () => {
    const {result} = renderHook(() =>
      usePalLoadHint({activePal: palWith(['render_html']), isFocused: true}),
    );
    expect(result.current.hintVisible).toBe(true);
    expect(chatSessionStore.markPalLoadHintSeen).toHaveBeenCalledTimes(1);
  });

  it('does not re-fire for the same pal-load signature on re-render', () => {
    const {result, rerender} = renderHook(
      ({focused}) =>
        usePalLoadHint({
          activePal: palWith(['render_html']),
          isFocused: focused,
        }),
      {initialProps: {focused: true}},
    );
    expect(result.current.hintVisible).toBe(true);
    act(() => result.current.dismiss());
    rerender({focused: true});
    // Signature already seen → predicate short-circuits; only the first emit.
    expect(chatSessionStore.markPalLoadHintSeen).toHaveBeenCalledTimes(1);
  });

  it('does not fire when loaded n_ctx meets or exceeds the recommendation', () => {
    setNCtx(4096);
    const {result} = renderHook(() =>
      usePalLoadHint({activePal: palWith(['render_html']), isFocused: true}),
    );
    expect(result.current.hintVisible).toBe(false);
    expect(chatSessionStore.markPalLoadHintSeen).not.toHaveBeenCalled();
  });

  it('does not fire for light talents with no recommendedContextTokens field', () => {
    const {result} = renderHook(() =>
      usePalLoadHint({
        activePal: palWith(['datetime', 'calculate']),
        isFocused: true,
      }),
    );
    expect(result.current.hintVisible).toBe(false);
    expect(chatSessionStore.markPalLoadHintSeen).not.toHaveBeenCalled();
  });

  it('does not fire while the chat surface is not focused', () => {
    const {result} = renderHook(() =>
      usePalLoadHint({activePal: palWith(['render_html']), isFocused: false}),
    );
    expect(result.current.hintVisible).toBe(false);
    expect(chatSessionStore.markPalLoadHintSeen).not.toHaveBeenCalled();
  });

  it('does not fire when no pal is active', () => {
    const {result} = renderHook(() =>
      usePalLoadHint({activePal: undefined, isFocused: true}),
    );
    expect(result.current.hintVisible).toBe(false);
    expect(chatSessionStore.markPalLoadHintSeen).not.toHaveBeenCalled();
  });

  it('does not fire when no model is loaded (n_ctx undefined)', () => {
    setNCtx(undefined);
    const {result} = renderHook(() =>
      usePalLoadHint({activePal: palWith(['render_html']), isFocused: true}),
    );
    expect(result.current.hintVisible).toBe(false);
    expect(chatSessionStore.markPalLoadHintSeen).not.toHaveBeenCalled();
  });

  it('dismiss() clears the hint', () => {
    const {result} = renderHook(() =>
      usePalLoadHint({activePal: palWith(['render_html']), isFocused: true}),
    );
    expect(result.current.hintVisible).toBe(true);
    act(() => result.current.dismiss());
    expect(result.current.hintVisible).toBe(false);
  });
});
