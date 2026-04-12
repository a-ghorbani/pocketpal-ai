import {makeAutoObservable} from 'mobx';

class MockTTSStore {
  isTTSAvailable = false;
  playbackState: 'idle' | 'loading' | 'playing' = 'idle';
  currentMessageId: string | null = null;
  autoSpeakEnabled = false;
  currentVoice: null = null;
  isSetupSheetOpen = false;
  lastSpokenMessageId: string | null = null;

  init: jest.Mock;
  play: jest.Mock;
  stop: jest.Mock;
  setAutoSpeak: jest.Mock;
  setCurrentVoice: jest.Mock;
  openSetupSheet: jest.Mock;
  closeSetupSheet: jest.Mock;
  onAssistantMessageComplete: jest.Mock;

  constructor() {
    makeAutoObservable(this, {
      init: false,
      play: false,
      stop: false,
      setAutoSpeak: false,
      setCurrentVoice: false,
      openSetupSheet: false,
      closeSetupSheet: false,
      onAssistantMessageComplete: false,
    });
    this.init = jest.fn().mockResolvedValue(undefined);
    this.play = jest.fn().mockResolvedValue(undefined);
    this.stop = jest.fn().mockResolvedValue(undefined);
    this.setAutoSpeak = jest.fn();
    this.setCurrentVoice = jest.fn();
    this.openSetupSheet = jest.fn();
    this.closeSetupSheet = jest.fn();
    this.onAssistantMessageComplete = jest.fn();
  }
}

export const mockTTSStore = new MockTTSStore();
