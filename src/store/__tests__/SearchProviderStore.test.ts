import * as Keychain from 'react-native-keychain';
import {makePersistable} from 'mobx-persist-store';

import {SearchProviderStore, SEARCH_PROVIDERS} from '../SearchProviderStore';
import * as budget from '../../services/search/searchBudget';

// `mobx-persist-store` is globally mocked (jest.config.js moduleNameMapper →
// __mocks__/external/mobx-persist-store.js); `makePersistable` is a jest.fn.
const persistMock = makePersistable as jest.Mock;

const setMock = Keychain.setGenericPassword as jest.Mock;
const getMock = Keychain.getGenericPassword as jest.Mock;
const resetMock = Keychain.resetGenericPassword as jest.Mock;

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('SearchProviderStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no keys stored for any provider.
    getMock.mockResolvedValue(false);
  });

  const newStore = async () => {
    const store = new SearchProviderStore();
    await flush();
    return store;
  };

  describe('initial state', () => {
    it('defaults to tavily, result count 3, no consent', async () => {
      const store = await newStore();
      expect(store.activeProviderId).toBe('tavily');
      expect(store.resultCount).toBe(3);
      expect(store.hasConsentedToSearch).toBe(false);
    });

    it('lists Parallel as gated (not selectable)', () => {
      const parallel = SEARCH_PROVIDERS.find(p => p.id === 'parallel');
      expect(parallel?.selectable).toBe(false);
    });

    it('reads each provider key under its own keychain service on load', async () => {
      await newStore();
      for (const {id} of SEARCH_PROVIDERS) {
        expect(getMock).toHaveBeenCalledWith({
          service: `search_provider_service_${id}`,
        });
      }
    });
  });

  describe('secure-store boundary (keys never in plain storage)', () => {
    it('persists only non-secret prefs via AsyncStorage, never a key field', async () => {
      await newStore();
      const config = persistMock.mock.calls[0][1];
      expect(config.properties).toEqual([
        'activeProviderId',
        'resultCount',
        'hasConsentedToSearch',
      ]);
      // No key/secret field is persisted to plain storage.
      expect(config.properties).not.toContain('keys');
      expect(JSON.stringify(config.properties)).not.toMatch(/key/i);
    });

    it('writes BYOK keys only through Keychain, not via the persisted store', async () => {
      const store = await newStore();
      persistMock.mockClear();
      await store.setKey('tavily', 'tav-secret');
      // setKey routes the secret to Keychain only — no re-persist of plain prefs
      // carries the key, and the key never enters the persisted property set.
      expect(setMock).toHaveBeenCalledWith('tavily', 'tav-secret', {
        service: 'search_provider_service_tavily',
      });
      const persistedKeys = persistMock.mock.calls.flatMap(
        c => c[1]?.properties ?? [],
      );
      expect(persistedKeys).not.toContain('keys');
    });
  });

  describe('per-provider key isolation', () => {
    it('writes a key under the provider-specific service', async () => {
      const store = await newStore();
      await store.setKey('tavily', 'tav-key');

      expect(setMock).toHaveBeenCalledWith('tavily', 'tav-key', {
        service: 'search_provider_service_tavily',
      });
      expect(store.hasKey('tavily')).toBe(true);
      // Brave stays empty — distinct service means no overwrite.
      expect(store.hasKey('brave')).toBe(false);
      expect(store.getKey('brave')).toBe('');
    });

    it('clears a key under the provider-specific service', async () => {
      const store = await newStore();
      await store.setKey('exa', 'exa-key');
      expect(store.hasKey('exa')).toBe(true);

      await store.clearKey('exa');
      expect(resetMock).toHaveBeenCalledWith({
        service: 'search_provider_service_exa',
      });
      expect(store.hasKey('exa')).toBe(false);
    });

    it('loads a stored key only for the provider that has one', async () => {
      getMock.mockImplementation((opts: {service: string}) =>
        opts.service === 'search_provider_service_tavily'
          ? Promise.resolve({password: 'stored-tav', username: 'tavily'})
          : Promise.resolve(false),
      );
      const store = await newStore();
      expect(store.getKey('tavily')).toBe('stored-tav');
      expect(store.hasKey('brave')).toBe(false);
    });
  });

  describe('preferences', () => {
    it('sets the active provider only for selectable providers', async () => {
      const store = await newStore();
      store.setActiveProvider('brave');
      expect(store.activeProviderId).toBe('brave');

      // Gated provider is ignored.
      store.setActiveProvider('parallel');
      expect(store.activeProviderId).toBe('brave');
    });

    it('clamps result count into range', async () => {
      const store = await newStore();
      store.setResultCount(0);
      expect(store.resultCount).toBe(1);
      store.setResultCount(99);
      expect(store.resultCount).toBe(8);
      store.setResultCount(4);
      expect(store.resultCount).toBe(4);
    });

    it('records consent', async () => {
      const store = await newStore();
      store.setConsent(true);
      expect(store.hasConsentedToSearch).toBe(true);
    });
  });

  describe('isProviderConfigured', () => {
    it('is false with no key and true once the active provider has a key', async () => {
      const store = await newStore();
      expect(store.isProviderConfigured).toBe(false);
      await store.setKey('tavily', 'k');
      expect(store.isProviderConfigured).toBe(true);
    });
  });

  describe('canSearch (consent + key, load-bearing at execution)', () => {
    it('requires both consent and a key', async () => {
      const store = await newStore();
      expect(store.canSearch).toBe(false);

      await store.setKey('tavily', 'k');
      expect(store.canSearch).toBe(false); // key but no consent

      store.setConsent(true);
      expect(store.canSearch).toBe(true);

      store.setConsent(false);
      expect(store.canSearch).toBe(false); // consent revoked
    });
  });

  describe('cache invalidation on auth-boundary changes', () => {
    it('resets the search cache on key/consent/provider changes', async () => {
      const reset = jest.spyOn(budget, 'resetSearchCache');
      const store = await newStore();
      reset.mockClear();

      await store.setKey('tavily', 'k');
      await store.clearKey('tavily');
      store.setConsent(true);
      store.setActiveProvider('brave');

      // setKey + clearKey + setConsent + setActiveProvider each invalidate.
      expect(reset.mock.calls.length).toBeGreaterThanOrEqual(4);
      reset.mockRestore();
    });
  });
});
