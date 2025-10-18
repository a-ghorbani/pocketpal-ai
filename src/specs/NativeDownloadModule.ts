import type {TurboModule} from 'react-native';
import {Platform, TurboModuleRegistry} from 'react-native';

export interface DownloadConfig {
  destination: string;
  authToken?: string;
  networkType?: 'WIFI' | 'ANY';
  progressInterval?: number;
  priority?: number;
}

export interface DownloadResponse {
  downloadId: string;
}

export interface ActiveDownload {
  id: string;
  url: string;
  destination: string;
  progress: number;
  status: string;
}

export interface Spec extends TurboModule {
  // Event emitter methods
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Download operations
  startDownload(url: string, config: DownloadConfig): Promise<DownloadResponse>;
  pauseDownload(downloadId: string): Promise<boolean>;
  resumeDownload(downloadId: string): Promise<boolean>;
  retryDownload(downloadId: string): Promise<boolean>;
  cancelDownload(downloadId: string): Promise<boolean>;

  // Query operations
  getActiveDownloads(): Promise<ActiveDownload[]>;
  reattachDownloadObserver(downloadId: string): Promise<boolean>;

  // Debug operations
  logDownloadDatabase(): Promise<boolean>;
}

// Only load the module on Android
export default Platform.OS === 'android'
  ? TurboModuleRegistry.getEnforcing<Spec>('DownloadModule')
  : (null as any as Spec);
