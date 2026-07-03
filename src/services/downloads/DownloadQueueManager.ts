import { makeAutoObservable, observable } from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Model } from '../../utils/types';
import { downloadManager } from './DownloadManager';
import { DownloadProgress } from './types';

export type DownloadPriority = 'high' | 'normal' | 'low';
export type QueueItemStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface DownloadQueueItem {
  id: string;
  model: Model;
  destinationPath: string;
  priority: DownloadPriority;
  status: QueueItemStatus;
  progress: DownloadProgress | null;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  authToken?: string | null;
  retryCount: number;
  maxRetries: number;
}

const QUEUE_STORAGE_KEY = '@pocketpal_download_queue';
const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_MAX_RETRIES = 3;

export class DownloadQueueManager {
  private queue: DownloadQueueItem[] = [];
  private maxConcurrent: number = DEFAULT_MAX_CONCURRENT;
  private isProcessing: boolean = false;

  constructor() {
    makeAutoObservable(this, {
      queue: observable.shallow,
    });
    this.loadQueue();
  }

  get queuedItems(): DownloadQueueItem[] {
    return this.queue
      .filter(item => item.status === 'queued')
      .sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return a.createdAt - b.createdAt;
      });
  }

  get downloadingItems(): DownloadQueueItem[] {
    return this.queue.filter(item => item.status === 'downloading');
  }

  get pausedItems(): DownloadQueueItem[] {
    return this.queue.filter(item => item.status === 'paused');
  }

  get completedItems(): DownloadQueueItem[] {
    return this.queue.filter(item => item.status === 'completed');
  }

  get failedItems(): DownloadQueueItem[] {
    return this.queue.filter(item => item.status === 'failed');
  }

  get activeCount(): number {
    return this.downloadingItems.length;
  }

  get queuedCount(): number {
    return this.queuedItems.length;
  }

  get totalProgress(): number {
    const activeItems = [...this.downloadingItems, ...this.queuedItems];
    if (activeItems.length === 0) return 0;

    const totalProgress = activeItems.reduce((sum, item) => {
      return sum + (item.progress?.progress || 0);
    }, 0);

    return totalProgress / activeItems.length;
  }

  async addToQueue(
    model: Model,
    destinationPath: string,
    priority: DownloadPriority = 'normal',
    authToken?: string | null
  ): Promise<string> {
    const existingItem = this.queue.find(
      item => item.model.id === model.id && (item.status === 'queued' || item.status === 'downloading' || item.status === 'paused')
    );

    if (existingItem) {
      console.log(`[DownloadQueue] Model ${model.id} already in queue, updating priority`);
      this.updateItemPriority(existingItem.id, priority);
      return existingItem.id;
    }

    const item: DownloadQueueItem = {
      id: `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      model,
      destinationPath,
      priority,
      status: 'queued',
      progress: null,
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      authToken,
      retryCount: 0,
      maxRetries: DEFAULT_MAX_RETRIES,
    };

    this.queue.push(item);
    await this.saveQueue();
    this.processQueue();

    return item.id;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    const downloadingCount = this.downloadingItems.length;
    if (downloadingCount >= this.maxConcurrent) {
      return;
    }

    const nextItem = this.queuedItems[0];
    if (!nextItem) {
      return;
    }

    this.isProcessing = true;

    try {
      await this.startDownload(nextItem);
    } catch (error) {
      console.error('[DownloadQueue] Failed to start download:', error);
    } finally {
      this.isProcessing = false;
      this.processQueue();
    }
  }

  private async startDownload(item: DownloadQueueItem): Promise<void> {
    this.updateItemStatus(item.id, 'downloading');
    item.startedAt = Date.now();

    try {
      downloadManager.setCallbacks({
        onProgress: (modelId, progress) => {
          if (modelId === item.model.id) {
            this.updateItemProgress(item.id, progress);
          }
        },
        onComplete: (modelId) => {
          if (modelId === item.model.id) {
            this.handleDownloadComplete(item.id);
          }
        },
        onError: (modelId, error) => {
          if (modelId === item.model.id) {
            this.handleDownloadError(item.id, error);
          }
        },
      });

      await downloadManager.startDownload(item.model, item.destinationPath, item.authToken);
    } catch (error: any) {
      if (error?.name === 'DownloadCancelledError') {
        console.log(`[DownloadQueue] Download cancelled for ${item.id}`);
      } else {
        this.handleDownloadError(item.id, error);
      }
    }
  }

  private updateItemStatus(itemId: string, status: QueueItemStatus): void {
    const item = this.queue.find(i => i.id === itemId);
    if (item) {
      item.status = status;
      this.saveQueue();
    }
  }

  private updateItemProgress(itemId: string, progress: DownloadProgress): void {
    const item = this.queue.find(i => i.id === itemId);
    if (item) {
      item.progress = progress;
    }
  }

  private handleDownloadComplete(itemId: string): void {
    const item = this.queue.find(i => i.id === itemId);
    if (item) {
      item.status = 'completed';
      item.completedAt = Date.now();
      this.saveQueue();
      console.log(`[DownloadQueue] Download completed: ${item.model.id}`);
    }
  }

  private handleDownloadError(itemId: string, error: Error): void {
    const item = this.queue.find(i => i.id === itemId);
    if (item) {
      item.error = error.message;

      if (item.retryCount < item.maxRetries) {
        item.retryCount++;
        item.status = 'queued';
        item.error = `Retry ${item.retryCount}/${item.maxRetries}: ${error.message}`;
        console.log(`[DownloadQueue] Retrying download ${item.id} (${item.retryCount}/${item.maxRetries})`);
        this.saveQueue();
        setTimeout(() => this.processQueue(), 2000 * item.retryCount);
      } else {
        item.status = 'failed';
        this.saveQueue();
        console.error(`[DownloadQueue] Download failed after ${item.maxRetries} retries: ${item.model.id}`);
      }
    }
  }

  async pauseDownload(itemId: string): Promise<void> {
    const item = this.queue.find(i => i.id === itemId);
    if (!item) return;

    if (item.status === 'downloading') {
      try {
        await downloadManager.cancelDownload(item.model.id);
      } catch (error) {
        console.warn('[DownloadQueue] Error pausing download:', error);
      }
    }

    item.status = 'paused';
    await this.saveQueue();
  }

  async resumeDownload(itemId: string): Promise<void> {
    const item = this.queue.find(i => i.id === itemId);
    if (!item) return;

    if (item.status === 'paused' || item.status === 'failed') {
      item.status = 'queued';
      item.error = null;
      await this.saveQueue();
      this.processQueue();
    }
  }

  async cancelDownload(itemId: string): Promise<void> {
    const item = this.queue.find(i => i.id === itemId);
    if (!item) return;

    if (item.status === 'downloading') {
      try {
        await downloadManager.cancelDownload(item.model.id);
      } catch (error) {
        console.warn('[DownloadQueue] Error cancelling download:', error);
      }
    }

    item.status = 'cancelled';
    await this.saveQueue();
  }

  async removeFromQueue(itemId: string): Promise<void> {
    const item = this.queue.find(i => i.id === itemId);
    if (!item) return;

    if (item.status === 'downloading') {
      try {
        await downloadManager.cancelDownload(item.model.id);
      } catch (error) {
        console.warn('[DownloadQueue] Error removing download:', error);
      }
    }

    this.queue = this.queue.filter(i => i.id !== itemId);
    await this.saveQueue();
    this.processQueue();
  }

  updateItemPriority(itemId: string, priority: DownloadPriority): void {
    const item = this.queue.find(i => i.id === itemId);
    if (item) {
      item.priority = priority;
      this.saveQueue();
    }
  }

  setMaxConcurrent(max: number): void {
    this.maxConcurrent = Math.max(1, Math.min(5, max));
    this.processQueue();
  }

  getMaxConcurrent(): number {
    return this.maxConcurrent;
  }

  clearCompleted(): void {
    this.queue = this.queue.filter(item => item.status !== 'completed' && item.status !== 'cancelled');
    this.saveQueue();
  }

  clearAll(): void {
    this.downloadingItems.forEach(item => {
      downloadManager.cancelDownload(item.model.id).catch(() => {});
    });
    this.queue = [];
    this.saveQueue();
  }

  getItem(itemId: string): DownloadQueueItem | undefined {
    return this.queue.find(i => i.id === itemId);
  }

  getQueue(): DownloadQueueItem[] {
    return [...this.queue];
  }

  private async saveQueue(): Promise<void> {
    try {
      const serializable = this.queue.map(item => ({
        ...item,
        progress: item.progress,
      }));
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(serializable));
    } catch (error) {
      console.error('[DownloadQueue] Failed to save queue:', error);
    }
  }

  private async loadQueue(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        const savedItems = JSON.parse(stored) as DownloadQueueItem[];
        for (const item of savedItems) {
          if (item.status === 'downloading') {
            item.status = 'paused';
            item.error = 'Interrupted - tap to resume';
          }
        }
        this.queue = savedItems;
        console.log(`[DownloadQueue] Loaded ${savedItems.length} items from storage`);
      }
    } catch (error) {
      console.error('[DownloadQueue] Failed to load queue:', error);
    }
  }

  pauseAll(): void {
    this.queue.forEach(item => {
      if (item.status === 'downloading' || item.status === 'queued') {
        this.pauseDownload(item.id);
      }
    });
  }

  resumeAll(): void {
    this.queue.forEach(item => {
      if (item.status === 'paused') {
        this.resumeDownload(item.id);
      }
    });
  }

  retryFailed(): void {
    this.failedItems.forEach(item => {
      item.status = 'queued';
      item.error = null;
      item.retryCount = 0;
    });
    this.saveQueue();
    this.processQueue();
  }
}

let downloadQueueInstance: DownloadQueueManager | null = null;

export function getDownloadQueueManager(): DownloadQueueManager {
  if (!downloadQueueInstance) {
    downloadQueueInstance = new DownloadQueueManager();
  }
  return downloadQueueInstance;
}

export default DownloadQueueManager;
