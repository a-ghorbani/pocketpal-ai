import {
  AppState,
  type AppStateStatus,
  type NativeEventSubscription,
} from 'react-native';

import {makeAutoObservable, observable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

import {
  ASR_DEFAULT_TIER,
  ASR_DEVICE_TIERS,
  ASR_DISK_HEADROOM_FACTOR,
  ASR_INSUFFICIENT_STORAGE,
  ASR_LEVEL_HISTORY,
  ASR_TIERS,
  ASR_TIER_ORDER,
  whisperAsrEngine,
  readDeviceMemory,
  whisperFits,
} from '../services/asr';
import type {
  AsrDownloadState,
  AsrErrorKind,
  AsrTier,
  CaptureState,
} from '../services/asr';

import {modelStore} from './ModelStore';

/**
 * Store coordinating on-device voice input (ASR).
 *
 * Availability gate: `asrAvailable` is the single boolean the mic button and
 * the Settings surface read. It is derived from `deviceSupported` (the
 * model picker's device tier) and `userASROverride` (a persisted user
 * choice) — the same shape as the TTS gate. The whisper model
 * is downloaded per tier on demand and is never routed through the LLM
 * `ModelStore`; this store is the sole owner of ASR install/download state.
 *
 * Capture is tap-to-start, tap-to-stop: a hook drives the `captureState` FSM,
 * feeds `inputLevels` for the recording waveform, and calls `transcribe` on
 * stop; the resolved text is appended to the composer by the caller (never
 * auto-sent).
 */
export class ASRStore {
  // Tristate persisted user choice. null = not set (mirrors deviceSupported).
  userASROverride: boolean | null = null;
  private initialized: boolean = false;
  private appStateSubscription: NativeEventSubscription | null = null;

  // Persisted: which tier the user installed / uses.
  selectedTier: AsrTier = ASR_DEFAULT_TIER;
  // Persisted: the language whisper detected on the first transcription,
  // passed on every later one. null = detect on the next transcription.
  spokenLanguage: string | null = null;

  // Per-tier model lifecycle — derived from disk on init(), NOT persisted.
  downloadStates: Record<AsrTier, AsrDownloadState> = {
    base: 'not_installed',
    small: 'not_installed',
    'large-turbo': 'not_installed',
  };
  downloadProgress: Record<AsrTier, number> = {
    base: 0,
    small: 0,
    'large-turbo': 0,
  };
  downloadError: Record<AsrTier, string | null> = {
    base: null,
    small: null,
    'large-turbo': null,
  };

  // Free disk bytes, refreshed when the setup surface opens.
  freeDiskBytes: number | null = null;

  // Transient capture session state.
  captureState: CaptureState = 'idle';
  lastError: AsrErrorKind | null = null;
  // Loudness (0..1) of the most recent captured chunks, oldest first.
  inputLevels: number[] = [];
  // Date.now() when the current recording started; null when not recording.
  recordingStartedAt: number | null = null;
  // True while transcription waits for a CPU-bound chat reply to finish.
  waitingForChat: boolean = false;

  constructor() {
    makeAutoObservable(this, {inputLevels: observable.ref}, {autoBind: true});
    makePersistable(this, {
      name: 'ASRStore',
      properties: ['userASROverride', 'selectedTier', 'spokenLanguage'],
      storage: AsyncStorage,
    });
  }

  /** True when the device tier is high enough for voice input by default. */
  get deviceSupported(): boolean {
    const tier = modelStore.deviceTier;
    return tier !== null && ASR_DEVICE_TIERS.includes(tier);
  }

  /**
   * Whether whisper fits next to the loaded chat model, by the app's estimate
   * of both (`whisperFits`). Android's free-memory figure can be far off
   * (#982), so Android budgets against total RAM. iOS does not count mmap'd
   * chat weights against the app, so iOS budgets against what it reported
   * free before any load, keeping a reserve (ASR_IOS_CEILING_SHARE).
   */
  async hasMemoryForCapture(): Promise<boolean> {
    const memory = await readDeviceMemory(modelStore);
    return (
      memory == null ||
      whisperFits(
        memory,
        modelStore.loadedModelBytes ?? 0,
        ASR_TIERS[this.selectedTier].runtimeBytes,
      )
    );
  }

  /**
   * True while a local chat model generates on the CPU. Whisper competes
   * with it for the same cores, so transcription waits for the reply.
   */
  get chatBusyOnCpu(): boolean {
    return modelStore.inferencing && modelStore.context?.gpu === false;
  }

  /**
   * The ASR availability gate. Single boolean every ASR-aware surface reads.
   * An explicit user override wins; otherwise the device-tier default
   * applies (first run / null).
   */
  get asrAvailable(): boolean {
    if (this.userASROverride === true) {
      return true;
    }
    if (this.userASROverride === false) {
      return false;
    }
    return this.deviceSupported;
  }

  /** Download state of the currently selected tier. */
  get selectedTierState(): AsrDownloadState {
    return this.downloadStates[this.selectedTier];
  }

  /** True when the selected tier is installed and ready to transcribe. */
  get isSelectedTierReady(): boolean {
    return this.selectedTierState === 'ready';
  }

  /**
   * Initialize the store. Idempotent — only the first call does work.
   * Derives each tier's install state from disk.
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    const results = await Promise.all(
      ASR_TIER_ORDER.map(async tier => {
        try {
          return {tier, installed: await whisperAsrEngine.isInstalled(tier)};
        } catch (err) {
          console.warn(`[ASRStore] ${tier} isInstalled check failed:`, err);
          return {tier, installed: false};
        }
      }),
    );
    runInAction(() => {
      for (const {tier, installed} of results) {
        this.downloadStates[tier] = installed ? 'ready' : 'not_installed';
      }
    });

    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange,
    );
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    // Free the whisper context when backgrounded so it doesn't sit
    // resident alongside the LLM and OOM low-RAM devices. Re-init is lazy on
    // the next capture. Only react to 'background' — 'inactive' fires for
    // transient interruptions that must not tear down a large context. A
    // capture in progress finishes first and frees the context itself.
    if (
      nextAppState === 'background' &&
      (this.captureState === 'idle' || this.captureState === 'error')
    ) {
      whisperAsrEngine.release().catch(err => {
        console.warn('[ASRStore] background release failed:', err);
      });
    }
  };

  /**
   * Persist the user's explicit choice for the availability gate. `true`
   * forces the gate open on unsupported devices; `false` forces it closed
   * on supported ones.
   */
  setUserASROverride(value: boolean): void {
    this.userASROverride = value;
  }

  setSelectedTier(tier: AsrTier): void {
    this.selectedTier = tier;
  }

  setSpokenLanguage(language: string | null): void {
    this.spokenLanguage = language;
  }

  setWaitingForChat(value: boolean): void {
    this.waitingForChat = value;
  }

  async refreshFreeDisk(): Promise<void> {
    try {
      const bytes = await DeviceInfo.getFreeDiskStorage('important');
      runInAction(() => {
        this.freeDiskBytes = bytes;
      });
    } catch (err) {
      console.warn('[ASRStore] refreshFreeDisk failed:', err);
    }
  }

  // --- Model download -----------------------------------------------------

  async downloadModel(
    tier: AsrTier,
    {select = true}: {select?: boolean} = {},
  ): Promise<void> {
    if (this.downloadStates[tier] === 'downloading') {
      return;
    }
    runInAction(() => {
      this.downloadStates[tier] = 'downloading';
      this.downloadProgress[tier] = 0;
      this.downloadError[tier] = null;
    });

    // Reclaim a stale tier dir BEFORE the disk-space preflight so reclaimed
    // space counts toward the threshold. Idempotent.
    try {
      await whisperAsrEngine.reclaimLegacySpace(tier);
    } catch (err) {
      console.warn(`[ASRStore] ${tier} legacy reclaim failed:`, err);
    }

    const requiredBytes = Math.ceil(
      ASR_TIERS[tier].estimatedBytes * ASR_DISK_HEADROOM_FACTOR,
    );
    try {
      const freeBytes = await DeviceInfo.getFreeDiskStorage('important');
      if (freeBytes < requiredBytes) {
        // Surface the disk shortfall on the download-error channel (not the
        // capture FSM) so the Settings tier row can render an actionable line.
        runInAction(() => {
          this.downloadStates[tier] = 'error';
          this.downloadError[tier] = ASR_INSUFFICIENT_STORAGE;
          this.freeDiskBytes = freeBytes;
        });
        return;
      }
    } catch (err) {
      console.warn('[ASRStore] disk-space preflight failed:', err);
    }

    try {
      await whisperAsrEngine.downloadModel(tier, progress => {
        runInAction(() => {
          this.downloadProgress[tier] = progress;
        });
      });
      runInAction(() => {
        this.downloadStates[tier] = 'ready';
        this.downloadProgress[tier] = 1;
      });
      // Dictation's installs make the tier the active one, so the mic works
      // without a separate selection step; voice mode's base download doesn't.
      if (select) {
        this.setSelectedTier(tier);
      }
    } catch (err) {
      console.warn(`[ASRStore] ${tier} download failed:`, err);
      const message = err instanceof Error ? err.message : String(err);
      runInAction(() => {
        this.downloadStates[tier] = 'error';
        this.downloadError[tier] = message;
      });
    }
  }

  async deleteModel(tier: AsrTier): Promise<void> {
    if (this.downloadStates[tier] === 'downloading') {
      return;
    }
    try {
      await whisperAsrEngine.deleteModel(tier);
    } catch (err) {
      console.warn(`[ASRStore] ${tier} delete failed:`, err);
    }
    runInAction(() => {
      this.downloadStates[tier] = 'not_installed';
      this.downloadProgress[tier] = 0;
      this.downloadError[tier] = null;
    });
    // If the active tier was removed, reselect a remaining ready tier (or fall
    // back to the default, which self-gates the mic to the setup affordance).
    if (tier === this.selectedTier) {
      const nextReady = ASR_TIER_ORDER.find(
        t => this.downloadStates[t] === 'ready',
      );
      this.setSelectedTier(nextReady ?? ASR_DEFAULT_TIER);
    }
  }

  async retryDownload(tier: AsrTier): Promise<void> {
    return this.downloadModel(tier);
  }

  // --- Capture FSM (driven by useVoiceCapture) ---------------------------

  setCaptureState(state: CaptureState): void {
    this.captureState = state;
    if (state !== 'error') {
      this.lastError = null;
    }
    if (state === 'recording') {
      this.inputLevels = [];
      this.recordingStartedAt = Date.now();
    } else {
      this.recordingStartedAt = null;
    }
  }

  pushInputLevel(level: number): void {
    const levels = this.inputLevels.concat(level);
    this.inputLevels =
      levels.length > ASR_LEVEL_HISTORY
        ? levels.slice(levels.length - ASR_LEVEL_HISTORY)
        : levels;
  }

  setError(kind: AsrErrorKind): void {
    this.captureState = 'error';
    this.lastError = kind;
    this.recordingStartedAt = null;
    this.waitingForChat = false;
  }

  resetCapture(): void {
    this.captureState = 'idle';
    this.lastError = null;
    this.recordingStartedAt = null;
    this.waitingForChat = false;
  }
}

export const asrStore = new ASRStore();
