import {AppState, AppStateStatus} from 'react-native';

import {makeAutoObservable, reaction, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

import {
  configureAudioSession,
  getEngine,
  KittenEngine,
  KokoroEngine,
  SupertonicEngine,
  TTS_MIN_RAM_BYTES,
  TTS_PREVIEW_SAMPLE,
  ttsRuntime,
} from '../services/tts';
import type {StreamingHandle, SupertonicSteps, Voice} from '../services/tts';
import {
  ThinkingStripper,
  pickThinkingPlaceholder,
} from '../services/tts/thinkingStripper';
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
 * State machine for a neural-engine model download lifecycle.
 * Derived from the engine's `isInstalled()` on `init()` — never
 * persisted; the source of truth is the file system.
 */
export type NeuralDownloadState =
  | 'not_installed'
  | 'downloading'
  | 'ready'
  | 'error';

/** Alias preserved for external consumers that imported the v1.2 name. */
export type SupertonicDownloadState = NeuralDownloadState;

/** Neural engine ids managed by the store's download state machines. */
export type NeuralEngineId = 'supertonic' | 'kokoro' | 'kitten';

const DEFAULT_SUPERTONIC_STEPS: SupertonicSteps = 5;

const previewMessageId = (voice: Voice): string =>
  `preview:${voice.engine}:${voice.id}`;

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
  /**
   * Supertonic diffusion-step count. Persisted so a user's quality
   * preference survives restart. Missing values default to 5 on first load.
   */
  supertonicSteps: SupertonicSteps = DEFAULT_SUPERTONIC_STEPS;

  // UI state
  isSetupSheetOpen: boolean = false;

  // Per-engine model lifecycle — derived state, NOT persisted.
  supertonicDownloadState: NeuralDownloadState = 'not_installed';
  supertonicDownloadProgress: number = 0;
  supertonicDownloadError: string | null = null;

  kokoroDownloadState: NeuralDownloadState = 'not_installed';
  kokoroDownloadProgress: number = 0;
  kokoroDownloadError: string | null = null;

  kittenDownloadState: NeuralDownloadState = 'not_installed';
  kittenDownloadProgress: number = 0;
  kittenDownloadError: string | null = null;

  // Idempotency guard for the auto-speak path.
  lastSpokenMessageId: string | null = null;

  private appStateSubscription: {remove: () => void} | null = null;
  private sessionReactionDispose: (() => void) | null = null;

  // Per-streaming-session state for stripping `<think>…</think>` markup.
  private streamStripper: ThinkingStripper | null = null;
  private streamPlaceholderEmitted: boolean = false;

  constructor() {
    makeAutoObservable(this, {}, {autoBind: true});
    makePersistable(this, {
      name: 'TTSStore',
      properties: ['autoSpeakEnabled', 'currentVoice', 'supertonicSteps'],
      storage: AsyncStorage,
    });
  }

  /**
   * Initialize the store. Idempotent — safe to call multiple times; only the
   * first call does work.
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

    // Derive each neural engine's install state from disk in parallel.
    const neuralIds: NeuralEngineId[] = ['supertonic', 'kokoro', 'kitten'];
    const results = await Promise.all(
      neuralIds.map(async id => {
        try {
          return {id, installed: await getEngine(id).isInstalled()};
        } catch (err) {
          console.warn(`[TTSStore] ${id} isInstalled check failed:`, err);
          return {id, installed: false};
        }
      }),
    );
    runInAction(() => {
      for (const {id, installed} of results) {
        this.setDownloadState(id, installed ? 'ready' : 'not_installed');
      }
    });

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
      // Stop in-flight audio AND release the active engine's native
      // resources (200-450 MB depending on engine). Re-init is lazy on
      // the next play after foreground.
      this.stop()
        .then(() => ttsRuntime.release())
        .catch(err => {
          console.warn('[TTSStore] background release failed:', err);
        });
    }
  };

  setAutoSpeak(on: boolean) {
    this.autoSpeakEnabled = on;
    if (!on) {
      // Turning auto-speak off frees the active neural engine's RAM
      // proactively — the user has signaled they don't want passive
      // playback. Re-init is lazy on the next preview / message replay.
      this.stop()
        .then(() => ttsRuntime.release())
        .catch(err => {
          console.warn('[TTSStore] release on auto-speak off failed:', err);
        });
    }
  }

  setCurrentVoice(v: Voice | null) {
    this.currentVoice = v;
  }

  setSupertonicSteps(steps: SupertonicSteps) {
    this.supertonicSteps = steps;
  }

  openSetupSheet() {
    this.isSetupSheetOpen = true;
  }

  closeSetupSheet() {
    this.isSetupSheetOpen = false;
  }

  // --- Per-engine state helpers ----------------------------------------

  private setDownloadState(id: NeuralEngineId, state: NeuralDownloadState) {
    if (id === 'supertonic') {
      this.supertonicDownloadState = state;
    } else if (id === 'kokoro') {
      this.kokoroDownloadState = state;
    } else {
      this.kittenDownloadState = state;
    }
  }

  private setDownloadProgress(id: NeuralEngineId, progress: number) {
    if (id === 'supertonic') {
      this.supertonicDownloadProgress = progress;
    } else if (id === 'kokoro') {
      this.kokoroDownloadProgress = progress;
    } else {
      this.kittenDownloadProgress = progress;
    }
  }

  private setDownloadError(id: NeuralEngineId, error: string | null) {
    if (id === 'supertonic') {
      this.supertonicDownloadError = error;
    } else if (id === 'kokoro') {
      this.kokoroDownloadError = error;
    } else {
      this.kittenDownloadError = error;
    }
  }

  private getDownloadState(id: NeuralEngineId): NeuralDownloadState {
    if (id === 'supertonic') {
      return this.supertonicDownloadState;
    }
    if (id === 'kokoro') {
      return this.kokoroDownloadState;
    }
    return this.kittenDownloadState;
  }

  /**
   * Stop any in-flight playback and reset state to idle.
   */
  async stop(): Promise<void> {
    const state = this.playbackState;
    const voice = this.currentVoice;
    runInAction(() => {
      this.playbackState = {mode: 'idle'};
    });
    this.streamStripper = null;
    this.streamPlaceholderEmitted = false;
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
   * Speak `text` as a single utterance (replay path).
   */
  async play(
    messageId: string,
    text: string,
    opts?: {hadReasoning?: boolean; voiceOverride?: Voice},
  ): Promise<void> {
    if (!this.isTTSAvailable) {
      return;
    }
    const voice = opts?.voiceOverride ?? this.currentVoice;
    if (!voice) {
      return;
    }

    await this.stop();

    const {text: cleanText, hadNonEmptyThink} = ThinkingStripper.stripFinal(
      text,
      {hadReasoning: opts?.hadReasoning},
    );
    const spokenText = hadNonEmptyThink
      ? `${pickThinkingPlaceholder()} ${cleanText}`
      : cleanText;

    runInAction(() => {
      this.playbackState = {mode: 'playing', messageId};
    });

    try {
      const engine = getEngine(voice.engine);
      if (voice.engine === 'supertonic') {
        await (engine as SupertonicEngine).play(spokenText, voice, {
          inferenceSteps: this.supertonicSteps,
        });
      } else {
        await engine.play(spokenText, voice);
      }
    } catch (err) {
      console.warn('[TTSStore] play failed:', err);
    } finally {
      runInAction(() => {
        if (
          this.playbackState.mode === 'playing' &&
          this.playbackState.messageId === messageId
        ) {
          this.playbackState = {mode: 'idle'};
        }
      });
    }
  }

  /**
   * Audition path — speak `TTS_PREVIEW_SAMPLE` with `voice` and route
   * through the store so it interacts cleanly with any in-flight stream
   * or replay (no overlapping audio, no engine-swap races).
   *
   * Skips the thinking-stripper entirely — preview text is fixed and
   * known clean.
   *
   * messageId is engine-qualified (`preview:<engine>:<voiceId>`) so two
   * engines that share a voice id can't collide on the cleanup guard.
   */
  async preview(voice: Voice): Promise<void> {
    if (!this.isTTSAvailable) {
      return;
    }
    const messageId = previewMessageId(voice);
    await this.stop();
    runInAction(() => {
      this.playbackState = {mode: 'playing', messageId};
    });
    try {
      const engine = getEngine(voice.engine);
      if (voice.engine === 'supertonic') {
        await (engine as SupertonicEngine).play(TTS_PREVIEW_SAMPLE, voice, {
          inferenceSteps: this.supertonicSteps,
        });
      } else {
        await engine.play(TTS_PREVIEW_SAMPLE, voice);
      }
    } catch (err) {
      console.warn('[TTSStore] preview failed:', err);
    } finally {
      runInAction(() => {
        if (
          this.playbackState.mode === 'playing' &&
          this.playbackState.messageId === messageId
        ) {
          this.playbackState = {mode: 'idle'};
        }
      });
    }
  }

  /**
   * `true` when a preview for `voice` is currently in flight. Components
   * use this to swap their play icon for stop while the engine loads
   * and speaks (Kokoro warm-up is ~4s — without this the user has no
   * feedback that their tap registered).
   */
  isPreviewingVoice(voice: Voice): boolean {
    return (
      this.playbackState.mode === 'playing' &&
      this.playbackState.messageId === previewMessageId(voice)
    );
  }

  /** First token / message creation. Opens a streaming session. */
  onAssistantMessageStart(messageId: string): void {
    if (
      !this.isTTSAvailable ||
      !this.autoSpeakEnabled ||
      this.currentVoice == null ||
      messageId === this.lastSpokenMessageId
    ) {
      return;
    }
    // Stop ANY prior playback (streaming OR preview/replay) before we
    // open a new streaming session — guarantees no overlapping audio.
    // `stop()` flips state to idle synchronously and fires the native
    // stop in the background; the new session's first speakNext will
    // serialize behind the old `Speech.stop()` via `ttsRuntime`.
    this.stop().catch(err => {
      console.warn('[TTSStore] stop before new stream failed:', err);
    });

    const voice = this.currentVoice;
    this.lastSpokenMessageId = messageId;
    this.streamStripper = new ThinkingStripper();
    this.streamPlaceholderEmitted = false;
    const engine = getEngine(voice.engine);
    const handle =
      voice.engine === 'supertonic'
        ? (engine as SupertonicEngine).playStreaming(voice, {
            inferenceSteps: this.supertonicSteps,
          })
        : engine.playStreaming(voice);
    runInAction(() => {
      this.playbackState = {mode: 'streaming', messageId, handle};
    });
  }

  /** Delta chunk from the LLM stream. */
  onAssistantMessageChunk(
    messageId: string,
    chunkText: string,
    reasoningDelta?: string,
  ) {
    const state = this.playbackState;
    if (state.mode !== 'streaming' || state.messageId !== messageId) {
      return;
    }
    const stripper = this.streamStripper;
    if (stripper == null) {
      state.handle.appendText(chunkText);
      return;
    }
    if (reasoningDelta) {
      stripper.noteReasoning(reasoningDelta);
    }
    const cleaned = stripper.feed(chunkText);
    if (
      stripper.hadNonEmptyThink() &&
      !this.streamPlaceholderEmitted &&
      cleaned.length === 0
    ) {
      state.handle.appendText(`${pickThinkingPlaceholder()} `);
      this.streamPlaceholderEmitted = true;
      return;
    }
    if (cleaned.length > 0) {
      if (stripper.hadNonEmptyThink() && !this.streamPlaceholderEmitted) {
        state.handle.appendText(`${pickThinkingPlaceholder()} `);
        this.streamPlaceholderEmitted = true;
      }
      state.handle.appendText(cleaned);
    }
  }

  /** Final completion — flushes streaming or falls back to replay. */
  onAssistantMessageComplete(
    messageId: string,
    text: string,
    opts?: {hadReasoning?: boolean},
  ) {
    const state = this.playbackState;
    if (state.mode === 'streaming' && state.messageId === messageId) {
      const stripper = this.streamStripper;
      if (stripper != null) {
        const leftover = stripper.flush();
        if (leftover.length > 0) {
          if (stripper.hadNonEmptyThink() && !this.streamPlaceholderEmitted) {
            state.handle.appendText(`${pickThinkingPlaceholder()} `);
            this.streamPlaceholderEmitted = true;
          }
          state.handle.appendText(leftover);
        }
      }
      state.handle
        .finalize()
        .catch(err => {
          console.warn('[TTSStore] finalize failed:', err);
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
          this.streamStripper = null;
          this.streamPlaceholderEmitted = false;
        });
      return;
    }

    if (
      !this.isTTSAvailable ||
      !this.autoSpeakEnabled ||
      this.currentVoice == null ||
      messageId === this.lastSpokenMessageId
    ) {
      return;
    }
    this.lastSpokenMessageId = messageId;
    this.play(messageId, text, {hadReasoning: opts?.hadReasoning}).catch(() => {
      // play() already logs and recovers; swallow to satisfy no-floating-promises.
    });
  }

  // --- Per-engine download actions --------------------------------------

  private async downloadNeuralEngine(id: NeuralEngineId): Promise<void> {
    if (this.getDownloadState(id) === 'downloading') {
      return;
    }
    runInAction(() => {
      this.setDownloadState(id, 'downloading');
      this.setDownloadProgress(id, 0);
      this.setDownloadError(id, null);
    });

    const engine = getEngine(id) as
      | SupertonicEngine
      | KokoroEngine
      | KittenEngine;
    try {
      await engine.downloadModel(progress => {
        runInAction(() => {
          this.setDownloadProgress(id, progress);
        });
      });
      runInAction(() => {
        this.setDownloadState(id, 'ready');
        this.setDownloadProgress(id, 1);
      });
    } catch (err) {
      console.warn(`[TTSStore] ${id} download failed:`, err);
      const message = err instanceof Error ? err.message : String(err);
      runInAction(() => {
        this.setDownloadState(id, 'error');
        this.setDownloadError(id, message);
      });
    }
  }

  private async deleteNeuralEngine(id: NeuralEngineId): Promise<void> {
    // Defensive: refuse to delete while a download is writing into the
    // same directory. The UI never offers delete in this state, but the
    // store API is public — guard anyway. Mirrors `downloadNeuralEngine`'s
    // own early-return on duplicate downloads.
    if (this.getDownloadState(id) === 'downloading') {
      return;
    }
    const engine = getEngine(id) as
      | SupertonicEngine
      | KokoroEngine
      | KittenEngine;
    // If this engine is currently active, stop in-flight audio AND
    // release the native resources BEFORE unlinking files. Skipping
    // either step risks a native crash from the engine touching files
    // that have just been removed under it.
    if (ttsRuntime.getActiveEngineId() === id) {
      await this.stop();
      await ttsRuntime.release();
    }
    try {
      await engine.deleteModel();
    } catch (err) {
      console.warn(`[TTSStore] ${id} delete failed:`, err);
    }
    runInAction(() => {
      this.setDownloadState(id, 'not_installed');
      this.setDownloadProgress(id, 0);
      this.setDownloadError(id, null);
      if (this.currentVoice?.engine === id) {
        this.currentVoice = null;
      }
    });
  }

  async downloadSupertonic(): Promise<void> {
    return this.downloadNeuralEngine('supertonic');
  }

  async downloadKokoro(): Promise<void> {
    return this.downloadNeuralEngine('kokoro');
  }

  async downloadKitten(): Promise<void> {
    return this.downloadNeuralEngine('kitten');
  }

  /** Retry a failed Supertonic download (preserved for API compat). */
  async retryDownload(): Promise<void> {
    return this.downloadNeuralEngine('supertonic');
  }

  async retryKokoroDownload(): Promise<void> {
    return this.downloadNeuralEngine('kokoro');
  }

  async retryKittenDownload(): Promise<void> {
    return this.downloadNeuralEngine('kitten');
  }

  async deleteSupertonic(): Promise<void> {
    return this.deleteNeuralEngine('supertonic');
  }

  async deleteKokoro(): Promise<void> {
    return this.deleteNeuralEngine('kokoro');
  }

  async deleteKitten(): Promise<void> {
    return this.deleteNeuralEngine('kitten');
  }
}

export const ttsStore = new TTSStore();
