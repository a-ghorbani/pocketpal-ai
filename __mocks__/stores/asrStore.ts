import {makeAutoObservable, runInAction} from 'mobx';

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
  | 'too_short'
  | 'transcribe_failed'
  | 'not_installed';

class MockASRStore {
  deviceMeetsMemory = false;
  userASROverride: boolean | null = null;
  selectedTier: AsrTier = 'small';

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

  init: jest.Mock;
  setUserASROverride: jest.Mock;
  setSelectedTier: jest.Mock;
  refreshFreeDisk: jest.Mock;
  downloadModel: jest.Mock;
  deleteModel: jest.Mock;
  retryDownload: jest.Mock;
  setCaptureState: jest.Mock;
  setError: jest.Mock;
  resetCapture: jest.Mock;

  constructor() {
    makeAutoObservable(this, {
      init: false,
      setUserASROverride: false,
      setSelectedTier: false,
      refreshFreeDisk: false,
      downloadModel: false,
      deleteModel: false,
      retryDownload: false,
      setCaptureState: false,
      setError: false,
      resetCapture: false,
    });
    this.init = jest.fn().mockResolvedValue(undefined);
    this.setUserASROverride = jest.fn((v: boolean) => {
      runInAction(() => {
        this.userASROverride = v;
      });
    });
    this.setSelectedTier = jest.fn((t: AsrTier) => {
      runInAction(() => {
        this.selectedTier = t;
      });
    });
    this.refreshFreeDisk = jest.fn().mockResolvedValue(undefined);
    this.downloadModel = jest.fn().mockResolvedValue(undefined);
    this.deleteModel = jest.fn().mockResolvedValue(undefined);
    this.retryDownload = jest.fn().mockResolvedValue(undefined);
    this.setCaptureState = jest.fn((s: CaptureState) => {
      runInAction(() => {
        this.captureState = s;
      });
    });
    this.setError = jest.fn((k: AsrErrorKind) => {
      runInAction(() => {
        this.captureState = 'error';
        this.lastError = k;
      });
    });
    this.resetCapture = jest.fn(() => {
      runInAction(() => {
        this.captureState = 'idle';
        this.lastError = null;
      });
    });
  }

  get asrAvailable(): boolean {
    if (this.userASROverride === true) {
      return true;
    }
    if (this.userASROverride === false) {
      return false;
    }
    return this.deviceMeetsMemory;
  }

  get selectedTierState(): DownloadState {
    return this.downloadStates[this.selectedTier];
  }

  get isSelectedTierReady(): boolean {
    return this.selectedTierState === 'ready';
  }
}

export const mockASRStore = new MockASRStore();
