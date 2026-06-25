import {makeAutoObservable} from 'mobx';

import {SEARCH_PROVIDERS} from '../../src/store/SearchProviderStore';
import type {SearchProviderId} from '../../src/services/search/types';

class MockSearchProviderStore {
  activeProviderId: SearchProviderId = 'tavily';
  resultCount = 3;
  hasConsentedToSearch = false;

  private keys: Partial<Record<SearchProviderId, string>> = {};

  setActiveProvider: jest.Mock;
  setResultCount: jest.Mock;
  setConsent: jest.Mock;
  setKey: jest.Mock;
  clearKey: jest.Mock;

  constructor() {
    makeAutoObservable(this, {
      setActiveProvider: false,
      setResultCount: false,
      setConsent: false,
      setKey: false,
      clearKey: false,
    });

    this.setActiveProvider = jest.fn((id: SearchProviderId) => {
      this.activeProviderId = id;
    });
    this.setResultCount = jest.fn((count: number) => {
      this.resultCount = count;
    });
    this.setConsent = jest.fn((consented: boolean) => {
      this.hasConsentedToSearch = consented;
    });
    this.setKey = jest.fn(async (id: SearchProviderId, key: string) => {
      this.keys[id] = key;
      return true;
    });
    this.clearKey = jest.fn(async (id: SearchProviderId) => {
      delete this.keys[id];
      return true;
    });
  }

  get providers() {
    return SEARCH_PROVIDERS;
  }

  getKey(id: SearchProviderId): string {
    return this.keys[id] ?? '';
  }

  hasKey(id: SearchProviderId): boolean {
    return (this.keys[id] ?? '').trim().length > 0;
  }

  get isProviderConfigured(): boolean {
    return this.hasKey(this.activeProviderId);
  }
}

export const mockSearchProviderStore = new MockSearchProviderStore();
