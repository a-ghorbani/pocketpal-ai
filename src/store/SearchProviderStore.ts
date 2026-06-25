import {makeAutoObservable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {makePersistable} from 'mobx-persist-store';
import * as Keychain from 'react-native-keychain';

import type {SearchProviderId} from '../services/search/types';

/** Distinct Keychain service per provider so iOS entries co-exist. */
const keychainService = (id: SearchProviderId): string =>
  `search_provider_service_${id}`;

export interface SearchProviderMeta {
  id: SearchProviderId;
  label: string;
  /** Gated providers appear in the picker but cannot be the active provider. */
  selectable: boolean;
}

/**
 * Provider list shown in Settings. Tavily is the default; Parallel ships gated
 * (not selectable as default) until its free-tier/PAYG terms are confirmed.
 */
export const SEARCH_PROVIDERS: SearchProviderMeta[] = [
  {id: 'tavily', label: 'Tavily', selectable: true},
  {id: 'brave', label: 'Brave', selectable: true},
  {id: 'exa', label: 'Exa', selectable: true},
  {id: 'parallel', label: 'Parallel', selectable: false},
];

const DEFAULT_PROVIDER: SearchProviderId = 'tavily';
const DEFAULT_RESULT_COUNT = 3;
const MIN_RESULT_COUNT = 1;
const MAX_RESULT_COUNT = 8;

class SearchProviderStore {
  activeProviderId: SearchProviderId = DEFAULT_PROVIDER;
  resultCount: number = DEFAULT_RESULT_COUNT;
  hasConsentedToSearch = false;

  /** In-memory mirror of each provider's BYOK key (source of truth: Keychain). */
  private keys: Partial<Record<SearchProviderId, string>> = {};

  constructor() {
    makeAutoObservable(this);

    makePersistable(this, {
      name: 'SearchProviderStore',
      properties: ['activeProviderId', 'resultCount', 'hasConsentedToSearch'],
      storage: AsyncStorage,
    });

    this.loadKeysFromSecureStorage();
  }

  private async loadKeysFromSecureStorage() {
    for (const {id} of SEARCH_PROVIDERS) {
      try {
        const credentials = await Keychain.getGenericPassword({
          service: keychainService(id),
        });
        if (credentials) {
          runInAction(() => {
            this.keys[id] = credentials.password;
          });
        }
      } catch (error) {
        console.error(`Failed to load ${id} search key:`, error);
      }
    }
  }

  get providers(): SearchProviderMeta[] {
    return SEARCH_PROVIDERS;
  }

  /** Active provider's key, or empty string when none is set. */
  getKey(id: SearchProviderId): string {
    return this.keys[id] ?? '';
  }

  hasKey(id: SearchProviderId): boolean {
    return (this.keys[id] ?? '').trim().length > 0;
  }

  /** True when the active provider has a non-empty key. */
  get isProviderConfigured(): boolean {
    return this.hasKey(this.activeProviderId);
  }

  setActiveProvider(id: SearchProviderId) {
    const meta = SEARCH_PROVIDERS.find(p => p.id === id);
    if (!meta || !meta.selectable) {
      return;
    }
    runInAction(() => {
      this.activeProviderId = id;
    });
  }

  setResultCount(count: number) {
    const clamped = Math.min(
      MAX_RESULT_COUNT,
      Math.max(MIN_RESULT_COUNT, Math.round(count)),
    );
    runInAction(() => {
      this.resultCount = clamped;
    });
  }

  setConsent(consented: boolean) {
    runInAction(() => {
      this.hasConsentedToSearch = consented;
    });
  }

  async setKey(id: SearchProviderId, key: string): Promise<boolean> {
    try {
      await Keychain.setGenericPassword(id, key, {
        service: keychainService(id),
      });
      runInAction(() => {
        this.keys[id] = key;
      });
      return true;
    } catch (error) {
      console.error(`Failed to save ${id} search key:`, error);
      return false;
    }
  }

  async clearKey(id: SearchProviderId): Promise<boolean> {
    try {
      await Keychain.resetGenericPassword({service: keychainService(id)});
      runInAction(() => {
        delete this.keys[id];
      });
      return true;
    } catch (error) {
      console.error(`Failed to clear ${id} search key:`, error);
      return false;
    }
  }
}

export const searchProviderStore = new SearchProviderStore();
export {SearchProviderStore};
