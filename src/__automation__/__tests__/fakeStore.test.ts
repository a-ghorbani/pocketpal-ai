import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {fakeStore, FAKE_STORE_KEY} from '../fakeStore';
import {getApiBase} from '../../services/palshub/apiBase';

jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    clear: jest.fn(async () => values.clear()),
  };
});

const originalOS = Platform.OS;
const setOS = (os: 'ios' | 'android') => {
  (Platform as any).OS = os;
};

describe('fakeStore', () => {
  beforeEach(async () => {
    setOS('ios');
    await AsyncStorage.clear();
    await fakeStore.run('reset');
  });

  afterAll(() => {
    setOS(originalOS as 'ios' | 'android');
  });

  it('overrides the API base and restores it after a relaunch', async () => {
    await fakeStore.run('api::http://127.0.0.1:8787');
    expect(getApiBase()).toBe('http://127.0.0.1:8787');

    await fakeStore.run('reset');
    await AsyncStorage.setItem(
      FAKE_STORE_KEY,
      JSON.stringify({apiBase: 'http://127.0.0.1:9999'}),
    );
    await fakeStore.restore();
    expect(getApiBase()).toBe('http://127.0.0.1:9999');
  });

  it('serves only scripted products with their price strings', async () => {
    await fakeStore.run('products::pal.a=4,99 €|pal.b=¥450');
    await expect(
      fakeStore.fetchProducts(['pal.a', 'pal.b', 'pal.c']),
    ).resolves.toEqual([
      {productId: 'pal.a', displayPrice: '4,99 €'},
      {productId: 'pal.b', displayPrice: '¥450'},
    ]);
  });

  it('purchases by default, emits the transaction and keeps it unfinished on iOS', async () => {
    const listener = jest.fn();
    const unsubscribe = fakeStore.onTransaction(listener);
    const outcome = await fakeStore.purchase('pal.a', {appAccountToken: 'u'});
    unsubscribe();

    expect(outcome.kind).toBe('purchased');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(fakeStore.lastBinding).toEqual({appAccountToken: 'u'});
    const [tx] = await fakeStore.unfinished();
    expect(tx.proof).toEqual({platform: 'ios', jws: expect.any(String)});

    await fakeStore.finish(tx);
    await expect(fakeStore.unfinished()).resolves.toEqual([]);
    await expect(fakeStore.currentEntitlements()).resolves.toHaveLength(1);
  });

  it('applies next outcomes once', async () => {
    await fakeStore.run('next::cancelled');
    await expect(fakeStore.purchase('pal.a', null)).resolves.toEqual({
      kind: 'cancelled',
    });
    await expect(fakeStore.purchase('pal.a', null)).resolves.toMatchObject({
      kind: 'purchased',
    });
  });

  it.each([
    ['error:developer-error', {kind: 'error', downgrade: true}],
    ['error:network-error', {kind: 'error', downgrade: false}],
    ['already_owned', {kind: 'already_owned'}],
  ])('maps next::%s', async (next, expected) => {
    await fakeStore.run(`next::${next}`);
    await expect(fakeStore.purchase('pal.a', null)).resolves.toMatchObject(
      expected,
    );
  });

  it('keeps an already-owned product entitled', async () => {
    await fakeStore.run('next::already_owned');
    await fakeStore.purchase('pal.a', null);
    const txs = await fakeStore.currentEntitlements();
    expect(txs.map(tx => tx.productId)).toEqual(['pal.a']);
  });

  it('holds a pending purchase until approved, then emits it', async () => {
    await fakeStore.run('next::pending');
    await expect(fakeStore.purchase('pal.a', null)).resolves.toEqual({
      kind: 'pending',
    });
    await expect(fakeStore.currentEntitlements()).resolves.toEqual([]);

    const listener = jest.fn();
    const unsubscribe = fakeStore.onTransaction(listener);
    await fakeStore.run('approve_pending');
    unsubscribe();

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({productId: 'pal.a', state: 'purchased'}),
    );
    await expect(fakeStore.currentEntitlements()).resolves.toHaveLength(1);
  });

  it('lists pending purchases on Android and drops declined ones', async () => {
    setOS('android');
    await fakeStore.run('next::pending');
    await fakeStore.purchase('pal.a', null);
    const [pendingTx] = await fakeStore.currentEntitlements();
    expect(pendingTx.state).toBe('pending');
    expect(pendingTx.proof.platform).toBe('android');

    await fakeStore.run('decline_pending');
    await expect(fakeStore.currentEntitlements()).resolves.toEqual([]);
  });

  it('never finishes on Android', async () => {
    setOS('android');
    await fakeStore.purchase('pal.a', null);
    const [tx] = await fakeStore.currentEntitlements();
    await fakeStore.finish(tx);
    expect(fakeStore.finished).toEqual([]);
  });

  it('entitles, refunds and seeds unfinished transactions', async () => {
    await fakeStore.run('entitle::pal.a');
    await fakeStore.run('unfinished::pal.b');
    expect((await fakeStore.unfinished()).map(tx => tx.productId)).toEqual([
      'pal.b',
    ]);
    await fakeStore.run('refund::pal.a');
    expect(
      (await fakeStore.currentEntitlements()).map(tx => tx.productId),
    ).toEqual(['pal.b']);
  });

  it('reports unavailable billing', async () => {
    await fakeStore.run('unavailable');
    await expect(fakeStore.init()).resolves.toBe(false);
    expect(fakeStore.queryOk).toBe(false);
    await fakeStore.run('unavailable::off');
    await expect(fakeStore.init()).resolves.toBe(true);
  });

  it('counts store syncs', async () => {
    await fakeStore.sync();
    expect(JSON.parse(await fakeStore.run('read')).syncCount).toBe(1);
  });

  it('reloads its backlog from storage after a relaunch', async () => {
    await fakeStore.run('products::pal.a=$4.99');
    await fakeStore.purchase('pal.a', null);
    await fakeStore.run('next::pending');

    await fakeStore.restore();

    expect(await fakeStore.unfinished()).toHaveLength(1);
    await expect(fakeStore.fetchProducts(['pal.a'])).resolves.toHaveLength(1);
    expect(JSON.parse(await fakeStore.run('read')).next).toBe('pending');
  });

  it('answers unknown verbs without throwing', async () => {
    await expect(fakeStore.run('bogus')).resolves.toContain('unknown');
  });
});
