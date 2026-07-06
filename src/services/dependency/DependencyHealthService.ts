/**
 * DependencyHealthService — aggregates the health status of the three
 * external/native dependencies that are currently "silently missing" in this
 * fork, so the app can surface them to the user instead of failing quietly.
 *
 * The three checks are intentionally config-only (no network requests):
 *   1. Firebase      — reuse `isFirebaseConfigured()` from firebase.config.ts.
 *   2. Whisper native — probe NativeModules.WhisperTranscribeModule.
 *   3. PalsHub       — inspect the PALSHUB_BASE_URL env var (presence only).
 */

import {NativeModules} from 'react-native';

import {isFirebaseConfigured} from '../../../firebase.config';

/** Firebase Auth / Cloud Sync backend. */
export type FirebaseStatus = 'configured' | 'not_configured';

/** Whisper.cpp native transcription module. */
export type WhisperNativeStatus = 'available' | 'missing';

/** PalsHub external backend (payments / cloud account ownership). */
export type PalsHubStatus = 'configured' | 'unknown';

/** Aggregated health status across all three dependencies. */
export interface DependencyStatus {
  firebase: FirebaseStatus;
  whisperNative: WhisperNativeStatus;
  palsHub: PalsHubStatus;
}

/**
 * Resolve the `@env` module defensively. In test/non-transformed contexts the
 * react-native-dotenv transform is absent, so we fall back to an empty object
 * rather than crashing module load.
 */
function readEnv(): Record<string, string | undefined> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@env') as Record<string, string | undefined>;
  } catch {
    return {};
  }
}

/** Detects whether Firebase has real credentials configured. */
function detectFirebase(): FirebaseStatus {
  try {
    return isFirebaseConfigured() ? 'configured' : 'not_configured';
  } catch {
    return 'not_configured';
  }
}

/**
 * Detects whether the Whisper native module is linked. We resolve it from
 * NativeModules and treat any thrown error or missing module as "missing"
 * (the app gracefully falls back to the system speech recognizer).
 */
function detectWhisperNative(): WhisperNativeStatus {
  try {
    const mod = (NativeModules as Record<string, unknown>)
      .WhisperTranscribeModule;
    return mod && typeof mod === 'object' ? 'available' : 'missing';
  } catch {
    return 'missing';
  }
}

/**
 * Detects whether the PalsHub backend base URL is configured. This is a pure
 * config-presence check — no network request is made.
 */
function detectPalsHub(): PalsHubStatus {
  try {
    const env = readEnv();
    const baseUrl = (env.PALSHUB_BASE_URL ?? '').trim();
    return baseUrl.length > 0 ? 'configured' : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * DependencyHealthService — single source of truth for dependency health.
 *
 * Exposes:
 *   - `getStatus()` — recompute and return the latest DependencyStatus.
 *   - `summary` — human-readable aggregated status string.
 */
export class DependencyHealthService {
  /** Recompute the current dependency health status. */
  getStatus(): DependencyStatus {
    return {
      firebase: detectFirebase(),
      whisperNative: detectWhisperNative(),
      palsHub: detectPalsHub(),
    };
  }

  /**
   * Build a human-readable, single-line summary of the current status.
   * @param status optional status to summarize; defaults to a fresh reading.
   */
  getSummary(status: DependencyStatus = this.getStatus()): string {
    const format = (label: string, ok: boolean): string =>
      `${label}: ${ok ? 'OK' : 'NOT CONFIGURED'}`;

    return [
      format('Firebase', status.firebase === 'configured'),
      format('Whisper native', status.whisperNative === 'available'),
      format('PalsHub', status.palsHub === 'configured'),
    ].join('; ');
  }
}

/** Shared singleton used by the MobX store and UI. */
export const dependencyHealthService = new DependencyHealthService();

export default dependencyHealthService;
