import {AppState, AppStateStatus} from 'react-native';

import {makeAutoObservable, reaction, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

import {
  configureAudioSession,
  getEngine,
  TTS_MIN_RAM_BYTES,
} from '../services/tts';
import type {Voice} from '../services/tts';
import {chatSessionStore} from './ChatSessionStore';

export type TTSPlaybackState = 'idle' | 'loading' | 'playing';

/**
 * Store that coordinates text-to-speech playback.
 *
 * Memory gate: if `DeviceInfo.getTotalMemory()` reports < 6 GiB once at init,
 * the store is inert (no listeners, no reactions) for the rest of the session.
 * The gate is deliberately never re-checked — RAM doesn't change at runtime.
 *
 * In v1.0 there is no UI, so `play()` is driven exclusively by
 * `onAssistantMessageComplete()` which `useChatSession` calls after an
 * assistant message finishes streaming.
 */
export class TTSStore {
  // Memory gate — set once in `init()`, never mutated afterwards.
  isTTSAvailable: boolean = false;
  private initialized: boolean = false;

  // Runtime playback state
  playbackState: TTSPlaybackState = 'idle';
  currentMessageId: string | null = null;

  // Persisted user preferences
  autoSpeakEnabled: boolean = false;
  currentVoice: Voice | null = null;

  // UI state (setup sheet lives in v1.1; store field is introduced here so
  // the UI can bind to it without needing a follow-up migration)
  isSetupSheetOpen: boolean = false;

  // Idempotency guard for `onAssistantMessageComplete`
  lastSpokenMessageId: string | null = null;

  private appStateSubscription: {remove: () => void} | null = null;
  private sessionReactionDispose: (() => void) | null = null;

  constructor() {
    makeAutoObservable(this, {}, {autoBind: true});
    makePersistable(this, {
      name: 'TTSStore',
      properties: ['autoSpeakEnabled', 'currentVoice'],
      storage: AsyncStorage,
    });
  }

  /**
   * Initialize the store. Idempotent — safe to call multiple times; only the
   * first call does work. Reads total memory, wires listeners when eligible,
   * otherwise leaves the store inert.
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    let totalMemory = 0;
    try {
      totalMemory = await DeviceInfo.getTotalMemory();
    } catch (err) {
      console.warn('[TTSStore] getTotalMemory failed:', err);
      totalMemory = 0;
    }

    const available = totalMemory >= TTS_MIN_RAM_BYTES;
    runInAction(() => {
      this.isTTSAvailable = available;
    });

    if (!available) {
      return;
    }

    await configureAudioSession();

    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange,
    );

    this.sessionReactionDispose = reaction(
      () => chatSessionStore.activeSessionId,
      () => {
        this.stop();
      },
    );
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'background' || nextAppState === 'inactive') {
      this.stop();
    }
  };

  setAutoSpeak(on: boolean) {
    this.autoSpeakEnabled = on;
  }

  setCurrentVoice(v: Voice | null) {
    this.currentVoice = v;
  }

  openSetupSheet() {
    this.isSetupSheetOpen = true;
  }

  closeSetupSheet() {
    this.isSetupSheetOpen = false;
  }

  /**
   * Stop any in-flight playback and reset state to idle. Tolerates the
   * absence of a current voice / engine (no-op).
   */
  async stop(): Promise<void> {
    const voice = this.currentVoice;
    runInAction(() => {
      this.playbackState = 'idle';
      this.currentMessageId = null;
    });
    if (voice) {
      try {
        await getEngine(voice.engine).stop();
      } catch (err) {
        console.warn('[TTSStore] stop failed:', err);
      }
    }
  }

  /**
   * Speak `text`. Stops any previous utterance first. If the resolved engine
   * is the Supertonic stub, swallows its "not installed" error and returns
   * to idle — real error UX arrives in v1.2 together with the real engine.
   */
  async play(
    messageId: string,
    text: string,
    voiceOverride?: Voice,
  ): Promise<void> {
    if (!this.isTTSAvailable) {
      return;
    }
    const voice = voiceOverride ?? this.currentVoice;
    if (!voice) {
      return;
    }

    await this.stop();

    runInAction(() => {
      this.playbackState = 'loading';
      this.currentMessageId = messageId;
    });

    try {
      await getEngine(voice.engine).play(text, voice);
      runInAction(() => {
        if (this.currentMessageId === messageId) {
          this.playbackState = 'playing';
        }
      });
    } catch (err) {
      console.warn('[TTSStore] play failed:', err);
      runInAction(() => {
        this.playbackState = 'idle';
        this.currentMessageId = null;
      });
    }
  }

  /**
   * Called by `useChatSession` when an assistant message finishes streaming.
   * Plays exactly once per `messageId` and only when auto-speak is enabled
   * and a voice is selected.
   */
  onAssistantMessageComplete(messageId: string, text: string) {
    if (
      !this.isTTSAvailable ||
      !this.autoSpeakEnabled ||
      this.currentVoice == null ||
      messageId === this.lastSpokenMessageId
    ) {
      return;
    }
    this.lastSpokenMessageId = messageId;
    void this.play(messageId, text);
  }
}

export const ttsStore = new TTSStore();
