import {version as shippedVersion} from '../../../../package.json';
import androidBundledRules from '../../../store/bundledDeviceRules/rules.android.json';
import iosBundledRules from '../../../store/bundledDeviceRules/rules.ios.json';
import {parseDeviceRules} from '../parse';
import {Tier} from '../types';

const TIERS: Tier[] = ['low', 'mid', 'high', 'flagship'];

type Gateable = {min_app_version?: unknown};
type RawCandidate = Gateable & {
  model: string;
  draft?: Gateable;
  mmproj?: Gateable;
};

const rawCandidatesOf = (raw: unknown, tier: Tier): RawCandidate[] =>
  (raw as {tiers: Record<Tier, {candidates: RawCandidate[]}>}).tiers[tier]
    .candidates;

const isGated = (value: Gateable | undefined): boolean =>
  value?.min_app_version !== undefined;

describe.each([
  ['android', androidBundledRules],
  ['ios', iosBundledRules],
] as const)('bundled %s rules', (_platform, raw) => {
  it('is a schema 2.0.0 document that keeps every candidate at the shipped app version', () => {
    const rules = parseDeviceRules(raw, shippedVersion);
    expect(rules.schemaVersion).toBe('2.0.0');
    for (const tier of TIERS) {
      const rawCandidates = rawCandidatesOf(raw, tier);
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

  it('drops only the gated candidates under an unknown app version', () => {
    const shipped = parseDeviceRules(raw, shippedVersion);
    const unknown = parseDeviceRules(raw, 'unknown');
    for (const tier of TIERS) {
      const rawCandidates = rawCandidatesOf(raw, tier);
      expect(unknown.tiers[tier].models).toEqual(
        shipped.tiers[tier].models.filter(
          (_m, i) => !isGated(rawCandidates[i]),
        ),
      );
    }
  });

  it('gates no mmproj or draft', () => {
    for (const tier of TIERS) {
      for (const c of rawCandidatesOf(raw, tier)) {
        expect(isGated(c.mmproj)).toBe(false);
        expect(isGated(c.draft)).toBe(false);
      }
    }
  });

  it('keeps an ungated candidate in every tier', () => {
    for (const tier of TIERS) {
      expect(rawCandidatesOf(raw, tier).some(c => !isGated(c))).toBe(true);
    }
  });
});
