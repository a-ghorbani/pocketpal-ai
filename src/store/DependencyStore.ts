/**
 * DependencyStore — MobX store wrapping DependencyHealthService.
 *
 * Follows the established store pattern (see STTStore):
 *   - makeAutoObservable with autoBind
 *   - observable `status` populated from the service
 *   - `refresh()` to recompute on demand (e.g. after env/restart)
 *   - Singleton export
 */

import {makeAutoObservable} from 'mobx';

import {
  dependencyHealthService,
  type DependencyStatus,
  type FirebaseStatus,
  type WhisperNativeStatus,
  type PalsHubStatus,
} from '../services/dependency/DependencyHealthService';

class DependencyStore {
  /** Latest aggregated dependency health status. */
  status: DependencyStatus = dependencyHealthService.getStatus();

  constructor() {
    makeAutoObservable(this, {}, {autoBind: true});
  }

  /** Recompute the dependency health status from the service. */
  refresh(): void {
    this.status = dependencyHealthService.getStatus();
  }

  /** Human-readable aggregated status summary. */
  get summary(): string {
    return dependencyHealthService.getSummary(this.status);
  }

  /** Firebase Auth / Cloud Sync status. */
  get firebase(): FirebaseStatus {
    return this.status.firebase;
  }

  /** Whether Firebase is configured with real credentials. */
  get isFirebaseConfigured(): boolean {
    return this.status.firebase === 'configured';
  }

  /** Whisper native transcription module status. */
  get whisperNative(): WhisperNativeStatus {
    return this.status.whisperNative;
  }

  /** Whether the Whisper native module is linked. */
  get isWhisperNativeAvailable(): boolean {
    return this.status.whisperNative === 'available';
  }

  /** PalsHub external backend status. */
  get palsHub(): PalsHubStatus {
    return this.status.palsHub;
  }

  /** Whether the PalsHub backend base URL is configured. */
  get isPalsHubConfigured(): boolean {
    return this.status.palsHub === 'configured';
  }
}

export const dependencyStore = new DependencyStore();

export default dependencyStore;
