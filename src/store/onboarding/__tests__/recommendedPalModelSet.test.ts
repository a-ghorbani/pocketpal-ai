import {defaultModels} from '../../defaultModels';
import {ModelOrigin} from '../../../utils/types';
import {RECOMMENDED_PAL_MODEL_SET} from '../recommendedPalModelSet';

const MAX_SMALL_TIER_BYTES = 2.5 * 1024 * 1024 * 1024; // 2.5 GiB

describe('RECOMMENDED_PAL_MODEL_SET', () => {
  it('contains exactly 3 ids', () => {
    expect(RECOMMENDED_PAL_MODEL_SET).toHaveLength(3);
  });

  it.each(RECOMMENDED_PAL_MODEL_SET.map(id => [id] as const))(
    '%s exists in defaultModels with origin PRESET',
    id => {
      const model = defaultModels.find(m => m.id === id);
      expect(model).toBeDefined();
      expect(model?.origin).toBe(ModelOrigin.PRESET);
    },
  );

  it.each(RECOMMENDED_PAL_MODEL_SET.map(id => [id] as const))(
    '%s stays within the small-tier size bound (<=2.5 GiB)',
    id => {
      const model = defaultModels.find(m => m.id === id);
      expect(model?.size ?? 0).toBeLessThanOrEqual(MAX_SMALL_TIER_BYTES);
    },
  );
});
