import {AppState, AppStateStatus} from 'react-native';

import {makeAutoObservable, reaction, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import type {
  StreamProgressEvent,
  SupertonicLanguage,
} from '@pocketpalai/react-native-speech';

import {
  getEngine,
  getNeuralEngine,
  getPhononSupport,
  SupertonicEngine,
  TTS_MIN_RAM_BYTES,
  TTS_PREVIEW_SAMPLE,
  SUPERTONIC_MODEL_ESTIMATED_BYTES,
  KOKORO_MODEL_ESTIMATED_BYTES,
  KITTEN_MODEL_ESTIMATED_BYTES,
  PHONON_MODEL_ESTIMATED_BYTES,
  ttsRuntime,
} from '../services/tts';
import type {
  EngineId,
  NeuralEngineId,
  StreamOptions,
  StreamingHandle,
  SupertonicSteps,
  Voice,
} from '../services/tts';
import {
  ThinkingStripper,
  pickThinkingPlaceholder,
} from '../services/tts/thinkingStripper';
import {VOICE_FIRST_CHUNK_HOLD_MS} from '../services/voice/constants';
import {vtrace} from '../utils/voiceTrace';
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

export type {NeuralEngineId};

const DEFAULT_SUPERTONIC_STEPS: SupertonicSteps = 5;

/**
 * Default Supertonic synthesis language: `na` ("Auto"), the trained
 * language-agnostic tag in the v3 model. New and existing users start here
 * (existing users have no persisted key, so hydration leaves it at `na`).
 */
const DEFAULT_SUPERTONIC_LANGUAGE: SupertonicLanguage = 'na';

const previewMessageId = (voice: Voice): string =>
  `preview:${voice.engine}:${voice.id}`;

/** A voice reply's stream and its first-chunk hold. */
type VoiceStream = {
  messageId: string;
  held: string[] | null;
  holdTimer: ReturnType<typeof setTimeout> | null;
  chars: number;
};

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

  /** True while a voice-mode session is open; it speaks every reply. */
  voiceOutputActive: boolean = false;
  private holdFirstChunk: boolean = false;
  /** Message id of the voice reply whose speech has begun playing. */
  voiceSpeechStarted: string | null = null;
  /** Message id of the last voice reply whose speech failed. */
  voiceStreamFailed: string | null = null;
  private voiceStream: VoiceStream | null = null;

  // Persisted user preferences
  autoSpeakEnabled: boolean = false;
  currentVoice: Voice | null = null;
  /**
   * Supertonic diffusion-step count. Persisted so a user's quality
   * preference survives restart. Missing values default to 5 on first load.
   */
  supertonicSteps: SupertonicSteps = DEFAULT_SUPERTONIC_STEPS;
  /**
   * Supertonic synthesis language. Persisted so the user's choice survives
   * restart. Defaults to `na` ("Auto", language-agnostic). Read at every
   * Supertonic synthesis entry point and passed explicitly so the engine
   * default never governs. See architecture/tts.md §4a.
   */
  supertonicLanguage: SupertonicLanguage = DEFAULT_SUPERTONIC_LANGUAGE;

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

  phononDownloadState: NeuralDownloadState = 'not_installed';
  phononDownloadProgress: number = 0;
  phononDownloadError: string | null = null;

  /** Whether the add-on's probe said Phonon runs here, this session. */
  phononSupported: boolean = false;

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
    makeAutoObservable<TTSStore, 'holdFirstChunk' | 'voiceStream'>(
      this,
      {holdFirstChunk: false, voiceStream: false},
      {autoBind: true},
    );
    makePersistable(this, {
      name: 'TTSStore',
      properties: [
        'autoSpeakEnabled',
        'currentVoice',
        'supertonicSteps',
        'supertonicLanguage',
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

    await this.refreshPhononSupport();

    // Lifecycle hooks below run UNCONDITIONALLY — see architecture/tts.md §4e
    // and I8. A user on a low-memory device may flip `userTTSOverride = true`
    // mid-session, at which point the AppState listener and session reaction
    // must already be in place. The four call-site guards in `play`,
    // `preview`, `onAssistantMessageStart`, `onAssistantMessageComplete`
    // (plus component-level guards) remain the gate on user-visible work.

    // Derive each neural engine's install state from disk in parallel.
    const neuralIds = Object.keys(
      TTSStore.ENGINE_ESTIMATED_BYTES,
    ) as NeuralEngineId[];
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
        this.stop('session_change');
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
      this.stop('background')
        .then(() => ttsRuntime.release())
        .catch(err => {
          console.warn('[TTSStore] background release failed:', err);
        });
    }
  };

  /** Whether the next assistant reply opens a speech stream. */
  get streamsReplies(): boolean {
    return (
      this.voiceOutputActive || (this.isTTSAvailable && this.autoSpeakEnabled)
    );
  }

  setVoiceOutputActive(
    active: boolean,
    {holdFirstChunk = false}: {holdFirstChunk?: boolean} = {},
  ) {
    this.voiceOutputActive = active;
    this.holdFirstChunk = active && holdFirstChunk;
  }

  isEngineOffered(id: EngineId): boolean {
    return id !== 'phonon' || this.phononSupported;
  }

  /**
   * Re-read the Phonon probe. When it says unsupported, a selected Phonon
   * voice is released and cleared; its model files stay on disk, because
   * deleting them would void the add-on's recorded load failure.
   */
  async refreshPhononSupport(): Promise<void> {
    let support: {supported: boolean; reason: string};
    try {
      support = await getPhononSupport();
    } catch {
      support = {supported: false, reason: 'error'};
    }
    runInAction(() => {
      this.phononSupported = support.supported;
    });
    if (support.supported) {
      return;
    }
    console.log(`[tts] phonon hidden: ${support.reason}`);
    if (this.currentVoice?.engine !== 'phonon') {
      return;
    }
    if (ttsRuntime.getActiveEngineId() === 'phonon') {
      await this.stop();
      await ttsRuntime.release();
    }
    runInAction(() => {
      if (this.currentVoice?.engine === 'phonon') {
        this.currentVoice = null;
      }
    });
  }

  private refreshAfterPhononFailure(): void {
    this.refreshPhononSupport().catch(err => {
      console.warn('[TTSStore] phonon support refresh failed:', err);
    });
  }

  private withPhononFailureHook(handle: StreamingHandle): StreamingHandle {
    return {
      appendText: chunk => handle.appendText(chunk),
      finalize: async () => {
        try {
          await handle.finalize();
        } catch (err) {
          this.refreshAfterPhononFailure();
          throw err;
        }
      },
      cancel: () => {
        const cancelled = handle.cancel();
        this.refreshAfterPhononFailure();
        return cancelled;
      },
    };
  }

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

  /**
   * The sole explicit writer of `supertonicLanguage` (the language picker).
   * Takes effect on the next utterance; in-flight playback is not restarted.
   */
  setSupertonicLanguage(language: SupertonicLanguage) {
    this.supertonicLanguage = language;
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
    switch (id) {
      case 'supertonic':
        this.supertonicDownloadState = state;
        break;
      case 'kokoro':
        this.kokoroDownloadState = state;
        break;
      case 'kitten':
        this.kittenDownloadState = state;
        break;
      case 'phonon':
        this.phononDownloadState = state;
        break;
      default: {
        const unhandled: never = id;
        throw new Error(`[TTSStore] unknown engine ${String(unhandled)}`);
      }
    }
  }

  private setDownloadProgress(id: NeuralEngineId, progress: number) {
    switch (id) {
      case 'supertonic':
        this.supertonicDownloadProgress = progress;
        break;
      case 'kokoro':
        this.kokoroDownloadProgress = progress;
        break;
      case 'kitten':
        this.kittenDownloadProgress = progress;
        break;
      case 'phonon':
        this.phononDownloadProgress = progress;
        break;
      default: {
        const unhandled: never = id;
        throw new Error(`[TTSStore] unknown engine ${String(unhandled)}`);
      }
    }
  }

  private setDownloadError(id: NeuralEngineId, error: string | null) {
    switch (id) {
      case 'supertonic':
        this.supertonicDownloadError = error;
        break;
      case 'kokoro':
        this.kokoroDownloadError = error;
        break;
      case 'kitten':
        this.kittenDownloadError = error;
        break;
      case 'phonon':
        this.phononDownloadError = error;
        break;
      default: {
        const unhandled: never = id;
        throw new Error(`[TTSStore] unknown engine ${String(unhandled)}`);
      }
    }
  }

  private getDownloadState(id: NeuralEngineId): NeuralDownloadState {
    switch (id) {
      case 'supertonic':
        return this.supertonicDownloadState;
      case 'kokoro':
        return this.kokoroDownloadState;
      case 'kitten':
        return this.kittenDownloadState;
      case 'phonon':
        return this.phononDownloadState;
      default: {
        const unhandled: never = id;
        throw new Error(`[TTSStore] unknown engine ${String(unhandled)}`);
      }
    }
  }

  /**
   * Stop any in-flight playback and reset state to idle.
   */
  async stop(by = 'other'): Promise<void> {
    const state = this.playbackState;
    const voice = this.currentVoice;
    vtrace('tts.stop', {by, mode: state.mode});
    runInAction(() => {
      this.playbackState = {mode: 'idle'};
    });
    this.streamStripper = null;
    this.streamPlaceholderEmitted = false;
    this.clearVoiceHold();
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
          language: this.supertonicLanguage,
          inferenceSteps: this.supertonicSteps,
        });
      } else {
        await engine.play(spokenText, voice);
      }
    } catch (err) {
      console.warn('[TTSStore] play failed:', err);
      if (voice.engine === 'phonon') {
        this.refreshAfterPhononFailure();
      }
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
          language: this.supertonicLanguage,
          inferenceSteps: this.supertonicSteps,
        });
      } else {
        await engine.play(TTS_PREVIEW_SAMPLE, voice);
      }
    } catch (err) {
      console.warn('[TTSStore] preview failed:', err);
      if (voice.engine === 'phonon') {
        this.refreshAfterPhononFailure();
      }
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
      !this.streamsReplies ||
      this.currentVoice == null ||
      messageId === this.lastSpokenMessageId
    ) {
      return;
    }
    // Stop ANY prior playback before opening the new session. The stop
    // promise is passed to the streaming handle so it waits for the old
    // `Speech.stop()` to complete before starting synthesis — prevents
    // the old stop flag from killing the new stream's first sentence.
    const stopDone = this.stop('new_stream').catch(err => {
      console.warn('[TTSStore] stop before new stream failed:', err);
    });

    const voice = this.currentVoice;
    this.lastSpokenMessageId = messageId;
    this.streamStripper = new ThinkingStripper();
    this.streamPlaceholderEmitted = false;
    const voiceOpts = this.openVoiceStream(messageId);
    const engine = getEngine(voice.engine);
    let engineHandle: StreamingHandle;
    if (voice.engine === 'supertonic') {
      engineHandle = (engine as SupertonicEngine).playStreaming(
        voice,
        stopDone,
        {
          ...voiceOpts,
          language: this.supertonicLanguage,
          inferenceSteps: this.supertonicSteps,
        },
      );
    } else if (voiceOpts) {
      engineHandle = engine.playStreaming(voice, stopDone, voiceOpts);
    } else {
      engineHandle = engine.playStreaming(voice, stopDone);
    }
    const handle =
      voice.engine === 'phonon'
        ? this.withPhononFailureHook(engineHandle)
        : engineHandle;
    runInAction(() => {
      this.playbackState = {mode: 'streaming', messageId, handle};
    });
    vtrace('tts.open', {voice: !!voiceOpts, engine: voice.engine});
  }

  private openVoiceStream(messageId: string): StreamOptions | undefined {
    if (!this.voiceOutputActive) {
      this.voiceStream = null;
      return undefined;
    }
    this.voiceSpeechStarted = null;
    this.voiceStreamFailed = null;
    const stream: VoiceStream = {
      messageId,
      held: this.holdFirstChunk ? [] : null,
      holdTimer: null,
      chars: 0,
    };
    if (stream.held) {
      stream.holdTimer = setTimeout(
        () => this.releaseHeldVoiceText(messageId),
        VOICE_FIRST_CHUNK_HOLD_MS,
      );
    }
    this.voiceStream = stream;
    return {
      firstChunk: 'clause',
      onProgress: event => this.onVoiceProgress(messageId, event),
    };
  }

  private onVoiceProgress(messageId: string, event: StreamProgressEvent) {
    vtrace('tts.chunk', {
      i: event.chunkIndex,
      chars: event.chunkText.length,
      current: this.voiceStream?.messageId === messageId,
    });
    if (this.voiceStream?.messageId === messageId) {
      this.voiceSpeechStarted = messageId;
    }
  }

  private appendReplyText(handle: StreamingHandle, text: string) {
    if (this.voiceStream) {
      this.voiceStream.chars += text.length;
    }
    const held = this.voiceStream?.held;
    if (held) {
      held.push(text);
    } else {
      handle.appendText(text);
    }
  }

  private appendPlaceholder(handle: StreamingHandle) {
    this.streamPlaceholderEmitted = true;
    this.appendReplyText(handle, `${pickThinkingPlaceholder()} `);
  }

  private releaseHeldVoiceText(messageId: string) {
    const stream = this.voiceStream;
    const state = this.playbackState;
    if (stream?.messageId !== messageId || !stream.held) {
      return;
    }
    this.clearVoiceHold();
    const held = stream.held;
    stream.held = null;
    vtrace('tts.unhold', {parts: held.length});
    if (state.mode !== 'streaming' || state.messageId !== messageId) {
      return;
    }
    for (const text of held) {
      state.handle.appendText(text);
    }
  }

  private clearVoiceHold() {
    const stream = this.voiceStream;
    if (stream?.holdTimer) {
      clearTimeout(stream.holdTimer);
      stream.holdTimer = null;
    }
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
      this.appendReplyText(state.handle, chunkText);
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
      this.appendPlaceholder(state.handle);
      return;
    }
    if (cleaned.length > 0) {
      if (stripper.hadNonEmptyThink() && !this.streamPlaceholderEmitted) {
        this.appendPlaceholder(state.handle);
      }
      this.appendReplyText(state.handle, cleaned);
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
            this.appendPlaceholder(state.handle);
          }
          this.appendReplyText(state.handle, leftover);
        }
      }
      if (this.voiceStream) {
        this.releaseHeldVoiceText(this.voiceStream.messageId);
      }
      const isVoiceReply = this.voiceStream?.messageId === messageId;
      vtrace('tts.finalize', {
        voice: isVoiceReply,
        chars: this.voiceStream?.chars,
      });
      state.handle
        .finalize()
        .catch(err => {
          console.warn('[TTSStore] finalize failed:', err);
          vtrace('tts.finalize.fail', {err: String(err)});
          if (isVoiceReply) {
            runInAction(() => {
              this.voiceStreamFailed = messageId;
            });
          }
        })
        .finally(() => {
          runInAction(() => {
            const owns =
              this.playbackState.mode === 'streaming' &&
              this.playbackState.messageId === messageId;
            vtrace('tts.finalized', {owns});
            if (owns) {
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
      !this.streamsReplies ||
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
    phonon: PHONON_MODEL_ESTIMATED_BYTES,
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

    const engine = getNeuralEngine(id);

    // Reclaim engine-specific legacy files BEFORE the disk-space preflight,
    // so a borderline device upgrading from an older engine layout (e.g.
    // Kokoro FP16 → FP32) is not blocked by space the migration is about to
    // free. Idempotent; safe when there is nothing to reclaim.
    try {
      await engine.reclaimLegacySpace?.();
    } catch (err) {
      console.warn(`[TTSStore] ${id} legacy reclaim failed:`, err);
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
    const engine = getNeuralEngine(id);
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

  async downloadPhonon(): Promise<void> {
    return this.downloadNeuralEngine('phonon');
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

  async retryPhononDownload(): Promise<void> {
    return this.downloadNeuralEngine('phonon');
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

  async deletePhonon(): Promise<void> {
    return this.deleteNeuralEngine('phonon');
  }
}

export const ttsStore = new TTSStore();
