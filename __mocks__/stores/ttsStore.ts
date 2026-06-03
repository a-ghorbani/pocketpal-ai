import {makeAutoObservable} from 'mobx';

type DownloadState = 'not_installed' | 'downloading' | 'ready' | 'error';

class MockTTSStore {
  // Mirror the real store shape: `isTTSAvailable` is derived from
  // `deviceMeetsMemory` and `userTTSOverride`. Tests should mutate the inputs.
  deviceMeetsMemory = false;
  userTTSOverride: boolean | null = null;
  get isTTSAvailable(): boolean {
    if (this.userTTSOverride === true) {
      return true;
    }
    if (this.userTTSOverride === false) {
      return false;
    }
    return this.deviceMeetsMemory;
  }
  playbackState:
    | {mode: 'idle'}
    | {mode: 'streaming'; messageId: string}
    | {mode: 'playing'; messageId: string} = {mode: 'idle'};
  autoSpeakEnabled = false;
  currentVoice: any = null;
  isSetupSheetOpen = false;
  lastSpokenMessageId: string | null = null;

  supertonicDownloadState: DownloadState = 'not_installed';
  supertonicDownloadProgress = 0;
  supertonicDownloadError: string | null = null;
  supertonicSteps: 1 | 2 | 3 | 5 | 10 = 3;

  kokoroDownloadState: DownloadState = 'not_installed';
  kokoroDownloadProgress = 0;
  kokoroDownloadError: string | null = null;

  kittenDownloadState: DownloadState = 'not_installed';
  kittenDownloadProgress = 0;
  kittenDownloadError: string | null = null;

  init: jest.Mock;
  play: jest.Mock;
  preview: jest.Mock;
  isPreviewingVoice: jest.Mock;
  stop: jest.Mock;
  setAutoSpeak: jest.Mock;
  setUserTTSOverride: jest.Mock;
  setCurrentVoice: jest.Mock;
  setSupertonicSteps: jest.Mock;
  openSetupSheet: jest.Mock;
  closeSetupSheet: jest.Mock;
  onAssistantMessageStart: jest.Mock;
  onAssistantMessageChunk: jest.Mock;
  onAssistantMessageComplete: jest.Mock;
  downloadSupertonic: jest.Mock;
  retryDownload: jest.Mock;
  deleteSupertonic: jest.Mock;
  downloadKokoro: jest.Mock;
  retryKokoroDownload: jest.Mock;
  deleteKokoro: jest.Mock;
  downloadKitten: jest.Mock;
  retryKittenDownload: jest.Mock;
  deleteKitten: jest.Mock;

  constructor() {
    makeAutoObservable(this, {
      init: false,
      play: false,
      preview: false,
      isPreviewingVoice: false,
      stop: false,
      setAutoSpeak: false,
      setUserTTSOverride: false,
      setCurrentVoice: false,
      setSupertonicSteps: false,
      openSetupSheet: false,
      closeSetupSheet: false,
      onAssistantMessageStart: false,
      onAssistantMessageChunk: false,
      onAssistantMessageComplete: false,
      downloadSupertonic: false,
      retryDownload: false,
      deleteSupertonic: false,
      downloadKokoro: false,
      retryKokoroDownload: false,
      deleteKokoro: false,
      downloadKitten: false,
      retryKittenDownload: false,
      deleteKitten: false,
    });
    this.init = jest.fn().mockResolvedValue(undefined);
    this.play = jest.fn().mockResolvedValue(undefined);
    this.preview = jest.fn().mockResolvedValue(undefined);
    this.isPreviewingVoice = jest.fn().mockReturnValue(false);
    this.stop = jest.fn().mockResolvedValue(undefined);
    this.setAutoSpeak = jest.fn();
    this.setUserTTSOverride = jest.fn();
    this.setCurrentVoice = jest.fn();
    this.setSupertonicSteps = jest.fn();
    this.openSetupSheet = jest.fn();
    this.closeSetupSheet = jest.fn();
    this.onAssistantMessageStart = jest.fn();
    this.onAssistantMessageChunk = jest.fn();
    this.onAssistantMessageComplete = jest.fn();
    this.downloadSupertonic = jest.fn().mockResolvedValue(undefined);
    this.retryDownload = jest.fn().mockResolvedValue(undefined);
    this.deleteSupertonic = jest.fn().mockResolvedValue(undefined);
    this.downloadKokoro = jest.fn().mockResolvedValue(undefined);
    this.retryKokoroDownload = jest.fn().mockResolvedValue(undefined);
    this.deleteKokoro = jest.fn().mockResolvedValue(undefined);
    this.downloadKitten = jest.fn().mockResolvedValue(undefined);
    this.retryKittenDownload = jest.fn().mockResolvedValue(undefined);
    this.deleteKitten = jest.fn().mockResolvedValue(undefined);
  }
}

export const mockTTSStore = new MockTTSStore();
