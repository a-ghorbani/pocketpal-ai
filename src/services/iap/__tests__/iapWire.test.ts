import {
  IapWireError,
  parseBinding,
  parseRefresh,
  parseVerify,
  refreshBody,
  verifyBody,
} from '../iapWire';
import {apiPal, verifyResponse} from '../../../../jest/fixtures/iap';

describe('iapWire', () => {
  describe('bodies', () => {
    it('sends the JWS for iOS and product plus token for Android', () => {
      expect(verifyBody('ios', [{platform: 'ios', jws: 'jws-1'}])).toEqual({
        platform: 'ios',
        transactions: ['jws-1'],
      });
      expect(
        verifyBody('android', [
          {platform: 'android', productId: 'pal.a', purchaseToken: 'tok'},
        ]),
      ).toEqual({
        platform: 'android',
        transactions: [{productId: 'pal.a', purchaseToken: 'tok'}],
      });
    });

    it('sends proofs and known versions on refresh', () => {
      expect(
        refreshBody([{platform: 'ios', jws: 'jws-1'}], {'pal-1': 3}),
      ).toEqual({transactions: ['jws-1'], known: {'pal-1': 3}});
    });
  });

  describe('parseVerify', () => {
    it('maps an active result with its pal and support code', () => {
      const [result] = parseVerify(verifyResponse());
      expect(result.palId).toBe('pal-1');
      expect(result.status).toBe('active');
      expect(result.contentVersion).toBe(3);
      expect(result.supportCode).toBe('SUP-1');
      expect(result.pal?.system_prompt).toBe('You tell stories.');
      expect(result.pal?.store_product_id).toBe(
        'pal.0123456789abcdef0123456789abcdef',
      );
    });

    it.each([
      'pending',
      'revoked',
      'removed',
      'unfulfillable',
      'invalid',
      'unavailable',
    ])('keeps the %s status', status => {
      const [result] = parseVerify(
        verifyResponse([{pal_id: 'pal-1', status, support_code: 'SUP-2'}]),
      );
      expect(result.status).toBe(status);
      expect(result.pal).toBeUndefined();
    });

    it.each([undefined, ''])(
      'treats an active result with system prompt %p as failed',
      prompt => {
        const [result] = parseVerify(
          verifyResponse([
            {
              pal_id: 'pal-1',
              status: 'active',
              pal: apiPal({system_prompt: prompt}),
            },
          ]),
        );
        expect(result.status).toBe('failed');
      },
    );

    it('treats an active result without a pal as failed', () => {
      const [result] = parseVerify(
        verifyResponse([{pal_id: 'pal-1', status: 'active'}]),
      );
      expect(result.status).toBe('failed');
    });

    it.each([
      null,
      'text',
      {},
      {results: 'x'},
      {results: [{status: 'active'}]},
      {results: [{pal_id: 'pal-1', status: 'granted'}]},
      {results: [{pal_id: 'pal-1', status: 'active', pal: {title: 'x'}}]},
    ])('throws on an unparseable body %p', body => {
      expect(() => parseVerify(body)).toThrow(IapWireError);
    });

    it('tolerates a missing sample exchange and drops a malformed one', () => {
      const [withNone] = parseVerify(verifyResponse());
      expect(withNone.pal?.sample_exchange).toBeUndefined();
      const [withBad] = parseVerify(
        verifyResponse([
          {
            pal_id: 'pal-1',
            status: 'active',
            pal: apiPal({sample_exchange: [{role: 'x', text: 1}]}),
          },
        ]),
      );
      expect(withBad.pal?.sample_exchange).toBeUndefined();
      const [withGood] = parseVerify(
        verifyResponse([
          {
            pal_id: 'pal-1',
            status: 'active',
            pal: apiPal({
              sample_exchange: [
                {role: 'user', text: 'Hi'},
                {role: 'pal', text: 'Once upon a time'},
              ],
            }),
          },
        ]),
      );
      expect(withGood.pal?.sample_exchange).toHaveLength(2);
    });
  });

  describe('parseRefresh', () => {
    it('maps all four lists', () => {
      const result = parseRefresh({
        changed: [apiPal({content_version: 4})],
        revoked: ['pal-2'],
        removed: ['pal-3'],
        unchanged: ['pal-4'],
      });
      expect(result.changed[0].content_version).toBe(4);
      expect(result.revoked).toEqual(['pal-2']);
      expect(result.removed).toEqual(['pal-3']);
      expect(result.unchanged).toEqual(['pal-4']);
    });

    it('treats missing lists as empty', () => {
      expect(parseRefresh({})).toEqual({
        changed: [],
        revoked: [],
        removed: [],
        unchanged: [],
      });
    });

    it.each([null, {revoked: 'pal-2'}, {changed: {}}, {removed: [1]}])(
      'throws on %p',
      body => {
        expect(() => parseRefresh(body)).toThrow(IapWireError);
      },
    );
  });

  describe('parseBinding', () => {
    it('maps both binding values', () => {
      expect(
        parseBinding({
          apple_app_account_token: 'uuid',
          google_obfuscated_account_id: 'hash',
        }),
      ).toEqual({appAccountToken: 'uuid', obfuscatedAccountId: 'hash'});
    });

    it('throws on a non-object', () => {
      expect(() => parseBinding('x')).toThrow(IapWireError);
    });
  });
});
