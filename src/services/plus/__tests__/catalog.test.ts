import {PLUS_FEATURES, PLUS_PRODUCT_IDS, isPlusProduct} from '../catalog';

describe('Plus catalog', () => {
  it('lists the four products in ascending price order', () => {
    expect(PLUS_PRODUCT_IDS).toEqual(['plus.1', 'plus.2', 'plus.3', 'plus.4']);
  });

  it.each(['plus.1', 'plus.2', 'plus.3', 'plus.4'])(
    'recognises %s',
    productId => {
      expect(isPlusProduct(productId)).toBe(true);
    },
  );

  it.each(['pal.2', 'plus.10', 'Plus.1', 'plus', 'plus.', '', 'pal.plus.1'])(
    'rejects %p',
    productId => {
      expect(isPlusProduct(productId)).toBe(false);
    },
  );

  it('ships no feature yet', () => {
    expect(PLUS_FEATURES.map(feature => feature.id)).toEqual([
      'handsFreeVoice',
      'localApiServer',
    ]);
    expect(PLUS_FEATURES.every(feature => !feature.shipped)).toBe(true);
  });
});
