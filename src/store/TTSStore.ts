import {AppState, AppStateStatus} from 'react-native';

import {makeAutoObservable, reaction, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

import {
  configureAudioSession,
  getEngine,
  SupertonicEngine,
  TTS_MIN_RAM_BYTES,
} from '../services/tts';
import type {StreamingHandle, Voice} from '../services/tts';
import {chatSessionStore} from './ChatSessionStore';

/**
 * Discriminated union describing what the store is currently doing.
 *
 * - `idle`: nothing playing, no streaming session active.
 * - `streaming`: an assistant message is still being produced; `handle`
 *   receives token deltas via `onAssistantMessageChunk`.
 * - `playing`: a full-text utterance is playing (replay path / fallback).
 */
export type TTSPlaybackState =
  | {mode: 'idle'}
  | {mode: 'streaming'; messageId: string; handle: StreamingHandle}
  | {mode: 'playing'; messageId: string};

/**
 * State machine for the Supertonic neural-model download lifecycle.
 * Derived from `SupertonicEngine.isInstalled()` on `init()` — never
 * persisted; the source of truth is the file system.
 */
export type SupertonicDownloadState =
  | 'not_installed'
  | 'downloading'
  | 'ready'
  | 'error';

/**
 * Store that coordinates text-to-speech playback.
 *
 * Memory gate: if `DeviceInfo.getTotalMemory()` reports < 6 GiB once at init,
 * the store is inert (no listeners, no reactions) for the rest of the session.
 * The gate is deliberately never re-checked — RAM doesn't change at runtime.
 *
 * Streaming: `useChatSession` calls three hooks as an assistant message is
 * produced — `onAssistantMessageStart`, `onAssistantMessageChunk`, and
 * `onAssistantMessageComplete`. The first creates a `StreamingHandle`, the
 * second feeds deltas into it, the third flushes the remaining buffer. If
 * `start` is missed (e.g., voice picked mid-message) `complete` falls back
 * to the full-text `play()` path.
 */
export class TTSStore {
  // Memory gate — set once in `init()`, never mutated afterwards.
  isTTSAvailable: boolean = false;
  private initialized: boolean = false;

  // Runtime playback state (discriminated union)
  playbackState: TTSPlaybackState = {mode: 'idle'};

  // Persisted user preferences
  autoSpeakEnabled: boolean = false;
  currentVoice: Voice | null = null;

  // UI state (setup sheet lives in v1.1; store field is introduced here so
  // the UI can bind to it without needing a follow-up migration)
  isSetupSheetOpen: boolean = false;

  // Supertonic model lifecycle — derived state, NOT persisted. The
  // filesystem is the source of truth; state is recomputed on `init()`
  // via `SupertonicEngine.isInstalled()`.
  supertonicDownloadState: SupertonicDownloadState = 'not_installed';
  supertonicDownloadProgress: number = 0;
  supertonicDownloadError: string | null = null;

  // Idempotency guard for the auto-speak path. Set on
  // `onAssistantMessageStart` (and on the start-missed fallback inside
  // `onAssistantMessageComplete`) so the same message never plays twice.
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

    // Derive Supertonic install state from disk once at init. Source of
    // truth is the filesystem — we never persist this.
    try {
      const supertonic = getEngine('supertonic');
      const installed = await supertonic.isInstalled();
      runInAction(() => {
        this.supertonicDownloadState = installed ? 'ready' : 'not_installed';
      });
    } catch (err) {
      console.warn('[TTSStore] Supertonic isInstalled check failed:', err);
    }

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
    const state = this.playbackState;
    const voice = this.currentVoice;
    runInAction(() => {
      this.playbackState = {mode: 'idle'};
    });
    if (state.mode === 'streaming') {
      try {
        await state.handle.cancel();
      } catch (err) {
        console.warn('[TTSStore] streaming cancel failed:', err);
      }
      return;
    }
    if (voice) {
      try {
        await getEngine(voice.engine).stop();
      } catch (err) {
        console.warn('[TTSStore] stop failed:', err);
      }
    }
  }

  /**
   * Speak `text` as a single utterance (replay path). Stops any previous
   * playback first. Engine errors are logged and the store returns to
   * idle — callers that need an error surface should observe
   * `supertonicDownloadError` (for install-time failures) or catch
   * errors at the call site.
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
      this.playbackState = {mode: 'playing', messageId};
    });

    try {
      await getEngine(voice.engine).play(text, voice);
    } catch (err) {
      console.warn('[TTSStore] play failed:', err);
      runInAction(() => {
        this.playbackState = {mode: 'idle'};
      });
    }
  }

  /**
   * First token / message creation. Opens a streaming session. Gated on
   * feature availability, auto-speak toggle, voice selected, and the
   * idempotency guard (`lastSpokenMessageId`).
   */
  onAssistantMessageStart(messageId: string) {
    if (
      !this.isTTSAvailable ||
      !this.autoSpeakEnabled ||
      this.currentVoice == null ||
      messageId === this.lastSpokenMessageId
    ) {
      return;
    }
    const voice = this.currentVoice;
    // Cancel any currently-active handle before opening a new one. We
    // intentionally do not `await` — start is sync from the caller's POV;
    // the previous session's teardown runs in the background.
    const prev = this.playbackState;
    if (prev.mode === 'streaming') {
      prev.handle.cancel().catch(err => {
        console.warn('[TTSStore] prior streaming cancel failed:', err);
      });
    }

    this.lastSpokenMessageId = messageId;
    const handle = getEngine(voice.engine).playStreaming(voice);
    runInAction(() => {
      this.playbackState = {mode: 'streaming', messageId, handle};
    });
  }

  /**
   * Delta chunk from the LLM stream. Only forwarded if a streaming session
   * for this `messageId` is currently active.
   */
  onAssistantMessageChunk(messageId: string, chunkText: string) {
    const state = this.playbackState;
    if (state.mode !== 'streaming' || state.messageId !== messageId) {
      return;
    }
    state.handle.appendText(chunkText);
  }

  /**
   * Final completion. If a streaming handle exists for this `messageId`,
   * flush remaining buffer via `finalize()`. Otherwise, if gating passes,
   * fall back to a full-text `play()`.
   */
  onAssistantMessageComplete(messageId: string, text: string) {
    const state = this.playbackState;
    if (state.mode === 'streaming' && state.messageId === messageId) {
      state.handle
        .finalize()
        .catch(err => {
          // Supertonic stub rejects with "not installed" — treat as graceful.
          console.warn('[TTSStore] finalize failed:', err);
          // Real engine error (e.g., Supertonic inference failure) —
          // surface on supertonicDownloadError if the failing engine was
          // Supertonic. Swallow-stub semantics are retired in v1.2.
        })
        .finally(() => {
          runInAction(() => {
            if (
              this.playbackState.mode === 'streaming' &&
              this.playbackState.messageId === messageId
            ) {
              this.playbackState = {mode: 'idle'};
            }
          });
        });
      return;
    }

    // Fallback: no streaming session was opened for this message (e.g.,
    // user picked a voice mid-message). Honor gating and play the whole
    // text via the replay path.
    if (
      !this.isTTSAvailable ||
      !this.autoSpeakEnabled ||
      this.currentVoice == null ||
      messageId === this.lastSpokenMessageId
    ) {
      return;
    }
    this.lastSpokenMessageId = messageId;
    this.play(messageId, text).catch(() => {
      // play() already logs and recovers; swallow to satisfy no-floating-promises.
    });
  }

  /**
   * Start (or retry) the Supertonic model download. Transitions through
   * `downloading` → (`ready` | `error`). Progress updates are throttled
   * by RNFS's `progressInterval` (500 ms).
   *
   * Non-blocking: the returned promise resolves after download completes
   * or fails, but the UI is not blocked — the user can navigate away and
   * the state updates reactively via MobX.
   */
  async downloadSupertonic(): Promise<void> {
    if (this.supertonicDownloadState === 'downloading') {
      return;
    }
    runInAction(() => {
      this.supertonicDownloadState = 'downloading';
      this.supertonicDownloadProgress = 0;
      this.supertonicDownloadError = null;
    });

    const engine = getEngine('supertonic') as SupertonicEngine;
    try {
      await engine.downloadModel(progress => {
        runInAction(() => {
          this.supertonicDownloadProgress = progress;
        });
      });
      runInAction(() => {
        this.supertonicDownloadState = 'ready';
        this.supertonicDownloadProgress = 1;
      });
    } catch (err) {
      console.warn('[TTSStore] Supertonic download failed:', err);
      runInAction(() => {
        this.supertonicDownloadState = 'error';
        this.supertonicDownloadError =
          err instanceof Error ? err.message : String(err);
      });
    }
  }

  /**
   * Retry a failed Supertonic download. Thin wrapper over
   * `downloadSupertonic()` — the distinct action exists so UI can
   * bind Retry semantics unambiguously.
   */
  async retryDownload(): Promise<void> {
    return this.downloadSupertonic();
  }

  /**
   * Remove the Supertonic model bundle and reset state to
   * `not_installed`. Also clears `currentVoice` if it points at a
   * Supertonic voice so the app doesn't crash trying to synthesize
   * with a missing model.
   */
  async deleteSupertonic(): Promise<void> {
    const engine = getEngine('supertonic') as SupertonicEngine;
    try {
      await engine.deleteModel();
    } catch (err) {
      console.warn('[TTSStore] Supertonic delete failed:', err);
    }
    runInAction(() => {
      this.supertonicDownloadState = 'not_installed';
      this.supertonicDownloadProgress = 0;
      this.supertonicDownloadError = null;
      if (this.currentVoice?.engine === 'supertonic') {
        this.currentVoice = null;
      }
    });
  }
}

export const ttsStore = new TTSStore();
