import {makeAutoObservable} from 'mobx';

class MockTTSStore {
  isTTSAvailable = false;
  playbackState:
    | {mode: 'idle'}
    | {mode: 'streaming'; messageId: string}
    | {mode: 'playing'; messageId: string} = {mode: 'idle'};
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
  onAssistantMessageStart: jest.Mock;
  onAssistantMessageChunk: jest.Mock;
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
      onAssistantMessageStart: false,
      onAssistantMessageChunk: false,
      onAssistantMessageComplete: false,
    });
    this.init = jest.fn().mockResolvedValue(undefined);
    this.play = jest.fn().mockResolvedValue(undefined);
    this.stop = jest.fn().mockResolvedValue(undefined);
    this.setAutoSpeak = jest.fn();
    this.setCurrentVoice = jest.fn();
    this.openSetupSheet = jest.fn();
    this.closeSetupSheet = jest.fn();
    this.onAssistantMessageStart = jest.fn();
    this.onAssistantMessageChunk = jest.fn();
    this.onAssistantMessageComplete = jest.fn();
  }
}

export const mockTTSStore = new MockTTSStore();
