import {makeAutoObservable, runInAction} from 'mobx';

import type {HubRunRequest} from '../services/hubRunLink';
import type {PairingRequest} from '../services/pairingLink';

/**
 * DeepLinkStore
 *
 * Manages deep link state in a React-friendly way using MobX.
 * Replaces module-level state to avoid issues with Fast Refresh and module reloading.
 */
class DeepLinkStore {
  pendingMessage: string | null = null;
  pendingHubRun: HubRunRequest | null = null;
  pendingPairing: PairingRequest | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  setPendingMessage(message: string | null) {
    runInAction(() => {
      this.pendingMessage = message;
    });
  }

  clearPendingMessage() {
    runInAction(() => {
      this.pendingMessage = null;
    });
  }

  setPendingHubRun(request: HubRunRequest | null) {
    runInAction(() => {
      this.pendingHubRun = request;
    });
  }

  clearPendingHubRun() {
    runInAction(() => {
      this.pendingHubRun = null;
    });
  }

  setPendingPairing(request: PairingRequest | null) {
    runInAction(() => {
      this.pendingPairing = request;
    });
  }

  clearPendingPairing() {
    runInAction(() => {
      this.pendingPairing = null;
    });
  }
}

export const deepLinkStore = new DeepLinkStore();
