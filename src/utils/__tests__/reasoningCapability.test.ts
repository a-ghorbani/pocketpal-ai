import {Model, ModelOrigin} from '../types';
import {
  ReasoningCapability,
  resolveReasoningCapability,
  orderEffortValues,
  EFFORT_LEVELS,
} from '../reasoningCapability';
import en from '../../locales/en.json';

const localModel = (overrides: Partial<Model> = {}): Model =>
  ({
    id: 'local-1',
    origin: ModelOrigin.PRESET,
    ...overrides,
  }) as Model;

const remoteModel = (overrides: Partial<Model> = {}): Model =>
  ({
    id: 'server-1/remote-x',
    origin: ModelOrigin.REMOTE,
    ...overrides,
  }) as Model;

const cap = (
  overrides: Partial<ReasoningCapability> = {},
): ReasoningCapability => ({
  isReasoning: 'yes',
  source: 'detected',
  supportsEffort: false,
  effortValues: [],
  effortSource: 'none',
  ...overrides,
});

describe('resolveReasoningCapability', () => {
  it('returns unknown for no model (fail-open)', () => {
    expect(resolveReasoningCapability(undefined, {})).toMatchObject({
      isReasoning: 'unknown',
      source: 'unknown',
    });
  });

  it('local model reads model.reasoning', () => {
    const m = localModel();
    m.reasoning = cap({isReasoning: 'yes', source: 'learned'});
    expect(resolveReasoningCapability(m, {})).toMatchObject({
      isReasoning: 'yes',
      source: 'learned',
    });
  });

  it('remote model reads the keyed remoteReasoning map', () => {
    const m = remoteModel();
    const remote = {
      'server-1/remote-x': cap({isReasoning: 'yes', source: 'user'}),
    };
    expect(resolveReasoningCapability(m, remote)).toMatchObject({
      isReasoning: 'yes',
      source: 'user',
    });
  });

  it('user source wins precedence over detection', () => {
    const m = localModel();
    m.supportsThinking = false; // detection said no
    m.reasoning = cap({isReasoning: 'yes', source: 'user'});
    expect(resolveReasoningCapability(m, {})).toMatchObject({
      isReasoning: 'yes',
      source: 'user',
    });
  });

  it('legacy fallback: supportsThinking true → yes/detected', () => {
    const m = localModel();
    m.supportsThinking = true;
    expect(resolveReasoningCapability(m, {})).toMatchObject({
      isReasoning: 'yes',
      source: 'detected',
    });
  });

  it('legacy fallback: supportsThinking false → no/detected', () => {
    const m = localModel();
    m.supportsThinking = false;
    expect(resolveReasoningCapability(m, {})).toMatchObject({
      isReasoning: 'no',
      source: 'detected',
    });
  });

  it('legacy fallback: neither reasoning nor supportsThinking → unknown', () => {
    const m = localModel();
    expect(resolveReasoningCapability(m, {})).toMatchObject({
      isReasoning: 'unknown',
      source: 'unknown',
    });
  });

  it('axis-2 is independent of axis-1 (graded effort on yes)', () => {
    const m = localModel();
    m.reasoning = cap({
      isReasoning: 'yes',
      source: 'user',
      supportsEffort: true,
      effortValues: ['low', 'medium', 'high'],
      effortSource: 'user',
    });
    const r = resolveReasoningCapability(m, {});
    expect(r.supportsEffort).toBe(true);
    expect(r.effortValues).toEqual(['low', 'medium', 'high']);
  });

  it("axis-2 is inert when axis-1 is 'no'", () => {
    const m = localModel();
    m.reasoning = cap({
      isReasoning: 'no',
      source: 'user',
      supportsEffort: true,
      effortValues: ['low', 'high'],
      effortSource: 'user',
    });
    const r = resolveReasoningCapability(m, {});
    expect(r.isReasoning).toBe('no');
    expect(r.supportsEffort).toBe(false);
    expect(r.effortValues).toEqual([]);
    expect(r.effortSource).toBe('none');
  });

  it("isReasoning 'unknown' is preserved (pill fail-open)", () => {
    const m = remoteModel();
    expect(resolveReasoningCapability(m, {}).isReasoning).toBe('unknown');
  });
});

describe('orderEffortValues', () => {
  it('orders a selection canonically lowest→highest', () => {
    expect(orderEffortValues(['high', 'low'])).toEqual(['low', 'high']);
    expect(orderEffortValues(['max', 'minimal', 'high'])).toEqual([
      'minimal',
      'high',
      'max',
    ]);
    expect(orderEffortValues(['medium', 'high', 'low'])).toEqual([
      'low',
      'medium',
      'high',
    ]);
  });

  it('drops values outside the canonical set', () => {
    expect(orderEffortValues(['high', 'extreme', 'low'])).toEqual([
      'low',
      'high',
    ]);
  });

  it('returns an empty array for an empty selection', () => {
    expect(orderEffortValues([])).toEqual([]);
  });

  it('exposes the six canonical levels in intensity order', () => {
    expect(EFFORT_LEVELS).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);
  });
});

describe('effortLevels l10n table', () => {
  it('keeps en.json effortLevels keys in lockstep with EFFORT_LEVELS', () => {
    const labelKeys = Object.keys(
      en.components.modelSettingsSheet.effortLevels,
    ).sort();
    expect(labelKeys).toEqual([...EFFORT_LEVELS].sort());
  });
});
