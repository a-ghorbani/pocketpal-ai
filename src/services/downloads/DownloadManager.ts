import * as RNFS from '@dr.pogodin/react-native-fs';
import {makeAutoObservable, observable} from 'mobx';
import {NativeEventEmitter, Platform} from 'react-native';

import {
  DownloadEventCallbacks,
  DownloadJob,
  DownloadMap,
  DownloadProgress,
} from './types';

import {Model} from '../../utils/types';
import {formatBytes, hasEnoughSpace} from '../../utils';
import {uiStore} from '../../store';
import NativeDownloadModule from '../../specs/NativeDownloadModule';
import type {
  DownloadConfig,
  DownloadResponse,
} from '../../specs/NativeDownloadModule';

const TAG = 'DownloadManager';

export class DownloadManager {
  private downloadJobs: DownloadMap;
  private callbacks: DownloadEventCallbacks = {};
  private eventEmitter: NativeEventEmitter | null = null;

  constructor() {
    console.log(`${TAG}: Initializing DownloadManager`);
    this.downloadJobs = observable.map(new Map());
    makeAutoObservable(this);

    if (Platform.OS === 'android') {
      this.setupAndroidEventListener();
    }
  }

  private setupAndroidEventListener() {
    if (NativeDownloadModule) {
      console.log(`${TAG}: Setting up Android event listeners`);
      this.eventEmitter = new NativeEventEmitter(NativeDownloadModule as any);

      this.eventEmitter.addListener('onDownloadProgress', event => {
        // console.log(
        //   `${TAG}: Progress event received for ID ${event.downloadId}:`,
        //   {
        //     bytesWritten: event.bytesWritten,
        //     totalBytes: event.totalBytes,
        //     progress: event.progress,
        //   },
        // );

        // Find the job by download ID
        const job = Array.from(this.downloadJobs.values()).find(
          _job => _job.downloadId === event.downloadId,
        );

        if (!job) {
          console.warn(
            `${TAG}: No job found for download ID: ${event.downloadId}. This may indicate the job was completed or cancelled.`,
          );
          return;
        }

        // Calculate speed
        const currentTime = Date.now();
        const timeDiff = (currentTime - job.lastUpdateTime) / 1000 || 1;
        const bytesDiff = event.bytesWritten - job.lastBytesWritten;
        const speedBps = bytesDiff / timeDiff;
        const speedMBps = (speedBps / (1024 * 1024)).toFixed(2);

        // Calculate ETA
        const remainingBytes = event.totalBytes - event.bytesWritten;
        const etaSeconds = speedBps > 0 ? remainingBytes / speedBps : 0;
        const etaMinutes = Math.ceil(etaSeconds / 60);
        const l10nData = uiStore.l10n;
        const etaText =
          etaSeconds >= 60
            ? `${etaMinutes} ${l10nData.common.minutes}`
            : `${Math.ceil(etaSeconds)} ${l10nData.common.seconds}`;

        const progress: DownloadProgress = {
          bytesDownloaded: event.bytesWritten,
          bytesTotal: event.totalBytes,
          progress: event.progress,
          speed: `${formatBytes(event.bytesWritten)} (${speedMBps} MB/s)`,
          eta: etaText,
          rawSpeed: speedBps,
          rawEta: etaSeconds,
        };

        // console.log(
        //   `${TAG}: Updating progress for model ${job.model.id}:`,
        //   progress,
        // );

        // Update job state
        job.state.progress = progress;
        job.lastBytesWritten = event.bytesWritten;
        job.lastUpdateTime = currentTime;

        this.callbacks.onProgress?.(job.model.id, progress);
      });

      this.eventEmitter.addListener('onDownloadComplete', event => {
        console.log(`${TAG}: Download completed for ID: ${event.downloadId}`);
        // Find the job by download ID
        const job = Array.from(this.downloadJobs.values()).find(
          _job => _job.downloadId === event.downloadId,
        );

        if (job) {
          // Set final state before removing
          job.state.isDownloading = false;
          job.state.progress = {
            bytesDownloaded: job.state.progress?.bytesTotal || 0,
            bytesTotal: job.state.progress?.bytesTotal || 0,
            progress: 100,
            speed: '0 B/s',
            eta: '0 sec',
            rawSpeed: 0,
            rawEta: 0,
          };
          // Ensure callback is called before removing the job
          this.callbacks.onComplete?.(job.model.id);
          this.downloadJobs.delete(job.model.id);
          console.log(`${TAG}: Removed completed job: ${job.model.id}`);
        } else {
          console.warn(
            `${TAG}: Completion event received for non-existent job: ${event.downloadId}`,
          );
        }
      });

      this.eventEmitter.addListener('onDownloadFailed', event => {
        console.error(
          `${TAG}: (js) Download failed for ID: ${event.downloadId}`,
          event.error,
        );
        // Find the job by download ID
        const job = Array.from(this.downloadJobs.values()).find(
          _job => _job.downloadId === event.downloadId,
        );

        if (job) {
          job.state.error = new Error(event.error);
          job.state.isDownloading = false;
          // Ensure callback is called before removing the job
          this.callbacks.onError?.(job.model.id, new Error(event.error));
          this.downloadJobs.delete(job.model.id);
          console.log(`${TAG}: Removed failed job: ${job.model.id}`);
        } else {
          console.warn(
            `${TAG}: Failure event received for non-existent job: ${event.downloadId}`,
          );
        }
      });
    } else {
      console.error(`${TAG}: DownloadModule is not available`);
    }
  }

  private calculateEta(
    bytesDownloaded: number,
    totalBytes: number,
    speedBps: number,
  ): string {
    const l10nData = uiStore.l10n;
    if (speedBps <= 0) {
      return l10nData.common.calculating;
    }

    const remainingBytes = totalBytes - bytesDownloaded;
    const etaSeconds = remainingBytes / speedBps;
    const etaMinutes = Math.ceil(etaSeconds / 60);

    const eta =
      etaSeconds >= 60
        ? `${etaMinutes} ${l10nData.common.minutes}`
        : `${Math.ceil(etaSeconds)} ${l10nData.common.seconds}`;
    console.log(`${TAG}: Calculated ETA:`, {
      remainingBytes,
      speedBps,
      eta,
    });
    return eta;
  }

  setCallbacks(callbacks: DownloadEventCallbacks) {
    console.log(`${TAG}: Setting callbacks`);
    this.callbacks = callbacks;
  }

  isDownloading(modelId: string): boolean {
    const isDownloading = this.downloadJobs.has(modelId);
    return isDownloading;
  }

  getDownloadProgress(modelId: string): number {
    const progress =
      this.downloadJobs.get(modelId)?.state.progress?.progress || 0;
    console.log(`${TAG}: Getting progress for model ${modelId}:`, progress);
    return progress;
  }

  async startDownload(
    model: Model,
    destinationPath: string,
    authToken?: string | null,
  ): Promise<void> {
    console.log(`${TAG}: Starting download for model:`, {
      modelId: model.id,
      destination: destinationPath,
      url: model.downloadUrl,
    });

    if (this.isDownloading(model.id)) {
      console.log(`${TAG}: Download already in progress for model:`, model.id);
      return;
    }

    if (!model.downloadUrl) {
      console.error(`${TAG}: Model has no download URL`);
      throw new Error('Model has no download URL');
    }

    const isEnoughSpace = await hasEnoughSpace(model);
    if (!isEnoughSpace) {
      console.error(`${TAG}: Not enough storage space for model:`, {
        modelId: model.id,
        size: model.size,
      });
      throw new Error('Not enough storage space to download the model');
    }

    const dirPath = destinationPath.substring(
      0,
      destinationPath.lastIndexOf('/'),
    );
    try {
      console.log(`${TAG}: Creating directory:`, dirPath);
      await RNFS.mkdir(dirPath);
    } catch (err) {
      console.error(`${TAG}: Failed to create directory:`, err);
      throw err;
    }

    if (Platform.OS === 'ios') {
      await this.startIOSDownload(model, destinationPath, authToken);
    } else {
      await this.startAndroidDownload(model, destinationPath, authToken);
    }
  }

  private async startIOSDownload(
    model: Model,
    destinationPath: string,
    authToken?: string | null,
  ): Promise<void> {
    try {
      const downloadJob: DownloadJob = {
        model,
        state: {
          isDownloading: true,
          progress: null,
          error: null,
        },
        destination: destinationPath,
        lastBytesWritten: 0,
        lastUpdateTime: Date.now(),
      };

      this.downloadJobs.set(model.id, downloadJob);
      this.callbacks.onStart?.(model.id);

      // Create the download task
      const downloadResult = RNFS.downloadFile({
        fromUrl: model.downloadUrl!,
        toFile: destinationPath,
        background: uiStore.iOSBackgroundDownloading,
        discretionary: false,
        progressInterval: 800,
        headers: {
          ...(authToken ? {Authorization: `Bearer ${authToken}`} : {}),
        },
        begin: res => {
          console.log(`${TAG}: Download started for ID: ${model.id}`, {
            statusCode: res.statusCode,
            contentLength: res.contentLength,
            headers: res.headers,
            jobId: downloadResult.jobId,
          });

          // Initialize progress
          const progress: DownloadProgress = {
            bytesDownloaded: 0,
            bytesTotal: res.contentLength,
            progress: 0,
            speed: '0 B/s',
            eta: uiStore.l10n.common.calculating,
            rawSpeed: 0,
            rawEta: 0,
          };

          downloadJob.state.progress = progress;
          this.callbacks.onProgress?.(model.id, progress);
        },
        progress: res => {
          if (!this.downloadJobs.has(model.id)) {
            return;
          }

          const job = this.downloadJobs.get(model.id)!;
          const currentTime = Date.now();
          const timeDiff = (currentTime - job.lastUpdateTime) / 1000 || 1;
          const bytesDiff = res.bytesWritten - job.lastBytesWritten;
          const speedBps = bytesDiff / timeDiff;
          const speedMBps = (speedBps / (1024 * 1024)).toFixed(2);

          const remainingBytes = res.contentLength - res.bytesWritten;
          const etaSeconds = speedBps > 0 ? remainingBytes / speedBps : 0;
          const etaMinutes = Math.ceil(etaSeconds / 60);
          const l10nData = uiStore.l10n;
          const etaText =
            etaSeconds >= 60
              ? `${etaMinutes} ${l10nData.common.minutes}`
              : `${Math.ceil(etaSeconds)} ${l10nData.common.seconds}`;

          const progress: DownloadProgress = {
            bytesDownloaded: res.bytesWritten,
            bytesTotal: res.contentLength,
            progress: (res.bytesWritten / res.contentLength) * 100,
            speed: `${formatBytes(res.bytesWritten)} (${speedMBps} MB/s)`,
            eta: etaText,
            rawSpeed: speedBps,
            rawEta: etaSeconds,
          };

          job.state.progress = progress;
          job.lastBytesWritten = res.bytesWritten;
          job.lastUpdateTime = currentTime;

          this.callbacks.onProgress?.(model.id, progress);
        },
      });

      // Store the jobId immediately for cancellation
      downloadJob.jobId = downloadResult.jobId;
      console.log(
        `${TAG}: Created download with jobId: ${downloadResult.jobId}`,
      );

      // Add job to map after setting jobId
      this.downloadJobs.set(model.id, downloadJob);

      // Wait for the download to complete
      const result = await downloadResult.promise;

      if (result.statusCode === 200) {
        console.log(
          `${TAG}: Download completed successfully for ID: ${model.id}`,
        );
        this.callbacks.onComplete?.(model.id);
        this.downloadJobs.delete(model.id);
      } else {
        console.error(
          `${TAG}: Download failed with status: ${result.statusCode} for ID: ${model.id}`,
        );
        throw new Error(`Download failed with status: ${result.statusCode}`);
      }
    } catch (error) {
      console.error(`${TAG}: Download failed for ID: ${model.id}:`, error);
      const job = this.downloadJobs.get(model.id);
      if (job) {
        job.state.error =
          error instanceof Error ? error : new Error(String(error));
        job.state.isDownloading = false;
      }
      this.downloadJobs.delete(model.id);
      this.callbacks.onError?.(
        model.id,
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  private async startAndroidDownload(
    model: Model,
    destinationPath: string,
    authToken?: string | null,
  ): Promise<void> {
    try {
      console.log(`${TAG}: Starting Android download for model:`, {
        modelId: model.id,
        destination: destinationPath,
      });

      const downloadJob: DownloadJob = {
        model,
        state: {
          isDownloading: true,
          progress: null,
          error: null,
        },
        destination: destinationPath,
        lastBytesWritten: 0,
        lastUpdateTime: Date.now(),
      };

      // Start the download first to get the download ID
      const config: DownloadConfig = {
        destination: destinationPath,
        networkType: 'ANY',
        priority: 1,
        progressInterval: 1000,
        ...(authToken ? {authToken} : {}),
      };
      const response: DownloadResponse =
        await NativeDownloadModule.startDownload(model.downloadUrl!, config);

      // Store the download ID
      downloadJob.downloadId = response.downloadId;
      console.log(`${TAG}: Download started with ID: ${response.downloadId}`);

      // Add job to map after getting download ID
      this.downloadJobs.set(model.id, downloadJob);
      this.callbacks.onStart?.(model.id);
    } catch (error) {
      console.error(`${TAG}: Failed to start Android download:`, {
        modelId: model.id,
        error: error instanceof Error ? error.message : String(error),
      });

      const job = this.downloadJobs.get(model.id);
      if (job) {
        job.state.error =
          error instanceof Error ? error : new Error(String(error));
        job.state.isDownloading = false;
      }
      this.downloadJobs.delete(model.id);
      this.callbacks.onError?.(
        model.id,
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  async cancelDownload(modelId: string): Promise<void> {
    console.log(`${TAG}: Attempting to cancel download:`, modelId);
    const job = this.downloadJobs.get(modelId);
    if (job) {
      try {
        if (Platform.OS === 'ios') {
          console.log(
            `${TAG}: Cancelling iOS download for ID: ${modelId}, jobId: ${job.jobId}`,
          );
          if (job.jobId) {
            RNFS.stopDownload(job.jobId); // job.jobId is now correctly typed as number
          }
        } else if (
          Platform.OS === 'android' &&
          NativeDownloadModule &&
          job.downloadId
        ) {
          console.log(`${TAG}: Cancelling Android download:`, modelId);
          await NativeDownloadModule.cancelDownload(job.downloadId);
        }

        // Clean up the partial download file
        const destinationPath = job.destination;
        if (destinationPath) {
          console.log(
            `${TAG}: Cleaning up partial download file:`,
            destinationPath,
          );
          try {
            const exists = await RNFS.exists(destinationPath);
            if (exists) {
              await RNFS.unlink(destinationPath);
              console.log(
                `${TAG}: Successfully deleted partial download file:`,
                destinationPath,
              );
            }
          } catch (fileError) {
            if ((fileError as any)?.code !== 'ENOENT') {
              console.error(`${TAG}: Error deleting partial download file:`, {
                path: destinationPath,
                error:
                  fileError instanceof Error
                    ? fileError.message
                    : String(fileError),
              });
            }
          }
        }

        // Update state and remove job
        job.state.isDownloading = false;
        this.downloadJobs.delete(modelId);
        console.log(`${TAG}: Removed cancelled job:`, modelId);
      } catch (err) {
        console.error(`${TAG}: Error cancelling download:`, {
          modelId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      console.warn(`${TAG}: No download job found to cancel:`, modelId);
    }
  }

  cleanup() {
    console.log(`${TAG}: Cleaning up download manager`);
    if (Platform.OS === 'android' && this.eventEmitter) {
      console.log(`${TAG}: Removing Android event listeners`);
      this.eventEmitter.removeAllListeners('onDownloadProgress');
      this.eventEmitter.removeAllListeners('onDownloadComplete');
      this.eventEmitter.removeAllListeners('onDownloadFailed');
    }
    this.downloadJobs.clear();
    console.log(`${TAG}: Download jobs cleared`);
  }

  /**
   * Synchronizes the downloadJobs map with active downloads in the native layer.
   * This should be called after the model store is initialized.
   */
  syncWithActiveDownloads = async (models: Model[]): Promise<void> => {
    if (Platform.OS !== 'android' || !NativeDownloadModule) {
      return;
    }

    try {
      console.log(`${TAG}: Syncing download jobs with native layer`);

      // Get active downloads from native module
      const activeDownloads = await NativeDownloadModule.getActiveDownloads();
      console.log(
        `${TAG}: Found ${activeDownloads.length} active downloads in native layer`,
      );

      if (activeDownloads.length === 0) {
        return;
      }

      // For each active download, find the corresponding model and create a download job
      for (const download of activeDownloads) {
        const model = models.find(m => {
          return m.downloadUrl && download.url === m.downloadUrl;
        });

        if (!model) {
          console.warn(
            `${TAG}: Could not find model for download: ${download.destination}`,
          );
          continue;
        }

        // Parse progress value safely
        const progress =
          typeof download.progress === 'string'
            ? parseFloat(download.progress)
            : download.progress || 0;

        // Calculate bytes from model size and progress
        const totalBytes = model.size || 0;
        const bytesWritten = Math.floor((totalBytes * progress) / 100);

        // Create a download job for this model
        const downloadJob: DownloadJob = {
          model,
          downloadId: download.id,
          state: {
            isDownloading: true,
            progress: {
              bytesDownloaded: bytesWritten,
              bytesTotal: totalBytes,
              progress: progress,
              speed: '0 B/s',
              eta: uiStore.l10n.common.calculating,
              rawSpeed: 0,
              rawEta: 0,
            },
            error: null,
          },
          destination: download.destination,
          lastBytesWritten: bytesWritten,
          lastUpdateTime: Date.now(),
        };

        // Add to downloadJobs map
        this.downloadJobs.set(model.id, downloadJob);
        console.log(
          `${TAG}: Restored download job for model: ${model.id}, progress: ${progress}%`,
        );

        // Notify listeners that download is in progress
        this.callbacks.onStart?.(model.id);

        // Re-register for progress updates by calling the native module
        try {
          // We need to tell the native module to re-register the observer for this download
          if (NativeDownloadModule.reattachDownloadObserver) {
            await NativeDownloadModule.reattachDownloadObserver(download.id);
            console.log(
              `${TAG}: Re-attached observer for download ID: ${download.id}`,
            );
          } else {
            console.warn(
              `${TAG}: reattachDownloadObserver method not available in NativeDownloadModule`,
            );
          }
        } catch (error) {
          console.error(`${TAG}: Error re-attaching observer:`, error);
        }
      }
    } catch (error) {
      console.error(`${TAG}: Error syncing download jobs:`, error);
    }
  };
}
