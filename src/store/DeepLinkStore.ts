import {makeAutoObservable, runInAction} from 'mobx';

/**
 * DeepLinkStore
 *
 * Manages deep link state in a React-friendly way using MobX.
 * Replaces module-level state to avoid issues with Fast Refresh and module reloading.
 */
class DeepLinkStore {
  pendingMessage: string | null = null;

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
}

export const deepLinkStore = new DeepLinkStore();
