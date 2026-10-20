import {makeAutoObservable} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {VOICE_MODE_UNLOCKED_DEFAULT, VoiceEntitlement} from '../services/voice';

import {asrStore} from './ASRStore';

export type VoicePhase =
  | 'closed'
  | 'starting'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking';

export type VoiceError = 'transcribe_failed' | 'reply_failed' | 'speech_failed';

export type VoicePresentation = 'full' | 'bar';

/**
 * State of the hands-free voice session in chat. `phase`, `micMuted` and
 * `lastError` are written only by `useVoiceMode`; the view and the bar
 * write `presentation`.
 */
export class VoiceModeStore {
  phase: VoicePhase = 'closed';
  micMuted = false;
  presentation: VoicePresentation = 'full';
  lastError: VoiceError | null = null;
  /** E2E builds only: forces the default entitlement either way. */
  unlockOverride: boolean | null = null;

  constructor() {
    makeAutoObservable(this, {}, {autoBind: true});
    if (__E2E__) {
      makePersistable(this, {
        name: 'VoiceModeStore',
        properties: ['unlockOverride'],
        storage: AsyncStorage,
      });
    }
  }

  /** The device can run voice mode: the same tiers as voice input. */
  get supported(): boolean {
    return asrStore.deviceSupported;
  }

  get isUnlocked(): boolean {
    return voiceEntitlement.source.isUnlocked();
  }

  /** `useVoiceMode` only. */
  setPhase(phase: VoicePhase): void {
    if (phase !== this.phase) {
      this.lastError = null;
    }
    this.phase = phase;
    if (phase === 'closed') {
      this.micMuted = false;
      this.presentation = 'full';
    }
  }

  /** `useVoiceMode` only. */
  setMicMuted(muted: boolean): void {
    this.micMuted = muted;
  }

  /** `useVoiceMode` only. */
  setLastError(error: VoiceError | null): void {
    this.lastError = error;
  }

  setPresentation(presentation: VoicePresentation): void {
    this.presentation = presentation;
  }

  /** E2E drivers only. */
  setUnlockOverride(unlocked: boolean | null): void {
    this.unlockOverride = unlocked;
  }
}

export const voiceModeStore = new VoiceModeStore();

export const voiceEntitlement = new VoiceEntitlement({
  isUnlocked: () =>
    voiceModeStore.unlockOverride ?? VOICE_MODE_UNLOCKED_DEFAULT,
  openPaywall: () => {
    console.warn('[voiceMode] no paywall is registered yet');
  },
});
