import androidBundledRules from '../../../store/bundledDeviceRules/rules.android.json';
import iosBundledRules from '../../../store/bundledDeviceRules/rules.ios.json';
import {parseDeviceRules} from '../parse';
import {Tier} from '../types';

const TIERS: Tier[] = ['low', 'mid', 'high', 'flagship'];

type RawCandidate = {model: string; draft?: unknown; mmproj?: unknown};

const hasKeyDeep = (value: unknown, key: string): boolean => {
  if (Array.isArray(value)) {
    return value.some(item => hasKeyDeep(item, key));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).some(
      ([k, v]) => k === key || hasKeyDeep(v, key),
    );
  }
  return false;
};

describe.each([
  ['android', androidBundledRules],
  ['ios', iosBundledRules],
] as const)('bundled %s rules', (_platform, raw) => {
  it('carries no min_app_version anywhere', () => {
    expect(hasKeyDeep(raw, 'min_app_version')).toBe(false);
  });

  it('parses identically under a known and an unknown app version', () => {
    expect(parseDeviceRules(raw, '1.17.3')).toEqual(
      parseDeviceRules(raw, 'unknown'),
    );
  });

  it('is a schema 2.0.0 document that keeps every candidate', () => {
    const rules = parseDeviceRules(raw, '1.17.3');
    expect(rules.schemaVersion).toBe('2.0.0');
    for (const tier of TIERS) {
      const rawCandidates = (
        raw.tiers as Record<Tier, {candidates: RawCandidate[]}>
      )[tier].candidates;
      const models = rules.tiers[tier].models;
      expect(models.map(m => m.model)).toEqual(rawCandidates.map(c => c.model));
      models.forEach((m, i) => {
        expect(m.draft !== undefined).toBe(
          rawCandidates[i].draft !== undefined,
        );
        expect(m.mmproj !== undefined).toBe(
          rawCandidates[i].mmproj !== undefined,
        );
      });
    }
  });
});
