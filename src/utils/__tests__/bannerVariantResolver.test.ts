import type {CompletionResult} from '../completionTypes';
import type {CompletionResultSnapshot} from '../bannerVariantResolver';
import type {MessageType} from '../types';
import {
  AUTOCLEAR_RUNWAY,
  CONTEXT_TIERS,
  WARNING_THRESHOLD,
  deriveSnapshotFromResult,
  effectiveNCtx,
  pickNextTier,
  resolveBannerVariant,
} from '../bannerVariantResolver';
import {talentRegistry} from '../../services/talents';

// Build a baseline snapshot inline so each test can override the fields that
// matter for its scenario without re-declaring every default.
function snapshot(
  overrides: Partial<CompletionResultSnapshot> = {},
): CompletionResultSnapshot {
  return {
    tokensCached: 0,
    tokensEvaluated: 0,
    tokensPredicted: 0,
    contextFull: false,
    finishReason: 'eos',
    ...overrides,
  };
}

const baseContext = {
  snapshot: null as CompletionResultSnapshot | null,
  effectiveNCtx: 2048,
  isRemote: false,
  htmlPreviewCount: 0,
  consecutiveFullFailures: 0,
  dismissedKeys: new Set<string>(),
  sessionId: 'sess-1',
  nextTierTokens: 4096 as number | null,
  lastAssistantText: '',
  lastAssistantTurn: undefined as MessageType.AssistantTurn | undefined,
};

describe('deriveSnapshotFromResult', () => {
  it('maps stopped_limit=1 to length and contextFull=true', () => {
    const result: CompletionResult = {
      text: '',
      content: '',
      tokens_cached: 10,
      tokens_evaluated: 100,
      tokens_predicted: 200,
      stopped_limit: 1,
    };
    const snap = deriveSnapshotFromResult(result, false);
    expect(snap.finishReason).toBe('length');
    expect(snap.contextFull).toBe(true);
    expect(snap.tokensCached).toBe(10);
    expect(snap.tokensEvaluated).toBe(100);
    expect(snap.tokensPredicted).toBe(200);
  });

  it('maps interrupted=true to content_filter', () => {
    const snap = deriveSnapshotFromResult(
      {text: '', content: '', interrupted: true},
      false,
    );
    expect(snap.finishReason).toBe('content_filter');
    expect(snap.contextFull).toBe(false);
  });

  it('maps stopped_word to stop', () => {
    const snap = deriveSnapshotFromResult(
      {text: '', content: '', stopped_word: '</end>'},
      false,
    );
    expect(snap.finishReason).toBe('stop');
  });

  it('maps stopped_eos=true to eos', () => {
    const snap = deriveSnapshotFromResult(
      {text: '', content: '', stopped_eos: true},
      false,
    );
    expect(snap.finishReason).toBe('eos');
  });

  it('falls back to unknown when no terminator field is set', () => {
    const snap = deriveSnapshotFromResult({text: '', content: ''}, false);
    expect(snap.finishReason).toBe('unknown');
  });

  it('flips contextFull true when context_full=true', () => {
    const snap = deriveSnapshotFromResult(
      {text: '', content: '', context_full: true, stopped_eos: true},
      false,
    );
    expect(snap.contextFull).toBe(true);
    // contextFull is independent of finishReason here.
    expect(snap.finishReason).toBe('eos');
  });

  it('flips contextFull true when truncated=true', () => {
    const snap = deriveSnapshotFromResult(
      {text: '', content: '', truncated: true, stopped_eos: true},
      false,
    );
    expect(snap.contextFull).toBe(true);
  });

  it('forces contextFull true when truncationLikely is passed', () => {
    const snap = deriveSnapshotFromResult(
      {text: '', content: '', interrupted: true},
      true,
    );
    expect(snap.contextFull).toBe(true);
  });

  it('defaults missing token fields to 0', () => {
    const snap = deriveSnapshotFromResult({text: '', content: ''}, false);
    expect(snap.tokensCached).toBe(0);
    expect(snap.tokensEvaluated).toBe(0);
    expect(snap.tokensPredicted).toBe(0);
  });
});

describe('resolveBannerVariant', () => {
  it('returns none when there is no snapshot yet', () => {
    const v = resolveBannerVariant({...baseContext, snapshot: null});
    expect(v.kind).toBe('none');
  });

  it('returns context-warning when local ratio >= threshold and not contextFull', () => {
    // cached + eval + predicted = 1700 → 1700/2048 = 0.83 ≥ 0.80
    const snap = snapshot({
      tokensCached: 0,
      tokensEvaluated: 1500,
      tokensPredicted: 200,
    });
    const v = resolveBannerVariant({...baseContext, snapshot: snap});
    expect(v.kind).toBe('context-warning');
    if (v.kind === 'context-warning') {
      expect(v.nextTierTokens).toBe(4096);
      expect(v.ratio).toBeCloseTo(1700 / 2048, 2);
    }
  });

  it('stays at none when local ratio is below threshold', () => {
    const snap = snapshot({tokensEvaluated: 500, tokensPredicted: 100});
    const v = resolveBannerVariant({...baseContext, snapshot: snap});
    expect(v.kind).toBe('none');
  });

  it('returns context-full when snapshot.contextFull is true (local)', () => {
    const snap = snapshot({
      contextFull: true,
      tokensEvaluated: 1900,
      tokensPredicted: 100,
      finishReason: 'length',
    });
    const v = resolveBannerVariant({...baseContext, snapshot: snap});
    expect(v).toEqual({
      kind: 'context-full',
      escalated: false,
      nextTierTokens: 4096,
      heavyTalent: null,
      ratio: 1,
    });
  });

  // truncationLikely propagates via deriveSnapshotFromResult
  it('resolves context-full when the catch path forces contextFull via truncationLikely', () => {
    const snap = deriveSnapshotFromResult(
      {text: '', content: '', interrupted: true},
      true,
    );
    const v = resolveBannerVariant({...baseContext, snapshot: snap});
    expect(v.kind).toBe('context-full');
  });

  // Auto-clear math invariant — the resolver itself does not own the writer
  // (that lives in useChatSession), so we assert the predicate shape: when
  // contextFull is false and the ratio drops, banner is none.
  it('drops back to none after a low-ratio non-full follow-up turn', () => {
    // used=1000, nCtx=2048, runway boundary = 2048-32 = 2016. used<2016 holds.
    const snap = snapshot({tokensEvaluated: 800, tokensPredicted: 200});
    const v = resolveBannerVariant({...baseContext, snapshot: snap});
    expect(v.kind).toBe('none');
    // Sanity check the runway constant exposed by the module.
    expect(AUTOCLEAR_RUNWAY).toBe(32);
  });

  it('returns context-full on remote when finishReason is length', () => {
    const snap = snapshot({contextFull: true, finishReason: 'length'});
    const v = resolveBannerVariant({
      ...baseContext,
      snapshot: snap,
      isRemote: true,
      nextTierTokens: 4096,
    });
    expect(v.kind).toBe('context-full');
    if (v.kind === 'context-full') {
      // Remote sessions never offer a tier — server context is not ours.
      expect(v.nextTierTokens).toBeNull();
      expect(v.heavyTalent).toBeNull();
    }
  });

  it('returns context-remote-hedged when all four weak-signal conditions hold', () => {
    const snap = snapshot({
      tokensPredicted: 850,
      finishReason: 'eos',
    });
    const v = resolveBannerVariant({
      ...baseContext,
      snapshot: snap,
      isRemote: true,
      lastAssistantText: '...and the next step would be to',
    });
    expect(v.kind).toBe('context-remote-hedged');
  });

  it('returns none on a short remote answer (predicted < 500)', () => {
    const snap = snapshot({tokensPredicted: 120, finishReason: 'eos'});
    const v = resolveBannerVariant({
      ...baseContext,
      snapshot: snap,
      isRemote: true,
      lastAssistantText: 'Short answer.',
    });
    expect(v.kind).toBe('none');
  });

  it('does not hedge when the remote reply ends with terminal punctuation', () => {
    const snap = snapshot({tokensPredicted: 850, finishReason: 'eos'});
    const v = resolveBannerVariant({
      ...baseContext,
      snapshot: snap,
      isRemote: true,
      lastAssistantText: 'A long, properly-terminated reply.',
    });
    expect(v.kind).toBe('none');
  });

  it('does not hedge when finishReason is already length (would have been full)', () => {
    // Defensive — variant 1 should have grabbed it before this branch runs.
    const snap = snapshot({
      tokensPredicted: 850,
      finishReason: 'length',
      contextFull: false,
    });
    const v = resolveBannerVariant({
      ...baseContext,
      snapshot: snap,
      isRemote: true,
      lastAssistantText: 'tail without punctuation',
    });
    expect(v.kind).toBe('none');
  });

  it('prefers context-warning over html-soft-cap when both could fire', () => {
    const snap = snapshot({tokensEvaluated: 1500, tokensPredicted: 200});
    const v = resolveBannerVariant({
      ...baseContext,
      snapshot: snap,
      effectiveNCtx: 2048,
      htmlPreviewCount: 5,
    });
    expect(v.kind).toBe('context-warning');
  });

  it('falls through to html-soft-cap when a warning is dismissed', () => {
    const snap = snapshot({tokensEvaluated: 1500, tokensPredicted: 200});
    const v = resolveBannerVariant({
      ...baseContext,
      snapshot: snap,
      htmlPreviewCount: 5,
      dismissedKeys: new Set(['sess-1:context-warning']),
    });
    expect(v.kind).toBe('html-soft-cap');
  });

  it('returns none when html-soft-cap itself is dismissed', () => {
    const v = resolveBannerVariant({
      ...baseContext,
      htmlPreviewCount: 5,
      dismissedKeys: new Set(['sess-1:html-soft-cap']),
    });
    expect(v.kind).toBe('none');
  });

  // Escalation — copy flag flips at the second consecutive full turn.
  it('flags escalated=true when consecutiveFullFailures >= 2', () => {
    const snap = snapshot({contextFull: true});
    const v = resolveBannerVariant({
      ...baseContext,
      snapshot: snap,
      consecutiveFullFailures: 2,
    });
    if (v.kind !== 'context-full') {
      throw new Error(`expected context-full, got ${v.kind}`);
    }
    expect(v.escalated).toBe(true);
  });

  it('keeps escalated=false at one consecutive full turn', () => {
    const snap = snapshot({contextFull: true});
    const v = resolveBannerVariant({
      ...baseContext,
      snapshot: snap,
      consecutiveFullFailures: 1,
    });
    if (v.kind !== 'context-full') {
      throw new Error(`expected context-full, got ${v.kind}`);
    }
    expect(v.escalated).toBe(false);
  });

  // Heavy-talent sub-copy hint when a talent with recommendedContextTokens
  // appears in the just-finished turn's tool calls.
  it('attaches a heavy talent name when the last turn called a heavy talent (local)', () => {
    const heavyTurn: MessageType.AssistantTurn = {
      id: 'asst-1',
      author: {id: 'asst'},
      createdAt: 0,
      type: 'assistant_turn',
      steps: [
        {
          content: '',
          partial: false,
          toolCalls: [
            {
              id: 'tc-1',
              type: 'function',
              function: {name: 'render_html', arguments: '{}'},
            },
          ],
        },
      ],
    } as any;
    const snap = snapshot({contextFull: true});
    const v = resolveBannerVariant({
      ...baseContext,
      snapshot: snap,
      lastAssistantTurn: heavyTurn,
    });
    if (v.kind !== 'context-full') {
      throw new Error(`expected context-full, got ${v.kind}`);
    }
    // Skip the substantive assertion if the talent isn't registered in this
    // test process — bail rather than producing a flaky pass.
    if (talentRegistry.get('render_html')?.recommendedContextTokens) {
      expect(v.heavyTalent).toEqual({name: 'render_html'});
    } else {
      expect(v.heavyTalent).toBeNull();
    }
  });

  it('never attaches heavyTalent on remote sessions', () => {
    const heavyTurn: MessageType.AssistantTurn = {
      id: 'asst-2',
      author: {id: 'asst'},
      createdAt: 0,
      type: 'assistant_turn',
      steps: [
        {
          content: '',
          partial: false,
          toolCalls: [
            {
              id: 'tc-1',
              type: 'function',
              function: {name: 'render_html', arguments: '{}'},
            },
          ],
        },
      ],
    } as any;
    const snap = snapshot({contextFull: true, finishReason: 'length'});
    const v = resolveBannerVariant({
      ...baseContext,
      snapshot: snap,
      isRemote: true,
      lastAssistantTurn: heavyTurn,
    });
    if (v.kind !== 'context-full') {
      throw new Error(`expected context-full, got ${v.kind}`);
    }
    expect(v.heavyTalent).toBeNull();
  });

  // Threshold constant guard — protects the 0.80 pin so a casual edit can't
  // shift the user-visible trigger point without breaking this assertion.
  it('exports WARNING_THRESHOLD = 0.80', () => {
    expect(WARNING_THRESHOLD).toBe(0.8);
  });
});

describe('effectiveNCtx', () => {
  it('returns the session override when present', () => {
    const overrides = new Map<string, number>([['sess-1', 8192]]);
    expect(effectiveNCtx(overrides, 'sess-1', 2048)).toBe(8192);
  });

  it('falls back to baseNCtx when no override is set', () => {
    expect(effectiveNCtx(new Map(), 'sess-1', 2048)).toBe(2048);
  });

  it('falls back to baseNCtx when activeSessionId is null', () => {
    const overrides = new Map<string, number>([['sess-1', 8192]]);
    expect(effectiveNCtx(overrides, null, 2048)).toBe(2048);
  });
});

describe('pickNextTier', () => {
  it('returns the smallest tier strictly greater than current that fits', async () => {
    const fits = jest.fn().mockResolvedValue(true);
    const tier = await pickNextTier(2048, fits);
    expect(tier).toBe(4096);
    expect(fits).toHaveBeenCalledWith(4096);
  });

  it('skips tiers that do not fit memory', async () => {
    const fits = jest.fn(async (n: number) => n >= 8192);
    const tier = await pickNextTier(2048, fits);
    expect(tier).toBe(8192);
  });

  it('returns null when no tier fits memory', async () => {
    const fits = jest.fn().mockResolvedValue(false);
    const tier = await pickNextTier(2048, fits);
    expect(tier).toBeNull();
  });

  it('returns null when current n_ctx is already at the top tier', async () => {
    const fits = jest.fn().mockResolvedValue(true);
    const top = CONTEXT_TIERS[CONTEXT_TIERS.length - 1];
    const tier = await pickNextTier(top, fits);
    expect(tier).toBeNull();
    expect(fits).not.toHaveBeenCalled();
  });
});
