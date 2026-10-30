import {makeAutoObservable, runInAction} from 'mobx';

import {mockModelStore} from './modelStore';

type DownloadState = 'not_installed' | 'downloading' | 'ready' | 'error';
type AsrTier = 'base' | 'small' | 'large-turbo';
type CaptureState =
  | 'idle'
  | 'requesting_perm'
  | 'recording'
  | 'transcribing'
  | 'error';
type AsrErrorKind =
  | 'permission_denied'
  | 'permission_blocked'
  | 'transcribe_failed'
  | 'not_installed'
  | 'insufficient_memory'
  | 'mic_unavailable'
  | 'transcript_partial';

class MockASRStore {
  userASROverride: boolean | null = null;
  selectedTier: AsrTier = 'base';
  spokenLanguage: string | null = null;

  downloadStates: Record<AsrTier, DownloadState> = {
    base: 'not_installed',
    small: 'not_installed',
    'large-turbo': 'not_installed',
  };
  downloadProgress: Record<AsrTier, number> = {
    base: 0,
    small: 0,
    'large-turbo': 0,
  };
  downloadError: Record<AsrTier, string | null> = {
    base: null,
    small: null,
    'large-turbo': null,
  };
  freeDiskBytes: number | null = null;
  captureState: CaptureState = 'idle';
  lastError: AsrErrorKind | null = null;
  inputLevels: number[] = [];
  recordingStartedAt: number | null = null;
  waitingForChat = false;

  init: jest.Mock;
  hasMemoryForCapture: jest.Mock;
  setUserASROverride: jest.Mock;
  selectTier: jest.Mock;
  setSpokenLanguage: jest.Mock;
  setWaitingForChat: jest.Mock;
  refreshFreeDisk: jest.Mock;
  downloadModel: jest.Mock;
  deleteModel: jest.Mock;
  retryDownload: jest.Mock;
  setCaptureState: jest.Mock;
  setError: jest.Mock;
  resetCapture: jest.Mock;
  pushInputLevel: jest.Mock;

  constructor() {
    makeAutoObservable(this, {
      init: false,
      hasMemoryForCapture: false,
      setUserASROverride: false,
      selectTier: false,
      setSpokenLanguage: false,
      setWaitingForChat: false,
      refreshFreeDisk: false,
      downloadModel: false,
      deleteModel: false,
      retryDownload: false,
      setCaptureState: false,
      setError: false,
      resetCapture: false,
      pushInputLevel: false,
    });
    this.init = jest.fn().mockResolvedValue(undefined);
    this.hasMemoryForCapture = jest.fn().mockResolvedValue(true);
    this.setUserASROverride = jest.fn((v: boolean) => {
      runInAction(() => {
        this.userASROverride = v;
      });
    });
    this.selectTier = jest.fn((t: AsrTier) => {
      if (this.downloadStates[t] === 'ready') {
        runInAction(() => {
          this.selectedTier = t;
        });
      }
    });
    this.setSpokenLanguage = jest.fn((language: string | null) => {
      runInAction(() => {
        this.spokenLanguage = language;
      });
    });
    this.setWaitingForChat = jest.fn((value: boolean) => {
      runInAction(() => {
        this.waitingForChat = value;
      });
    });
    this.refreshFreeDisk = jest.fn().mockResolvedValue(undefined);
    this.downloadModel = jest.fn().mockResolvedValue(undefined);
    this.deleteModel = jest.fn().mockResolvedValue(undefined);
    this.retryDownload = jest.fn().mockResolvedValue(undefined);
    this.setCaptureState = jest.fn((s: CaptureState) => {
      runInAction(() => {
        this.captureState = s;
        if (s !== 'error') {
          this.lastError = null;
        }
        this.recordingStartedAt = s === 'recording' ? Date.now() : null;
      });
    });
    this.setError = jest.fn((k: AsrErrorKind) => {
      runInAction(() => {
        this.captureState = 'error';
        this.lastError = k;
        this.recordingStartedAt = null;
        this.waitingForChat = false;
      });
    });
    this.pushInputLevel = jest.fn((level: number) => {
      runInAction(() => {
        this.inputLevels = [...this.inputLevels, level];
      });
    });
    this.resetCapture = jest.fn(() => {
      runInAction(() => {
        this.captureState = 'idle';
        this.lastError = null;
        this.recordingStartedAt = null;
        this.waitingForChat = false;
      });
    });
  }

  get deviceSupported(): boolean {
    const tier = mockModelStore.deviceTier;
    return tier === 'high' || tier === 'flagship';
  }

  get chatBusyOnCpu(): boolean {
    return mockModelStore.inferencing && mockModelStore.context?.gpu === false;
  }

  get asrAvailable(): boolean {
    if (this.userASROverride === true) {
      return true;
    }
    if (this.userASROverride === false) {
      return false;
    }
    return this.deviceSupported;
  }

  get selectedTierState(): DownloadState {
    return this.downloadStates[this.selectedTier];
  }

  get isSelectedTierReady(): boolean {
    return this.selectedTierState === 'ready';
  }

  get setupTier(): AsrTier {
    return this.isSelectedTierReady ? this.selectedTier : 'base';
  }
}

export const mockASRStore = new MockASRStore();
