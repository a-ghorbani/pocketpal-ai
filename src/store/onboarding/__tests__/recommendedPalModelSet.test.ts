import {defaultModels} from '../../defaultModels';
import {ModelOrigin} from '../../../utils/types';
import {RECOMMENDED_PAL_MODEL_SET} from '../recommendedPalModelSet';

describe('RECOMMENDED_PAL_MODEL_SET', () => {
  it('contains exactly 3 entries', () => {
    expect(RECOMMENDED_PAL_MODEL_SET).toHaveLength(3);
  });

  it('lists tiers in the canonical Quick / Balanced / Best order', () => {
    expect(RECOMMENDED_PAL_MODEL_SET.map(e => e.tier)).toEqual([
      'quick',
      'balanced',
      'best',
    ]);
  });

  it('marks exactly one entry as Recommended (the Balanced tier)', () => {
    const recommended = RECOMMENDED_PAL_MODEL_SET.filter(e => e.recommended);
    expect(recommended).toHaveLength(1);
    expect(recommended[0].tier).toBe('balanced');
  });

  it.each(RECOMMENDED_PAL_MODEL_SET.map(e => [e.modelId, e.tier] as const))(
    'tier %s model %s exists in defaultModels with origin PRESET',
    (modelId, _tier) => {
      const model = defaultModels.find(m => m.id === modelId);
      expect(model).toBeDefined();
      expect(model?.origin).toBe(ModelOrigin.PRESET);
    },
  );

  it('every entry uses one of the canonical quants (Q2_K / Q4_K_M / Q8_0)', () => {
    for (const entry of RECOMMENDED_PAL_MODEL_SET) {
      expect(['Q2_K', 'Q4_K_M', 'Q8_0']).toContain(entry.quant);
    }
  });
});
