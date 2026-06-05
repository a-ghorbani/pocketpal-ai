import {CompletionResultSnapshot} from '../completionTypes';
import {
  AUTOCLEAR_RUNWAY,
  BannerResolverInput,
  resolveBannerVariant,
} from '../bannerVariantResolver';

const baseInput = (
  overrides: Partial<BannerResolverInput> = {},
): BannerResolverInput => ({
  effectiveNCtx: 4096,
  isRemote: false,
  htmlPreviewCount: 0,
  activeModelId: 'model-1',
  dismissed: new Set(),
  ...overrides,
});

const snap = (
  overrides: Partial<CompletionResultSnapshot> = {},
): CompletionResultSnapshot => ({
  used: 0,
  contextFull: false,
  isRemote: false,
  ...overrides,
});

describe('resolveBannerVariant', () => {
  describe('context-full (precedence 1, sticky)', () => {
    it('returns context-full when contextFull and freshness gate holds', () => {
      const result = resolveBannerVariant(
        snap({contextFull: true, used: 4096}),
        baseInput(),
      );
      expect(result.variant).toBe('context-full');
    });

    it('falls through when contextFull but freshness gate stale', () => {
      const result = resolveBannerVariant(
        snap({contextFull: true, used: 4096 - AUTOCLEAR_RUNWAY - 1}),
        baseInput(),
      );
      expect(result.variant).toBe('none');
    });

    it('wins over html-soft-cap', () => {
      const result = resolveBannerVariant(
        snap({contextFull: true, used: 4096}),
        baseInput({htmlPreviewCount: 4}),
      );
      expect(result.variant).toBe('context-full');
    });

    it('offers nextNCtx when a larger n_ctx fits', () => {
      const result = resolveBannerVariant(
        snap({contextFull: true, used: 4096}),
        baseInput({canFitNCtx: candidate => candidate <= 8192}),
      );
      expect(result.variant).toBe('context-full');
      expect(result.nextNCtx).toBe(8192);
    });

    it('hides the CTA (nextNCtx undefined) when nothing larger fits', () => {
      const result = resolveBannerVariant(
        snap({contextFull: true, used: 4096}),
        baseInput({canFitNCtx: () => false}),
      );
      expect(result.variant).toBe('context-full');
      expect(result.nextNCtx).toBeUndefined();
    });

    it('passes heavy-talent name through on the full variant', () => {
      const result = resolveBannerVariant(
        snap({contextFull: true, used: 4096}),
        baseInput({heavyTalentName: 'render_html'}),
      );
      expect(result.heavyTalentName).toBe('render_html');
    });

    it('clears once a raised effectiveNCtx makes the snapshot stale', () => {
      // Same persisted full snapshot, but the user lifted n_ctx; the higher
      // effectiveNCtx pushes used below the freshness boundary so the sticky
      // banner falls through without a new inference.
      const staleSnap = snap({contextFull: true, used: 4096});
      const sticky = resolveBannerVariant(staleSnap, baseInput());
      expect(sticky.variant).toBe('context-full');
      const cleared = resolveBannerVariant(
        staleSnap,
        baseInput({effectiveNCtx: 8192}),
      );
      expect(cleared.variant).toBe('none');
    });
  });

  describe('context-warning (precedence 2)', () => {
    it('fires at the 0.80 ratio', () => {
      const result = resolveBannerVariant(snap({used: 3277}), baseInput());
      expect(result.variant).toBe('context-warning');
    });

    it('does not fire below the ratio', () => {
      const result = resolveBannerVariant(snap({used: 3000}), baseInput());
      expect(result.variant).toBe('none');
    });

    it('does not fire one token below the 0.80 edge', () => {
      // 3276 / 4096 = 0.7998 < 0.80; 3277 / 4096 = 0.8001 >= 0.80.
      const below = resolveBannerVariant(snap({used: 3276}), baseInput());
      expect(below.variant).toBe('none');
      const at = resolveBannerVariant(snap({used: 3277}), baseInput());
      expect(at.variant).toBe('context-warning');
    });

    it('is suppressed when dismissed for the draft', () => {
      const result = resolveBannerVariant(
        snap({used: 3277}),
        baseInput({dismissed: new Set(['context-warning'])}),
      );
      expect(result.variant).toBe('none');
    });

    it('does not fire for remote sessions', () => {
      const result = resolveBannerVariant(
        snap({used: 3277, isRemote: true}),
        baseInput({isRemote: true}),
      );
      expect(result.variant).not.toBe('context-warning');
    });
  });

  describe('context-remote-hedged (precedence 3)', () => {
    it('fires on weak-signal truncation', () => {
      const result = resolveBannerVariant(
        snap({isRemote: true, tokensPredicted: 600, content: 'cut off here'}),
        baseInput({isRemote: true}),
      );
      expect(result.variant).toBe('context-remote-hedged');
    });

    it('does not fire when reply ends on terminal punctuation', () => {
      const result = resolveBannerVariant(
        snap({isRemote: true, tokensPredicted: 600, content: 'done.'}),
        baseInput({isRemote: true}),
      );
      expect(result.variant).toBe('none');
    });

    it('does not fire below the minimum token count', () => {
      const result = resolveBannerVariant(
        snap({isRemote: true, tokensPredicted: 100, content: 'short'}),
        baseInput({isRemote: true}),
      );
      expect(result.variant).toBe('none');
    });

    it('does not fire when finishReason is length', () => {
      const result = resolveBannerVariant(
        snap({
          isRemote: true,
          tokensPredicted: 600,
          finishReason: 'length',
          content: 'cut off',
        }),
        baseInput({isRemote: true}),
      );
      expect(result.variant).not.toBe('context-remote-hedged');
    });

    it('is suppressed when dismissed for the draft', () => {
      const result = resolveBannerVariant(
        snap({isRemote: true, tokensPredicted: 600, content: 'cut off'}),
        baseInput({
          isRemote: true,
          dismissed: new Set(['context-remote-hedged']),
        }),
      );
      expect(result.variant).toBe('none');
    });

    it('fires for remote models even when effectiveNCtx is undefined', () => {
      // Remote models never set activeContextSettings.n_ctx, so the hedged
      // advisory must not depend on a known runtime n_ctx.
      const result = resolveBannerVariant(
        snap({isRemote: true, tokensPredicted: 600, content: 'cut off here'}),
        baseInput({isRemote: true, effectiveNCtx: undefined}),
      );
      expect(result.variant).toBe('context-remote-hedged');
    });

    it('is suppressed when no model is loaded', () => {
      const result = resolveBannerVariant(
        snap({isRemote: true, tokensPredicted: 600, content: 'cut off here'}),
        baseInput({
          isRemote: true,
          effectiveNCtx: undefined,
          activeModelId: undefined,
        }),
      );
      expect(result.variant).toBe('none');
    });
  });

  describe('html-soft-cap (precedence 4)', () => {
    it('fires at 4 previews when no context variant matches', () => {
      const result = resolveBannerVariant(
        snap(),
        baseInput({htmlPreviewCount: 4}),
      );
      expect(result.variant).toBe('html-soft-cap');
    });

    it('is independent of model state', () => {
      const result = resolveBannerVariant(
        undefined,
        baseInput({htmlPreviewCount: 4, activeModelId: undefined}),
      );
      expect(result.variant).toBe('html-soft-cap');
    });
  });

  describe('suppression', () => {
    it('suppresses context-* when no model is loaded', () => {
      const result = resolveBannerVariant(
        snap({contextFull: true, used: 4096}),
        baseInput({activeModelId: undefined}),
      );
      expect(result.variant).toBe('none');
    });

    it('suppresses context-* when effectiveNCtx is undefined', () => {
      const result = resolveBannerVariant(
        snap({contextFull: true, used: 4096}),
        baseInput({effectiveNCtx: undefined}),
      );
      expect(result.variant).toBe('none');
    });

    it('returns none when there is no snapshot and no soft-cap', () => {
      const result = resolveBannerVariant(undefined, baseInput());
      expect(result.variant).toBe('none');
    });
  });
});
