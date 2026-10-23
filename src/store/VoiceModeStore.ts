import {Platform} from 'react-native';

import {makeAutoObservable} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {isPlusUnlocked, openPlus} from '../services/plus/gate';
import {VoiceEntitlement, voiceModeDeviceSupported} from '../services/voice';

import {modelStore} from './ModelStore';

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
  /** The Settings switch; null follows the device gate. */
  userVoiceModeOverride: boolean | null = null;

  constructor() {
    makeAutoObservable(this, {}, {autoBind: true});
    makePersistable(this, {
      name: 'VoiceModeStore',
      properties: __E2E__
        ? ['userVoiceModeOverride', 'unlockOverride']
        : ['userVoiceModeOverride'],
      storage: AsyncStorage,
    });
  }

  /** The device meets voice mode's own gate (wider than dictation's). */
  get deviceSupported(): boolean {
    return voiceModeDeviceSupported(modelStore.deviceTier, Platform.OS);
  }

  /** Voice mode is offered: the user's choice, else the device gate. */
  get supported(): boolean {
    return this.userVoiceModeOverride ?? this.deviceSupported;
  }

  /** A session is open; changes only when one starts or ends. */
  get isOpen(): boolean {
    return this.phase !== 'closed';
  }

  /** The full voice view covers the chat. */
  get isFullViewOpen(): boolean {
    return this.phase !== 'closed' && this.presentation === 'full';
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

  setUserVoiceModeOverride(enabled: boolean): void {
    this.userVoiceModeOverride = enabled;
  }

  /** E2E drivers only. */
  setUnlockOverride(unlocked: boolean | null): void {
    this.unlockOverride = unlocked;
  }
}

export const voiceModeStore = new VoiceModeStore();

export const voiceEntitlement = new VoiceEntitlement({
  isUnlocked: () => voiceModeStore.unlockOverride ?? isPlusUnlocked(),
  openPaywall: ({onUnlocked}) => openPlus({onUnlocked}),
});
