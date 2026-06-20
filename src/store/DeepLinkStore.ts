import {makeAutoObservable, runInAction} from 'mobx';

import type {HubRunRequest} from '../services/hubRunLink';

/**
 * DeepLinkStore
 *
 * Manages deep link state in a React-friendly way using MobX.
 * Replaces module-level state to avoid issues with Fast Refresh and module reloading.
 */
class DeepLinkStore {
  pendingMessage: string | null = null;
  pendingHubRun: HubRunRequest | null = null;
  // One-shot request to focus the chat input on the next Chat-screen arrival.
  // Set only by the Home composer launcher; consumed and cleared once by
  // ChatScreen so other Chat entries (history, deep links) never auto-focus.
  autoFocusChat: boolean = false;

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

  setAutoFocusChat(value: boolean) {
    runInAction(() => {
      this.autoFocusChat = value;
    });
  }

  clearAutoFocusChat() {
    runInAction(() => {
      this.autoFocusChat = false;
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
}

export const deepLinkStore = new DeepLinkStore();
