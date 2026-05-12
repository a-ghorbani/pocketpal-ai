import {AppState, AppStateStatus} from 'react-native';

import {makeAutoObservable, reaction, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

import {
  getEngine,
  KittenEngine,
  KokoroEngine,
  SupertonicEngine,
  TTS_MIN_RAM_BYTES,
  TTS_PREVIEW_SAMPLE,
  SUPERTONIC_MODEL_ESTIMATED_BYTES,
  KOKORO_MODEL_ESTIMATED_BYTES,
  KITTEN_MODEL_ESTIMATED_BYTES,
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
 * Availability gate: `isTTSAvailable` is the single boolean every TTS-aware
 * surface reads. It is derived from `deviceMeetsMemory` (set once in `init()`
 * from `DeviceInfo.getTotalMemory()`) and `userTTSOverride` (a persisted user
 * choice). See architecture/tts.md §4a for the formula. The lifecycle hooks
 * registered in `init()` (AppState listener, session reaction, isInstalled
 * checks) run unconditionally so a low-memory user opting in mid-session has
 * a safe runtime — see architecture/tts.md §4e.
 *
 * Streaming: `useChatSession` calls three hooks as an assistant message is
 * produced — `onAssistantMessageStart`, `onAssistantMessageChunk`, and
 * `onAssistantMessageComplete`. The first creates a `StreamingHandle`, the
 * second feeds deltas into it, the third flushes the remaining buffer. If
 * `start` is missed (e.g., voice picked mid-message) `complete` falls back
 * to the full-text `play()` path.
 */
export class TTSStore {
  // Set once in init() from getTotalMemory() >= TTS_MIN_RAM_BYTES; never
  // re-checked. RAM doesn't change at runtime. See architecture/tts.md §1a.
  deviceMeetsMemory: boolean = false;
  // Tristate persisted user choice. null = not set (mirrors deviceMeetsMemory).
  // See architecture/tts.md §4a, D1.
  userTTSOverride: boolean | null = null;
  private initialized: boolean = false;

  /**
   * The TTS availability gate. Single boolean every TTS-aware surface reads.
   * Derived from `userTTSOverride` and `deviceMeetsMemory` per the formula
   * in architecture/tts.md §4a.1: an explicit user override wins; otherwise
   * the device-memory default applies.
   */
  get isTTSAvailable(): boolean {
    if (this.userTTSOverride === true) {
      return true;
    }
    if (this.userTTSOverride === false) {
      return false;
    }
    return this.deviceMeetsMemory;
  }

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
  /** Free disk bytes, refreshed each time the setup sheet opens. */
  freeDiskBytes: number | null = null;

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
  /**
   * Voice id pending restore after a forced engine re-download (e.g. Kokoro
   * FP16 → FP32 migration). When `init()` finds a persisted voice whose
   * engine reports not-installed, the voice id is stashed here so the next
   * successful download of that engine can restore the user's selection
   * instead of falling back to `voices[0]`. Reset to null after restore.
   * Map keyed by engine id; only neural engines participate.
   */
  private pendingVoiceRestore: Partial<Record<NeuralEngineId, string>> = {};

  // Per-streaming-session state for stripping `<think>…</think>` markup.
  private streamStripper: ThinkingStripper | null = null;
  private streamPlaceholderEmitted: boolean = false;

  constructor() {
    makeAutoObservable(this, {}, {autoBind: true});
    makePersistable(this, {
      name: 'TTSStore',
      properties: [
        'autoSpeakEnabled',
        'currentVoice',
        'supertonicSteps',
        'userTTSOverride',
      ],
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

    runInAction(() => {
      this.deviceMeetsMemory = totalMemory >= TTS_MIN_RAM_BYTES;
    });

    // Lifecycle hooks below run UNCONDITIONALLY — see architecture/tts.md §4e
    // and I8. A user on a low-memory device may flip `userTTSOverride = true`
    // mid-session, at which point the AppState listener and session reaction
    // must already be in place. The four call-site guards in `play`,
    // `preview`, `onAssistantMessageStart`, `onAssistantMessageComplete`
    // (plus component-level guards) remain the gate on user-visible work.

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
      // Reconcile persisted currentVoice: if the engine's model files
      // were deleted (app restore, manual cleanup) or the engine layout
      // changed (e.g. Kokoro FP16 → FP32 migration), clear the voice so
      // play/stream paths don't crash trying to init a missing engine.
      // Stash the voice id first so it can be restored after re-download
      // — otherwise users lose their selection across the forced upgrade.
      if (
        this.currentVoice != null &&
        this.currentVoice.engine !== 'system' &&
        this.getDownloadState(this.currentVoice.engine as NeuralEngineId) !==
          'ready'
      ) {
        const engineId = this.currentVoice.engine as NeuralEngineId;
        this.pendingVoiceRestore[engineId] = this.currentVoice.id;
        this.currentVoice = null;
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
    if (nextAppState === 'background') {
      // Stop in-flight audio AND release the active engine's native
      // resources (200-450 MB depending on engine). Re-init is lazy on
      // the next play after foreground.
      // Only react to 'background' — 'inactive' fires for transient
      // interruptions (Control Center, incoming call sheet, notification
      // tap) that shouldn't tear down a 200+ MB engine.
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

  /**
   * Persist the user's explicit choice for the TTS availability gate.
   * `true` forces the gate open even on low-memory devices; `false` forces
   * it closed even on high-memory devices. Mirrors `setAutoSpeak(false)`'s
   * stop+release pattern when the gate transitions from open to closed,
   * to free engine RAM immediately. See architecture/tts.md §4a.5, I3, I6.
   */
  setUserTTSOverride(value: boolean): void {
    const wasAvailable = this.isTTSAvailable;
    this.userTTSOverride = value;
    if (wasAvailable && !value) {
      this.stop()
        .then(() => ttsRuntime.release())
        .catch(err => {
          console.warn('[TTSStore] release on TTS opt-out failed:', err);
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
    this.refreshFreeDisk();
  }

  /** Re-read free disk space. Called on sheet open so the UI can
   *  disable Install buttons for engines that won't fit. */
  async refreshFreeDisk() {
    try {
      const bytes = await DeviceInfo.getFreeDiskStorage('important');
      runInAction(() => {
        this.freeDiskBytes = bytes;
      });
    } catch (err) {
      console.warn('[TTSStore] refreshFreeDisk failed:', err);
    }
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
    // Stop ANY prior playback before opening the new session. The stop
    // promise is passed to the streaming handle so it waits for the old
    // `Speech.stop()` to complete before starting synthesis — prevents
    // the old stop flag from killing the new stream's first sentence.
    const stopDone = this.stop().catch(err => {
      console.warn('[TTSStore] stop before new stream failed:', err);
    });

    const voice = this.currentVoice;
    this.lastSpokenMessageId = messageId;
    this.streamStripper = new ThinkingStripper();
    this.streamPlaceholderEmitted = false;
    const engine = getEngine(voice.engine);
    const handle =
      voice.engine === 'supertonic'
        ? (engine as SupertonicEngine).playStreaming(voice, stopDone, {
            inferenceSteps: this.supertonicSteps,
          })
        : engine.playStreaming(voice, stopDone);
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
              // Only reset stripper if this message still owns it —
              // a new message may have already set its own stripper.
              this.streamStripper = null;
              this.streamPlaceholderEmitted = false;
            }
          });
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

  private static readonly ENGINE_ESTIMATED_BYTES: Record<
    NeuralEngineId,
    number
  > = {
    supertonic: SUPERTONIC_MODEL_ESTIMATED_BYTES,
    kokoro: KOKORO_MODEL_ESTIMATED_BYTES,
    kitten: KITTEN_MODEL_ESTIMATED_BYTES,
  };

  private async downloadNeuralEngine(id: NeuralEngineId): Promise<void> {
    if (this.getDownloadState(id) === 'downloading') {
      return;
    }
    // Set downloading immediately so concurrent calls are blocked.
    runInAction(() => {
      this.setDownloadState(id, 'downloading');
      this.setDownloadProgress(id, 0);
      this.setDownloadError(id, null);
    });

    const engine = getEngine(id) as
      | SupertonicEngine
      | KokoroEngine
      | KittenEngine;

    // Reclaim engine-specific legacy files BEFORE the disk-space preflight,
    // so a borderline device upgrading from an older engine layout (e.g.
    // Kokoro FP16 → FP32) is not blocked by space the migration is about to
    // free. Idempotent; safe when there is nothing to reclaim.
    if (
      'reclaimLegacySpace' in engine &&
      typeof engine.reclaimLegacySpace === 'function'
    ) {
      try {
        await engine.reclaimLegacySpace();
      } catch (err) {
        console.warn(`[TTSStore] ${id} legacy reclaim failed:`, err);
      }
    }

    // Safety-net disk-space check. The UI already disables the Install
    // button when `freeDiskBytes` is too low, so this is a last resort
    // guard for race conditions (space changed between sheet open and tap).
    const estimatedBytes = TTSStore.ENGINE_ESTIMATED_BYTES[id];
    const requiredBytes = Math.ceil(estimatedBytes * 1.2);
    try {
      const freeBytes = await DeviceInfo.getFreeDiskStorage('important');
      if (freeBytes < requiredBytes) {
        runInAction(() => {
          this.setDownloadState(id, 'not_installed');
          this.freeDiskBytes = freeBytes;
        });
        return;
      }
    } catch (err) {
      console.warn('[TTSStore] disk-space preflight failed:', err);
    }
    try {
      await engine.downloadModel(progress => {
        runInAction(() => {
          this.setDownloadProgress(id, progress);
        });
      });
      // Auto-select a voice when none is set — so play and auto-speak work
      // immediately after install. If a previous selection for this engine
      // was stashed during init() (e.g. forced re-download after a model
      // layout migration), restore it when still valid; otherwise fall
      // back to the first voice.
      const voices = await engine.getVoices();
      runInAction(() => {
        this.setDownloadState(id, 'ready');
        this.setDownloadProgress(id, 1);
        if (this.currentVoice == null && voices.length > 0) {
          const pendingId = this.pendingVoiceRestore[id];
          const restored =
            pendingId != null ? voices.find(v => v.id === pendingId) : null;
          this.currentVoice = restored ?? voices[0]!;
        }
        delete this.pendingVoiceRestore[id];
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
