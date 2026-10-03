import AsyncStorage from '@react-native-async-storage/async-storage';
import {makeAutoObservable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';

import {
  credentialRevisionOf,
  normalizeServerUrl,
} from '../services/remote/remoteModelState';
import {Model, ModelOrigin, ServerConfig} from '../utils/types';

export interface StartupModelSelection {
  modelId: string;
  origin: ModelOrigin;
  remoteServer?: {
    normalizedUrl: string;
    serverType: ServerConfig['serverType'];
    credentialRevision: number;
  };
}

class StartupSelectionStore {
  hasPalPreference = false;
  palId: string | undefined = undefined;
  modelSelection: StartupModelSelection | undefined = undefined;

  hydrationComplete = false;
  restoreAttempted = false;
  isRestoring = false;
  suppressPalDefaultAutoLoad = false;

  constructor() {
    makeAutoObservable(this);

    makePersistable(this, {
      name: 'StartupSelectionStore',
      properties: ['hasPalPreference', 'palId', 'modelSelection'],
      storage: AsyncStorage,
    })
      .catch(error => {
        console.error('Failed to hydrate startup selections:', error);
      })
      .finally(() => {
        runInAction(() => {
          this.hydrationComplete = true;
        });
      });
  }

  rememberPal(palId: string | undefined) {
    this.hasPalPreference = true;
    this.palId = palId;
    this.suppressPalDefaultAutoLoad = false;
  }

  clearPalPreference() {
    this.hasPalPreference = false;
    this.palId = undefined;
  }

  rememberModel(model: Model, server?: ServerConfig) {
    this.modelSelection = {
      modelId: model.id,
      origin: model.origin,
      remoteServer:
        model.origin === ModelOrigin.REMOTE && server
          ? {
              normalizedUrl: normalizeServerUrl(server.url),
              serverType: server.serverType,
              credentialRevision: credentialRevisionOf(server),
            }
          : undefined,
    };
    this.suppressPalDefaultAutoLoad = false;
  }

  clearModelPreference() {
    this.modelSelection = undefined;
  }

  markRestoreStarted() {
    this.restoreAttempted = true;
    this.isRestoring = true;
  }

  markRestoreFinished() {
    this.isRestoring = false;
  }

  markModelRestoreFailed() {
    this.modelSelection = undefined;
    this.suppressPalDefaultAutoLoad = true;
  }
}

export const startupSelectionStore = new StartupSelectionStore();
