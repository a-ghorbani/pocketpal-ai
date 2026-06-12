import {defaultModels} from '../../defaultModels';
import {ModelOrigin} from '../../../utils/types';
import {
  ONBOARDING_PALS,
  TOPIC_TO_PAL,
  entryId,
  resolvePalForTopic,
} from '../onboardingPals';
import {TOPIC_KEYS} from '../types';

describe('onboardingPals', () => {
  it('exposes five pals (pip/codie/sage/echo/muse)', () => {
    expect(ONBOARDING_PALS.map(p => p.key)).toEqual([
      'pip',
      'codie',
      'sage',
      'echo',
      'muse',
    ]);
  });

  it('maps every topic key to a pal; else falls back to pip', () => {
    for (const key of TOPIC_KEYS) {
      expect(TOPIC_TO_PAL[key]).toBeDefined();
    }
    expect(TOPIC_TO_PAL.else.key).toBe('pip');
    expect(TOPIC_TO_PAL.smartchat.key).toBe('pip');
  });

  it('resolvePalForTopic handles null (treated as else → pip)', () => {
    expect(resolvePalForTopic(null).key).toBe('pip');
  });

  it.each(ONBOARDING_PALS.map(p => [p.key, p] as const))(
    'pal %s has 3 tiers in quick/balanced/best order with exactly one recommended (balanced)',
    (_key, pal) => {
      expect(pal.models).toHaveLength(3);
      expect(pal.models.map(m => m.tier)).toEqual([
        'quick',
        'balanced',
        'best',
      ]);
      const recommended = pal.models.filter(m => m.recommended);
      expect(recommended).toHaveLength(1);
      expect(recommended[0].tier).toBe('balanced');
    },
  );

  it.each(
    ONBOARDING_PALS.flatMap(p =>
      p.models
        .filter(m => m.origin === 'preset')
        .map(m => [p.key, m.tier, entryId(m)] as const),
    ),
  )('%s/%s references PRESET model %s', (_palKey, _tier, modelId) => {
    const model = defaultModels.find(m => m.id === modelId);
    expect(model).toBeDefined();
    expect(model?.origin).toBe(ModelOrigin.PRESET);
  });
});
