/**
 * PluginStorage tests.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    getAllKeys: jest.fn(),
    multiRemove: jest.fn(),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {PluginStorageImpl, clearAllPluginStorage, pluginStorageKey} from '../PluginStorage';

const mockStorage: Record<string, string> = {};

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(mockStorage[key] || null),
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation((key, val) => {
    mockStorage[key] = val;
    return Promise.resolve();
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation((key: string) => {
    delete mockStorage[key];
    return Promise.resolve();
  });
  (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(() =>
    Promise.resolve(Object.keys(mockStorage)),
  );
  (AsyncStorage.multiRemove as jest.Mock).mockImplementation((keys: string[]) => {
    keys.forEach(k => delete mockStorage[k]);
    return Promise.resolve();
  });
});

describe('PluginStorageImpl', () => {
  it('namespaces keys by plugin id', async () => {
    const storage = new PluginStorageImpl('com.example.weather');
    await storage.set('city', 'Tokyo');

    expect(mockStorage['pp:plugin:com.example.weather:city']).toBe('Tokyo');
    expect(await storage.get('city')).toBe('Tokyo');
  });

  it('isolates storage between plugins', async () => {
    const a = new PluginStorageImpl('com.example.a');
    const b = new PluginStorageImpl('com.example.b');

    await a.set('key', 'value-a');
    await b.set('key', 'value-b');

    expect(await a.get('key')).toBe('value-a');
    expect(await b.get('key')).toBe('value-b');
  });

  it('removes keys', async () => {
    const storage = new PluginStorageImpl('com.example.x');
    await storage.set('temp', '42');
    await storage.remove('temp');
    expect(await storage.get('temp')).toBeNull();
  });

  it('lists only its own keys (namespaced)', async () => {
    const a = new PluginStorageImpl('com.example.a');
    const b = new PluginStorageImpl('com.example.b');

    await a.set('one', '1');
    await a.set('two', '2');
    await b.set('three', '3');

    const keysA = await a.keys();
    expect(keysA.sort()).toEqual(['one', 'two']);
    expect(keysA).not.toContain('three');
  });

  it('clears only its own keys', async () => {
    const a = new PluginStorageImpl('com.example.a');
    const b = new PluginStorageImpl('com.example.b');

    await a.set('x', '1');
    await b.set('y', '2');

    await a.clear();

    expect(await a.keys()).toEqual([]);
    expect(await b.keys()).toEqual(['y']);
  });
});

describe('clearAllPluginStorage', () => {
  it('removes all pp:plugin:* keys but leaves other storage', async () => {
    mockStorage['pp:plugin:com.a:key'] = 'a';
    mockStorage['pp:plugin:com.b:key'] = 'b';
    mockStorage['other-app-data'] = 'keepme';

    await clearAllPluginStorage();

    expect(mockStorage['pp:plugin:com.a:key']).toBeUndefined();
    expect(mockStorage['pp:plugin:com.b:key']).toBeUndefined();
    expect(mockStorage['other-app-data']).toBe('keepme');
  });

  it('is a no-op when no plugin keys exist', async () => {
    mockStorage['other'] = 'data';
    await clearAllPluginStorage();
    expect(mockStorage['other']).toBe('data');
  });
});

describe('pluginStorageKey helper', () => {
  it('builds the namespaced key without instantiating storage', () => {
    expect(pluginStorageKey('com.example.x', 'foo')).toBe(
      'pp:plugin:com.example.x:foo',
    );
  });
});
