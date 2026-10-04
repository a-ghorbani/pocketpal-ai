import {Platform} from 'react-native';

import {
  IapHttpError,
  iapApi,
  REFRESH_MAX_KNOWN,
  REQUEST_TIMEOUT_MS,
  VERIFY_MAX_TRANSACTIONS,
} from '../iapApi';
import {setApiBaseOverride} from '../../palshub/apiBase';
import type {StoreProof} from '../iapWire';
import {
  apiPal,
  jsonResponse,
  verifyResponse,
  version,
} from '../../../../jest/fixtures/iap';

jest.mock('../../palshub/supabase', () => ({
  getAuthHeaders: jest.fn().mockResolvedValue({Authorization: 'Bearer t'}),
}));

const fetchMock = jest.fn();
const androidProof = (n: number): StoreProof => ({
  platform: 'android',
  productId: `pal.${n}`,
  purchaseToken: `token-${n}`,
});

const sentHeaders = (call = 0) => fetchMock.mock.calls[call][1].headers;
const sentBody = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body);

describe('iapApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
    setApiBaseOverride(undefined);
  });

  describe('verify', () => {
    it('posts without auth and with the client headers', async () => {
      fetchMock.mockResolvedValue(jsonResponse(verifyResponse()));
      const results = await iapApi.verify('ios', [
        {platform: 'ios', jws: 'jws-1'},
      ]);

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://palshub.ai/api/mobile/iap/verify',
      );
      expect(fetchMock.mock.calls[0][1].method).toBe('POST');
      expect(sentHeaders()).toEqual({
        'Content-Type': 'application/json',
        'X-IAP-Capable': '1',
        'X-Client-Platform': Platform.OS,
      });
      expect(sentHeaders().Authorization).toBeUndefined();
      expect(sentBody()).toEqual({platform: 'ios', transactions: ['jws-1']});
      expect(results[0].status).toBe('active');
    });

    it('splits 11 Android transactions into two requests and merges results', async () => {
      fetchMock.mockImplementation(async (_url, init) => {
        const {transactions} = JSON.parse(init.body);
        return jsonResponse(
          verifyResponse(
            transactions.map((tx: {productId: string}) => ({
              pal_id: tx.productId,
              status: 'pending',
            })),
          ),
        );
      });
      const proofs = Array.from({length: 11}, (_, i) => androidProof(i));

      const results = await iapApi.verify('android', proofs);

      expect(VERIFY_MAX_TRANSACTIONS.android).toBe(10);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sentBody(0).transactions).toHaveLength(10);
      expect(sentBody(1).transactions).toHaveLength(1);
      expect(results.map(r => r.palId)).toEqual(
        Array.from({length: 11}, (_, i) => `pal.${i}`),
      );
    });

    it('allows 50 iOS transactions per request', async () => {
      fetchMock.mockResolvedValue(jsonResponse({results: []}));
      const proofs: StoreProof[] = Array.from({length: 51}, (_, i) => ({
        platform: 'ios',
        jws: `jws-${i}`,
      }));

      await iapApi.verify('ios', proofs);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sentBody(0).transactions).toHaveLength(50);
      expect(sentBody(1).transactions).toHaveLength(1);
    });

    it('throws an HTTP error on a 5xx', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 503));
      await expect(
        iapApi.verify('ios', [{platform: 'ios', jws: 'j'}]),
      ).rejects.toEqual(new IapHttpError(503));
    });

    it('aborts after the request timeout', () => {
      jest.useFakeTimers();
      let signal: AbortSignal | undefined;
      fetchMock.mockImplementation((_url, init) => {
        signal = init.signal;
        return new Promise(() => {});
      });
      iapApi.verify('ios', [{platform: 'ios', jws: 'j'}]);
      jest.advanceTimersByTime(REQUEST_TIMEOUT_MS - 1);
      expect(signal?.aborted).toBe(false);
      jest.advanceTimersByTime(1);
      expect(signal?.aborted).toBe(true);
      jest.useRealTimers();
    });
  });

  describe('revocation wins for the same purchase', () => {
    const active = {
      pal_id: 'pal-1',
      status: 'active',
      content_version: version(3),
      pal: apiPal(),
      support_code: 'SUP-1',
    };
    const revoked = {pal_id: 'pal-1', status: 'revoked', support_code: 'SUP-1'};

    it('turns an active result revoked when the same purchase is also revoked', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(verifyResponse([active, revoked])),
      );
      const results = await iapApi.verify('ios', [
        {platform: 'ios', jws: 'a'},
        {platform: 'ios', jws: 'b'},
      ]);
      expect(results.map(result => result.status)).toEqual([
        'revoked',
        'revoked',
      ]);
      expect(results[0].pal).toBeUndefined();
    });

    it('applies across merged verify chunks', async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(
            verifyResponse(
              Array.from(
                {length: VERIFY_MAX_TRANSACTIONS.android},
                () => active,
              ),
            ),
          ),
        )
        .mockResolvedValueOnce(jsonResponse(verifyResponse([revoked])));
      const results = await iapApi.verify(
        'android',
        Array.from({length: VERIFY_MAX_TRANSACTIONS.android + 1}, (_, i) =>
          androidProof(i),
        ),
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(new Set(results.map(result => result.status))).toEqual(
        new Set(['revoked']),
      );
    });

    it('keeps an active purchase when a different purchase of the Pal is revoked', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          verifyResponse([
            {...revoked, support_code: 'SUP-A'},
            {...active, support_code: 'SUP-B'},
          ]),
        ),
      );
      const results = await iapApi.verify('ios', [
        {platform: 'ios', jws: 'a'},
        {platform: 'ios', jws: 'b'},
      ]);
      expect(results.map(result => result.status)).toEqual([
        'revoked',
        'active',
      ]);
    });

    it('drops a changed pal that the refresh also revokes, across chunks', async () => {
      let call = 0;
      fetchMock.mockImplementation(async () => {
        call += 1;
        return jsonResponse(
          call === 1 ? {changed: [apiPal()]} : {revoked: ['pal-1']},
        );
      });
      const known = Object.fromEntries(
        Array.from({length: REFRESH_MAX_KNOWN + 1}, (_, i) => [
          `pal-${i}`,
          {contentVersion: version(1), purchaseRef: `ref-${i}`},
        ]),
      );
      const result = await iapApi.refresh('android', [], known);
      expect(result.changed).toEqual([]);
      expect(result.revoked).toEqual(['pal-1']);
    });
  });

  describe('refresh', () => {
    it('posts proofs and known versions without auth', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({changed: [apiPal()], revoked: ['pal-2']}),
      );

      const result = await iapApi.refresh('android', [androidProof(1)], {
        'pal-1': {contentVersion: version(2), purchaseRef: 'GPA.1'},
      });

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://palshub.ai/api/mobile/iap/entitlements/refresh',
      );
      expect(sentHeaders().Authorization).toBeUndefined();
      expect(sentHeaders()['X-IAP-Capable']).toBe('1');
      expect(sentBody()).toEqual({
        platform: 'android',
        transactions: [{productId: 'pal.1', purchaseToken: 'token-1'}],
        known: {'pal-1': {content_version: version(2), purchase_ref: 'GPA.1'}},
      });
      expect(result.changed[0].pal.id).toBe('pal-1');
      expect(result.revoked).toEqual(['pal-2']);
    });

    it('splits 201 known entries into two requests and unions the lists', async () => {
      let call = 0;
      fetchMock.mockImplementation(async () => {
        call += 1;
        return jsonResponse(
          call === 1
            ? {changed: [apiPal()], revoked: ['a'], unchanged: ['u1']}
            : {
                changed: [apiPal({change_note: 'Typo fixed'})],
                removed: ['b'],
                revoked: ['a'],
                unchanged: ['u2'],
              },
        );
      });
      const known = Object.fromEntries(
        Array.from({length: 201}, (_, i) => [
          `pal-${i}`,
          {contentVersion: version(1), purchaseRef: `ref-${i}`},
        ]),
      );

      const result = await iapApi.refresh('android', [androidProof(1)], known);

      expect(REFRESH_MAX_KNOWN).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(Object.keys(sentBody(0).known)).toHaveLength(200);
      expect(sentBody(1).known).toEqual({
        'pal-200': {content_version: version(1), purchase_ref: 'ref-200'},
      });
      expect(sentBody(1).transactions).toEqual([]);
      expect(result).toEqual({
        changed: [
          expect.objectContaining({
            pal: expect.objectContaining({id: 'pal-1'}),
            changeNote: 'Typo fixed',
          }),
        ],
        revoked: ['a'],
        removed: ['b'],
        unchanged: ['u1', 'u2'],
      });
    });

    it('splits 11 Android proofs into two requests within the caps and merges the lists', async () => {
      let call = 0;
      fetchMock.mockImplementation(async () => {
        call += 1;
        return jsonResponse(
          call === 1
            ? {changed: [apiPal()], unchanged: ['u1']}
            : {revoked: ['r1'], unchanged: ['u2']},
        );
      });
      const proofs = Array.from({length: 11}, (_, i) => androidProof(i));
      const known = {
        'pal-1': {contentVersion: version(1), purchaseRef: 'GPA.1'},
      };

      const result = await iapApi.refresh('android', proofs, known);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(sentBody(0).transactions).toHaveLength(10);
      expect(sentBody(0).known).toEqual({
        'pal-1': {content_version: version(1), purchase_ref: 'GPA.1'},
      });
      expect(sentBody(1).transactions).toEqual([
        {productId: 'pal.10', purchaseToken: 'token-10'},
      ]);
      expect(sentBody(1).known).toEqual({});
      expect(result.changed.map(entry => entry.pal.id)).toEqual(['pal-1']);
      expect(result.revoked).toEqual(['r1']);
      expect(result.unchanged).toEqual(['u1', 'u2']);
    });

    it('sends one request when nothing is known', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}));
      await iapApi.refresh('android', [androidProof(1)], {});
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sentBody().known).toEqual({});
    });
  });

  describe('link', () => {
    it('sends auth and reports linked', async () => {
      fetchMock.mockResolvedValue(jsonResponse(null));
      await expect(iapApi.link('android', [androidProof(1)])).resolves.toBe(
        'linked',
      );
      expect(sentHeaders().Authorization).toBe('Bearer t');
      expect(sentHeaders()['X-Client-Platform']).toBe(Platform.OS);
    });

    it('maps 409 to conflict', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 409));
      await expect(iapApi.link('android', [androidProof(1)])).resolves.toBe(
        'conflict',
      );
    });

    it('throws on other failures', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, 500));
      await expect(
        iapApi.link('android', [androidProof(1)]),
      ).rejects.toBeInstanceOf(IapHttpError);
    });
  });

  describe('binding', () => {
    it('gets the binding with auth', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          apple_app_account_token: 'uuid',
          google_obfuscated_account_id: 'hash',
        }),
      );
      await expect(iapApi.binding()).resolves.toEqual({
        appAccountToken: 'uuid',
        obfuscatedAccountId: 'hash',
      });
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://palshub.ai/api/mobile/iap/binding',
      );
      expect(fetchMock.mock.calls[0][1].method).toBe('GET');
      expect(sentHeaders().Authorization).toBe('Bearer t');
    });
  });

  it('follows the e2e base override', async () => {
    fetchMock.mockResolvedValue(jsonResponse({results: []}));
    setApiBaseOverride('http://127.0.0.1:8787');
    await iapApi.verify('ios', [{platform: 'ios', jws: 'j'}]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://127.0.0.1:8787/api/mobile/iap/verify',
    );
  });
});
