import {makeAutoObservable, runInAction} from 'mobx';

import {Platform} from 'react-native';

import {voiceModeDeviceSupported} from '../../src/services/voice/deviceGate';

import {mockModelStore} from './modelStore';
import {mockPurchaseStore} from './purchaseStore';

type VoicePhase =
  | 'closed'
  | 'starting'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking';
type VoiceEntitlementSource = {
  isUnlocked(): boolean;
  openPaywall(opts: {onUnlocked: () => void}): void;
};
type VoiceError = 'transcribe_failed' | 'reply_failed' | 'speech_failed';

class MockVoiceModeStore {
  phase: VoicePhase = 'closed';
  micMuted = false;
  presentation: 'full' | 'bar' = 'full';
  lastError: VoiceError | null = null;
  unlockOverride: boolean | null = null;
  userVoiceModeOverride: boolean | null = null;

  setPhase: jest.Mock;
  setMicMuted: jest.Mock;
  setLastError: jest.Mock;
  setPresentation: jest.Mock;
  setUnlockOverride: jest.Mock;
  setUserVoiceModeOverride: jest.Mock;

  constructor() {
    makeAutoObservable(this, {
      setPhase: false,
      setMicMuted: false,
      setLastError: false,
      setPresentation: false,
      setUnlockOverride: false,
      setUserVoiceModeOverride: false,
    });
    this.setUserVoiceModeOverride = jest.fn((enabled: boolean) => {
      runInAction(() => {
        this.userVoiceModeOverride = enabled;
      });
    });
    this.setPhase = jest.fn((phase: VoicePhase) => {
      runInAction(() => {
        if (phase !== this.phase) {
          this.lastError = null;
        }
        this.phase = phase;
        if (phase === 'closed') {
          this.micMuted = false;
          this.presentation = 'full';
        }
      });
    });
    this.setMicMuted = jest.fn((muted: boolean) => {
      runInAction(() => {
        this.micMuted = muted;
      });
    });
    this.setLastError = jest.fn((error: VoiceError | null) => {
      runInAction(() => {
        this.lastError = error;
      });
    });
    this.setPresentation = jest.fn((presentation: 'full' | 'bar') => {
      runInAction(() => {
        this.presentation = presentation;
      });
    });
    this.setUnlockOverride = jest.fn((unlocked: boolean | null) => {
      runInAction(() => {
        this.unlockOverride = unlocked;
      });
    });
  }

  get deviceSupported(): boolean {
    return voiceModeDeviceSupported(mockModelStore.deviceTier, Platform.OS);
  }

  get supported(): boolean {
    return this.userVoiceModeOverride ?? this.deviceSupported;
  }

  get isOpen(): boolean {
    return this.phase !== 'closed';
  }

  get isFullViewOpen(): boolean {
    return this.phase !== 'closed' && this.presentation === 'full';
  }

  get isUnlocked(): boolean {
    return mockVoiceEntitlement.source.isUnlocked();
  }

  reset() {
    runInAction(() => {
      this.phase = 'closed';
      this.micMuted = false;
      this.presentation = 'full';
      this.lastError = null;
      this.unlockOverride = null;
      this.userVoiceModeOverride = null;
    });
  }
}

export const mockVoiceModeStore = new MockVoiceModeStore();

const defaultSource = {
  isUnlocked: () =>
    mockVoiceModeStore.unlockOverride ?? mockPurchaseStore.plusUnlocked,
  openPaywall: jest.fn(),
};

export const mockVoiceEntitlement = {
  source: defaultSource as VoiceEntitlementSource,
  register: jest.fn((source: VoiceEntitlementSource) => {
    mockVoiceEntitlement.source = source;
  }),
  defaultSource,
};
