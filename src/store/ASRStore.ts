import {
  AppState,
  type AppStateStatus,
  type NativeEventSubscription,
} from 'react-native';

import {makeAutoObservable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

import {
  ASR_DEFAULT_TIER,
  ASR_DISK_HEADROOM_FACTOR,
  ASR_INSUFFICIENT_STORAGE,
  ASR_MIN_RAM_BYTES,
  ASR_TIERS,
  ASR_TIER_ORDER,
  whisperAsrEngine,
} from '../services/asr';
import type {
  AsrDownloadState,
  AsrErrorKind,
  AsrTier,
  CaptureState,
} from '../services/asr';

/**
 * Store coordinating on-device voice input (ASR).
 *
 * Availability gate: `asrAvailable` is the single boolean the mic button and
 * the Settings surface read. It is derived from `deviceMeetsMemory` (set once
 * in `init()` from `DeviceInfo.getTotalMemory()`) and `userASROverride` (a
 * persisted user choice) — the same shape as the TTS gate. The whisper model
 * is downloaded per tier on demand and is never routed through the LLM
 * `ModelStore`; this store is the sole owner of ASR install/download state.
 *
 * Capture is push-to-talk: a hook drives the `captureState` FSM and calls
 * `transcribe` on release; the resolved text is appended to the composer by
 * the caller (never auto-sent).
 */
export class ASRStore {
  // Set once in init() from getTotalMemory() >= ASR_MIN_RAM_BYTES; never
  // re-checked. RAM doesn't change at runtime.
  deviceMeetsMemory: boolean = false;
  // Tristate persisted user choice. null = not set (mirrors deviceMeetsMemory).
  userASROverride: boolean | null = null;
  private initialized: boolean = false;
  private appStateSubscription: NativeEventSubscription | null = null;

  // Persisted: which tier the user installed / uses.
  selectedTier: AsrTier = ASR_DEFAULT_TIER;

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

  constructor() {
    makeAutoObservable(this, {}, {autoBind: true});
    makePersistable(this, {
      name: 'ASRStore',
      properties: ['userASROverride', 'selectedTier'],
      storage: AsyncStorage,
    });
  }

  /**
   * The ASR availability gate. Single boolean every ASR-aware surface reads.
   * An explicit user override wins; otherwise the device-memory default
   * applies (first run / null).
   */
  get asrAvailable(): boolean {
    if (this.userASROverride === true) {
      return true;
    }
    if (this.userASROverride === false) {
      return false;
    }
    return this.deviceMeetsMemory;
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
   * Initialize the store. Idempotent — only the first call does work. Sets
   * the memory gate once and derives each tier's install state from disk.
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
      console.warn('[ASRStore] getTotalMemory failed:', err);
      totalMemory = 0;
    }

    runInAction(() => {
      this.deviceMeetsMemory = totalMemory >= ASR_MIN_RAM_BYTES;
    });

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
    // Free the ~400 MB whisper context when backgrounded so it doesn't sit
    // resident alongside the LLM and OOM low-RAM devices. Re-init is lazy on
    // the next capture. Only react to 'background' — 'inactive' fires for
    // transient interruptions that must not tear down a large context.
    if (nextAppState === 'background') {
      whisperAsrEngine.release().catch(err => {
        console.warn('[ASRStore] background release failed:', err);
      });
    }
  };

  /**
   * Persist the user's explicit choice for the availability gate. `true`
   * forces the gate open even on low-memory devices; `false` forces it closed
   * even on high-memory devices.
   */
  setUserASROverride(value: boolean): void {
    this.userASROverride = value;
  }

  setSelectedTier(tier: AsrTier): void {
    this.selectedTier = tier;
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

  async downloadModel(tier: AsrTier): Promise<void> {
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
      // Installing any tier makes it the active one so the mic becomes
      // actionable without a separate selection step.
      this.setSelectedTier(tier);
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

  // --- Capture FSM (driven by the push-to-talk hook) ----------------------

  setCaptureState(state: CaptureState): void {
    this.captureState = state;
    if (state !== 'error') {
      this.lastError = null;
    }
  }

  setError(kind: AsrErrorKind): void {
    this.captureState = 'error';
    this.lastError = kind;
  }

  resetCapture(): void {
    this.captureState = 'idle';
    this.lastError = null;
  }
}

export const asrStore = new ASRStore();
