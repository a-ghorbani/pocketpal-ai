import AsyncStorage from '@react-native-async-storage/async-storage';

import {fakeStore} from '../fakeStore';
import {PLUS_SHIP_KEY, plusShipOverride} from '../plusShipOverride';
import {isPlusAvailable} from '../../services/plus/gate';
import {shipOverride} from '../../services/plus/shipOverride';

jest.mock('../../services/plus/catalog', () =>
  require('../../../jest/fixtures/plus').mockUnshippedCatalog(),
);

jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      values.delete(key);
    }),
    clear: jest.fn(async () => values.clear()),
  };
});

const shipped = () => [...shipOverride.get()];

describe('plusShipOverride', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await plusShipOverride.set('none');
  });

  afterEach(() => {
    (global as any).__E2E__ = true;
  });

  it('marks a feature shipped so Plus becomes reachable', async () => {
    await expect(plusShipOverride.set('handsFreeVoice')).resolves.toBe(
      'PLUS_SHIP_OVERRIDE handsFreeVoice',
    );

    expect(shipped()).toEqual(['handsFreeVoice']);
    expect(isPlusAvailable()).toBe(true);
  });

  it('accepts several features and clears with none', async () => {
    await plusShipOverride.set('handsFreeVoice,localApiServer');
    expect(shipped()).toEqual(['handsFreeVoice', 'localApiServer']);

    await expect(plusShipOverride.set('none')).resolves.toBe(
      'PLUS_SHIP_OVERRIDE none',
    );
    expect(shipped()).toEqual([]);
    expect(isPlusAvailable()).toBe(false);
  });

  it('rejects an unknown feature and keeps the current set', async () => {
    await plusShipOverride.set('handsFreeVoice');

    await expect(plusShipOverride.set('localApiServer,nope')).resolves.toBe(
      'PLUS_SHIP_OVERRIDE unknown feature: nope',
    );

    expect(shipped()).toEqual(['handsFreeVoice']);
    expect(await AsyncStorage.getItem(PLUS_SHIP_KEY)).toBe(
      JSON.stringify(['handsFreeVoice']),
    );
  });

  it('restores the stored set on the next launch', async () => {
    await AsyncStorage.setItem(
      PLUS_SHIP_KEY,
      JSON.stringify(['localApiServer']),
    );

    await plusShipOverride.restore();

    expect(shipped()).toEqual(['localApiServer']);
  });

  it.each(['not json', '{"a":1}', '[1,"gone"]'])(
    'restores nothing usable from %p',
    async raw => {
      await plusShipOverride.set('handsFreeVoice');
      await AsyncStorage.setItem(PLUS_SHIP_KEY, raw);

      await plusShipOverride.restore();

      expect(shipped()).toEqual([]);
    },
  );

  it('is reachable through the FakeStore command surface', async () => {
    await expect(fakeStore.run('plus_ship::handsFreeVoice')).resolves.toBe(
      'PLUS_SHIP_OVERRIDE handsFreeVoice',
    );
    expect(shipped()).toEqual(['handsFreeVoice']);
  });

  it('is cleared, in memory and storage, by a FakeStore reset', async () => {
    await fakeStore.run('plus_ship::handsFreeVoice');

    await fakeStore.run('reset');

    expect(shipped()).toEqual([]);
    expect(await AsyncStorage.getItem(PLUS_SHIP_KEY)).toBe('[]');
  });

  it('does nothing outside e2e builds', async () => {
    (global as any).__E2E__ = false;

    await plusShipOverride.set('handsFreeVoice');

    expect(shipped()).toEqual([]);
    expect(isPlusAvailable()).toBe(false);
  });
});
