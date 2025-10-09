import {Q} from '@nozbe/watermelondb';
import {makeAutoObservable} from 'mobx';

import {database} from '../../database';
import type {EntityType} from '../../database/models/SyncStatus';
import type {CachedPal, UserLibrary, SyncStatus} from '../../database/models';

import {authService} from './AuthService';
import {palsHubService} from './PalsHubService';
import {PalsHubErrorHandler, RetryHandler} from './ErrorHandler';

import type {PalsHubPal, SyncState} from '../../types/palshub';

export interface SyncProgress {
  current: number;
  total: number;
  operation: string;
}

class SyncService {
  isSyncing: boolean = false;
  lastSyncTime: number = 0;
  syncProgress: SyncProgress | null = null;
  syncError: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  get syncState(): SyncState {
    if (this.isSyncing) {
      return {status: 'syncing'};
    }
    if (this.syncError) {
      return {status: 'error', error: this.syncError};
    }
    if (this.lastSyncTime > 0) {
      return {status: 'success', lastSync: this.lastSyncTime};
    }
    return {status: 'idle'};
  }

  // Main sync method
  async syncAll(): Promise<void> {
    if (this.isSyncing) {
      return;
    }

    try {
      this.isSyncing = true;
      this.syncError = null;
      this.syncProgress = {current: 0, total: 4, operation: 'Starting sync...'};

      // Only sync if user is authenticated
      if (!authService.isAuthenticated) {
        console.log('User not authenticated, skipping sync');
        return;
      }

      // Sync categories
      this.syncProgress = {
        current: 1,
        total: 4,
        operation: 'Syncing categories...',
      };
      await this.syncCategories();

      // Sync tags
      this.syncProgress = {current: 2, total: 4, operation: 'Syncing tags...'};
      await this.syncTags();

      // Sync user library
      this.syncProgress = {
        current: 3,
        total: 4,
        operation: 'Syncing library...',
      };
      await this.syncUserLibrary();

      // Sync cached Pals metadata
      this.syncProgress = {
        current: 4,
        total: 4,
        operation: 'Updating Pal metadata...',
      };
      await this.syncCachedPalsMetadata();

      this.lastSyncTime = Date.now();
      await this.updateSyncStatus('library', 'synced');
    } catch (error) {
      const errorInfo = PalsHubErrorHandler.handle(error);
      this.syncError = errorInfo.userMessage;
      await this.updateSyncStatus('library', 'error', errorInfo.message);
      throw error;
    } finally {
      this.isSyncing = false;
      this.syncProgress = null;
    }
  }

  // Sync user's library
  async syncUserLibrary(): Promise<void> {
    if (!authService.user) {
      return;
    }

    try {
      const libraryResponse = await RetryHandler.withRetry(() =>
        palsHubService.getLibrary({limit: 20}),
      );

      const userLibraryCollection = database.get<UserLibrary>('user_library');

      await database.write(async () => {
        // Clear existing library entries for this user
        const existingEntries = await userLibraryCollection
          .query(Q.where('user_id', authService.user!.id))
          .fetch();

        for (const entry of existingEntries) {
          await entry.destroyPermanently();
        }

        // Insert new library entries
        for (const pal of libraryResponse.pals) {
          await userLibraryCollection.create((entry: UserLibrary) => {
            entry.userId = authService.user!.id;
            entry.palshubId = pal.id; // Use pal.id instead of pal_id
            entry.purchasedAt = Date.now(); // Use current time since purchase info not available
            entry.purchaseId = undefined; // Purchase ID not available in processed response
            entry.isDownloaded = false; // Will be updated when Pal is downloaded
          });
        }
      });

      await this.updateSyncStatus('library', 'synced');
    } catch (error) {
      await this.updateSyncStatus(
        'library',
        'error',
        PalsHubErrorHandler.handle(error).message,
      );
      throw error;
    }
  }

  // Sync categories (for filtering)
  async syncCategories(): Promise<void> {
    try {
      const categoriesResponse = await RetryHandler.withRetry(() =>
        palsHubService.getCategories(),
      );

      // Store categories in global settings for now
      // In a more complex app, you might want a dedicated categories table
      const globalSettingsCollection = database.get('global_settings');

      await database.write(async () => {
        const categoriesData = JSON.stringify(categoriesResponse.categories);

        // Try to find existing categories setting
        const existingCategories = await globalSettingsCollection
          .query(Q.where('key', 'palshub_categories'))
          .fetch();

        if (existingCategories.length > 0) {
          await existingCategories[0].update((setting: any) => {
            setting.value = categoriesData;
            setting.updatedAt = Date.now();
          });
        } else {
          await globalSettingsCollection.create((setting: any) => {
            setting.key = 'palshub_categories';
            setting.value = categoriesData;
            setting.createdAt = Date.now();
            setting.updatedAt = Date.now();
          });
        }
      });

      await this.updateSyncStatus('categories', 'synced');
    } catch (error) {
      await this.updateSyncStatus(
        'categories',
        'error',
        PalsHubErrorHandler.handle(error).message,
      );
      throw error;
    }
  }

  // Sync popular tags
  async syncTags(): Promise<void> {
    try {
      const tagsResponse = await RetryHandler.withRetry(() =>
        palsHubService.getTags({limit: 20}),
      );

      const globalSettingsCollection = database.get('global_settings');

      await database.write(async () => {
        const tagsData = JSON.stringify(tagsResponse.tags);

        const existingTags = await globalSettingsCollection
          .query(Q.where('key', 'palshub_tags'))
          .fetch();

        if (existingTags.length > 0) {
          await existingTags[0].update((setting: any) => {
            setting.value = tagsData;
            setting.updatedAt = Date.now();
          });
        } else {
          await globalSettingsCollection.create((setting: any) => {
            setting.key = 'palshub_tags';
            setting.value = tagsData;
            setting.createdAt = Date.now();
            setting.updatedAt = Date.now();
          });
        }
      });

      await this.updateSyncStatus('tags', 'synced');
    } catch (error) {
      await this.updateSyncStatus(
        'tags',
        'error',
        PalsHubErrorHandler.handle(error).message,
      );
      throw error;
    }
  }

  // Update metadata for cached Pals
  async syncCachedPalsMetadata(): Promise<void> {
    try {
      const cachedPalsCollection = database.get<CachedPal>('cached_pals');
      const cachedPals = await cachedPalsCollection.query().fetch();

      for (const cachedPal of cachedPals) {
        try {
          const updatedPal = await palsHubService.getPal(cachedPal.palshubId);

          await database.write(async () => {
            await cachedPal.update((pal: CachedPal) => {
              pal.title = updatedPal.title;
              pal.description = updatedPal.description;
              pal.thumbnailUrl = updatedPal.thumbnail_url;
              pal.averageRating = updatedPal.average_rating;
              pal.reviewCount = updatedPal.review_count || 0;
              pal.cachedAt = Date.now();
            });
          });
        } catch (error) {
          // Log error but continue with other Pals
          console.warn(
            `Failed to update cached Pal ${cachedPal.palshubId}:`,
            error,
          );
        }
      }

      await this.updateSyncStatus('pal', 'synced');
    } catch (error) {
      await this.updateSyncStatus(
        'pal',
        'error',
        PalsHubErrorHandler.handle(error).message,
      );
      throw error;
    }
  }

  // Cache a Pal for offline browsing
  async cachePal(pal: PalsHubPal): Promise<void> {
    const cachedPalsCollection = database.get<CachedPal>('cached_pals');

    await database.write(async () => {
      // Check if already cached
      const existing = await cachedPalsCollection
        .query(Q.where('palshub_id', pal.id))
        .fetch();

      if (existing.length > 0) {
        // Update existing
        await existing[0].update((cachedPal: CachedPal) => {
          this.updateCachedPalFromPalsHubPal(cachedPal, pal);
        });
      } else {
        // Create new
        await cachedPalsCollection.create((cachedPal: CachedPal) => {
          this.updateCachedPalFromPalsHubPal(cachedPal, pal);
        });
      }
    });
  }

  private updateCachedPalFromPalsHubPal(
    cachedPal: CachedPal,
    pal: PalsHubPal,
  ): void {
    cachedPal.palshubId = pal.id;
    cachedPal.title = pal.title;
    cachedPal.description = pal.description;
    cachedPal.thumbnailUrl = pal.thumbnail_url;
    cachedPal.creatorId = pal.creator_id;
    cachedPal.creatorName = pal.creator?.display_name;
    cachedPal.creatorAvatarUrl = pal.creator?.avatar_url;
    cachedPal.protectionLevel = pal.protection_level;
    cachedPal.priceCents = pal.price_cents;
    cachedPal.allowFork = pal.allow_fork;
    cachedPal.averageRating = pal.average_rating;
    cachedPal.reviewCount = pal.review_count || 0;
    cachedPal.isOwned = pal.is_owned || false;
    cachedPal.categories = JSON.stringify(
      pal.categories?.map(c => c.name) || [],
    );
    cachedPal.tags = JSON.stringify(pal.tags?.map(t => t.name) || []);
    cachedPal.systemPrompt = pal.system_prompt;
    cachedPal.modelSettings = JSON.stringify(pal.model_settings || {});
    cachedPal.cachedAt = Date.now();
  }

  // Update sync status in database
  private async updateSyncStatus(
    entityType: EntityType,
    status: 'synced' | 'pending' | 'error',
    errorMessage?: string,
  ): Promise<void> {
    const syncStatusCollection = database.get<SyncStatus>('sync_status');

    await database.write(async () => {
      const existing = await syncStatusCollection
        .query(Q.where('entity_type', entityType))
        .fetch();

      if (existing.length > 0) {
        await existing[0].update((syncStatus: SyncStatus) => {
          syncStatus.status = status;
          syncStatus.lastSync = Date.now();
          syncStatus.errorMessage = errorMessage;
        });
      } else {
        await syncStatusCollection.create((syncStatus: SyncStatus) => {
          syncStatus.entityType = entityType;
          syncStatus.status = status;
          syncStatus.lastSync = Date.now();
          syncStatus.errorMessage = errorMessage;
        });
      }
    });
  }

  // Check if sync is needed
  async needsSync(): Promise<boolean> {
    if (!authService.isAuthenticated) {
      return false;
    }

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return this.lastSyncTime < fiveMinutesAgo;
  }

  // Clear all cached data
  async clearCache(): Promise<void> {
    await database.write(async () => {
      const cachedPalsCollection = database.get<CachedPal>('cached_pals');
      const userLibraryCollection = database.get<UserLibrary>('user_library');
      const syncStatusCollection = database.get<SyncStatus>('sync_status');

      const allCachedPals = await cachedPalsCollection.query().fetch();
      const allUserLibrary = await userLibraryCollection.query().fetch();
      const allSyncStatus = await syncStatusCollection.query().fetch();

      for (const item of [
        ...allCachedPals,
        ...allUserLibrary,
        ...allSyncStatus,
      ]) {
        await item.destroyPermanently();
      }
    });

    this.lastSyncTime = 0;
    this.syncError = null;
  }
}

export const syncService = new SyncService();
