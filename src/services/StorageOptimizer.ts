import * as RNFS from '@dr.pogodin/react-native-fs';
import { makeAutoObservable } from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Model } from '../../utils/types';
import { formatBytes } from '../../utils';
import { getModelManager } from './ModelManager';

export interface StorageInfo {
  totalSpace: number;
  freeSpace: number;
  usedSpace: number;
  appUsage: number;
  modelUsage: number;
  cacheUsage: number;
}

export interface LRUCleanupCandidate {
  modelId: string;
  modelName: string;
  size: number;
  lastUsedAt: number | null;
  daysSinceLastUse: number;
}

export interface StorageAlert {
  level: 'normal' | 'low' | 'warning' | 'critical';
  message: string;
  freeSpace: number;
  threshold: number;
}

const LRU_STORAGE_KEY = '@pocketpal_model_lru';
const ALERT_STORAGE_KEY = '@pocketpal_storage_alert';
const WARNING_THRESHOLD_BYTES = 1024 * 1024 * 1024; // 1 GB
const CRITICAL_THRESHOLD_BYTES = 500 * 1024 * 1024; // 500 MB
const LOW_THRESHOLD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const DEFAULT_UNUSED_DAYS_THRESHOLD = 30;

export class StorageOptimizer {
  private modelLastUsed: Map<string, number> = new Map();
  private _storageInfo: StorageInfo | null = null;
  private _alert: StorageAlert | null = null;
  private isLoading: boolean = false;

  constructor() {
    makeAutoObservable(this);
    this.loadLRUData();
  }

  get storageInfo(): StorageInfo | null {
    return this._storageInfo;
  }

  get alert(): StorageAlert | null {
    return this._alert;
  }

  private async loadLRUData(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(LRU_STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored) as Record<string, number>;
        this.modelLastUsed = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('[StorageOptimizer] Failed to load LRU data:', error);
    }
  }

  private async saveLRUData(): Promise<void> {
    try {
      const data = Object.fromEntries(this.modelLastUsed);
      await AsyncStorage.setItem(LRU_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('[StorageOptimizer] Failed to save LRU data:', error);
    }
  }

  trackModelUsage(modelId: string): void {
    this.modelLastUsed.set(modelId, Date.now());
    this.saveLRUData();

    const modelManager = getModelManager();
    modelManager.markAsUsed(modelId);
  }

  getLastUsedAt(modelId: string): number | null {
    return this.modelLastUsed.get(modelId) || null;
  }

  getDaysSinceLastUse(modelId: string): number {
    const lastUsed = this.getLastUsedAt(modelId);
    if (!lastUsed) return Infinity;
    return Math.floor((Date.now() - lastUsed) / (1000 * 60 * 60 * 24));
  }

  async refreshStorageInfo(): Promise<StorageInfo> {
    this.isLoading = true;

    try {
      const [freeSpace, modelUsage, cacheUsage] = await Promise.all([
        this.getFreeDiskSpace(),
        this.calculateModelUsage(),
        this.calculateCacheUsage(),
      ]);

      const totalSpace = await this.getTotalDiskSpace();
      const usedSpace = totalSpace - freeSpace;
      const appUsage = modelUsage + cacheUsage;

      const info: StorageInfo = {
        totalSpace,
        freeSpace,
        usedSpace,
        appUsage,
        modelUsage,
        cacheUsage,
      };

      this._storageInfo = info;
      this._alert = this.checkStorageAlert(info);
      await this.storeAlert(this._alert);

      return info;
    } catch (error) {
      console.error('[StorageOptimizer] Failed to refresh storage info:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  private async getFreeDiskSpace(): Promise<number> {
    try {
      const free = await RNFS.getFSInfo();
      return free.freeSpace;
    } catch (error) {
      console.warn('[StorageOptimizer] Failed to get free space:', error);
      return 0;
    }
  }

  private async getTotalDiskSpace(): Promise<number> {
    try {
      const info = await RNFS.getFSInfo();
      return info.totalSpace;
    } catch (error) {
      console.warn('[StorageOptimizer] Failed to get total space:', error);
      return 0;
    }
  }

  private async calculateModelUsage(): Promise<number> {
    const modelManager = getModelManager();
    const downloadedModels = modelManager.getDownloadedModels();
    return downloadedModels.reduce((sum, m) => sum + m.size, 0);
  }

  private async calculateCacheUsage(): Promise<number> {
    try {
      const cacheDir = RNFS.CachesDirectoryPath;
      return await this.getDirectorySize(cacheDir);
    } catch (error) {
      console.warn('[StorageOptimizer] Failed to calculate cache usage:', error);
      return 0;
    }
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    try {
      const items = await RNFS.readDir(dirPath);
      let totalSize = 0;

      for (const item of items) {
        if (item.isFile()) {
          totalSize += item.size;
        } else if (item.isDirectory()) {
          totalSize += await this.getDirectorySize(item.path);
        }
      }

      return totalSize;
    } catch (error) {
      return 0;
    }
  }

  private checkStorageAlert(info: StorageInfo): StorageAlert | null {
    const freeSpace = info.freeSpace;

    if (freeSpace <= CRITICAL_THRESHOLD_BYTES) {
      return {
        level: 'critical',
        message: `Storage critically low! Only ${formatBytes(freeSpace)} free. Please delete unused models.`,
        freeSpace,
        threshold: CRITICAL_THRESHOLD_BYTES,
      };
    }

    if (freeSpace <= WARNING_THRESHOLD_BYTES) {
      return {
        level: 'warning',
        message: `Storage running low: ${formatBytes(freeSpace)} free. Consider cleaning up.`,
        freeSpace,
        threshold: WARNING_THRESHOLD_BYTES,
      };
    }

    if (freeSpace <= LOW_THRESHOLD_BYTES) {
      return {
        level: 'low',
        message: `Storage getting low: ${formatBytes(freeSpace)} free. You may want to manage your models.`,
        freeSpace,
        threshold: LOW_THRESHOLD_BYTES,
      };
    }

    return null;
  }

  async getStoredAlert(): Promise<StorageAlert | null> {
    try {
      const stored = await AsyncStorage.getItem(ALERT_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as StorageAlert;
      }
    } catch (error) {
      console.error('[StorageOptimizer] Failed to get stored alert:', error);
    }
    return null;
  }

  async storeAlert(alert: StorageAlert | null): Promise<void> {
    try {
      if (alert) {
        await AsyncStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(alert));
      } else {
        await AsyncStorage.removeItem(ALERT_STORAGE_KEY);
      }
    } catch (error) {
      console.error('[StorageOptimizer] Failed to store alert:', error);
    }
  }

  getLRUCleanupCandidates(
    maxDaysUnused: number = DEFAULT_UNUSED_DAYS_THRESHOLD,
    maxResults: number = 10
  ): LRUCleanupCandidate[] {
    const modelManager = getModelManager();
    const downloaded = modelManager.getDownloadedModels();

    const candidates: LRUCleanupCandidate[] = downloaded
      .map(model => {
        const lastUsedAt = this.getLastUsedAt(model.id);
        const daysSinceLastUse = this.getDaysSinceLastUse(model.id);

        return {
          modelId: model.id,
          modelName: model.name,
          size: model.size,
          lastUsedAt,
          daysSinceLastUse,
        };
      })
      .filter(c => c.daysSinceLastUse >= maxDaysUnused)
      .sort((a, b) => b.daysSinceLastUse - a.daysSinceLastUse)
      .slice(0, maxResults);

    return candidates;
  }

  getTotalCleanupPotential(maxDaysUnused: number = DEFAULT_UNUSED_DAYS_THRESHOLD): number {
    const candidates = this.getLRUCleanupCandidates(maxDaysUnused, 1000);
    return candidates.reduce((sum, c) => sum + c.size, 0);
  }

  async clearCache(): Promise<number> {
    try {
      const cacheDir = RNFS.CachesDirectoryPath;
      const clearedSize = await this.deleteDirectoryContents(cacheDir);
      console.log(`[StorageOptimizer] Cleared ${formatBytes(clearedSize)} from cache`);
      await this.refreshStorageInfo();
      return clearedSize;
    } catch (error) {
      console.error('[StorageOptimizer] Failed to clear cache:', error);
      return 0;
    }
  }

  private async deleteDirectoryContents(dirPath: string): Promise<number> {
    let totalCleared = 0;

    try {
      const items = await RNFS.readDir(dirPath);

      for (const item of items) {
        try {
          if (item.isFile()) {
            totalCleared += item.size;
            await RNFS.unlink(item.path);
          } else if (item.isDirectory()) {
            totalCleared += await this.deleteDirectoryContents(item.path);
            await RNFS.unlink(item.path);
          }
        } catch (e) {
          console.warn(`[StorageOptimizer] Failed to delete ${item.path}:`, e);
        }
      }
    } catch (error) {
      console.warn('[StorageOptimizer] Failed to read directory:', dirPath, error);
    }

    return totalCleared;
  }

  async autoCleanupIfNeeded(): Promise<{ cleaned: boolean; freedSpace: number }> {
    const info = await this.refreshStorageInfo();

    if (info.freeSpace > WARNING_THRESHOLD_BYTES) {
      return { cleaned: false, freedSpace: 0 };
    }

    const candidates = this.getLRUCleanupCandidates(DEFAULT_UNUSED_DAYS_THRESHOLD, 5);
    let freedSpace = 0;

    for (const candidate of candidates) {
      if (info.freeSpace + freedSpace > WARNING_THRESHOLD_BYTES) {
        break;
      }

      const modelManager = getModelManager();
      const model = modelManager.getModel(candidate.modelId);

      if (model && model.fullPath) {
        try {
          await RNFS.unlink(model.fullPath);
          freedSpace += candidate.size;
          this.modelLastUsed.delete(candidate.modelId);
          console.log(`[StorageOptimizer] Auto-cleaned model: ${candidate.modelName}`);
        } catch (error) {
          console.warn(`[StorageOptimizer] Failed to delete model ${candidate.modelId}:`, error);
        }
      }
    }

    await this.saveLRUData();
    await this.refreshStorageInfo();

    return { cleaned: freedSpace > 0, freedSpace };
  }

  getStorageSummary(): {
    total: string;
    free: string;
    used: string;
    models: string;
    cache: string;
    percentUsed: number;
  } | null {
    if (!this._storageInfo) return null;

    const info = this._storageInfo;
    return {
      total: formatBytes(info.totalSpace),
      free: formatBytes(info.freeSpace),
      used: formatBytes(info.usedSpace),
      models: formatBytes(info.modelUsage),
      cache: formatBytes(info.cacheUsage),
      percentUsed: info.totalSpace > 0 ? (info.usedSpace / info.totalSpace) * 100 : 0,
    };
  }

  resetLRU(): void {
    this.modelLastUsed.clear();
    this.saveLRUData();
  }
}

let storageOptimizerInstance: StorageOptimizer | null = null;

export function getStorageOptimizer(): StorageOptimizer {
  if (!storageOptimizerInstance) {
    storageOptimizerInstance = new StorageOptimizer();
  }
  return storageOptimizerInstance;
}

export default StorageOptimizer;
