import {l10n} from '../../locales';
import {ASR_TIER_ORDER} from '../../services/asr/constants';
import {asrTierHint, asrTierLabel} from '../asrTierLabel';

describe('asrTierLabel', () => {
  it('names every tier', () => {
    expect(ASR_TIER_ORDER.map(tier => asrTierLabel(tier, l10n.en))).toEqual([
      'Base',
      'Small',
      'Large Turbo',
    ]);
  });

  it('gives every tier its hint', () => {
    expect(ASR_TIER_ORDER.map(tier => asrTierHint(tier, l10n.en))).toEqual([
      'Default, fast',
      'More accurate, slower. Better for other languages',
      'Very slow on most phones',
    ]);
  });
});
