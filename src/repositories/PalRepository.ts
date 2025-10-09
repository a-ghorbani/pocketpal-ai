import * as RNFS from '@dr.pogodin/react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Q} from '@nozbe/watermelondb';
import {database} from '../database';
import LocalPal from '../database/models/LocalPal';
import type {Pal} from '../types/pal';
import {
  migrateLegacyPalToNew,
  type LegacyPalData,
} from '../utils/pal-migration';
import {CompletionParams} from '../utils/completionTypes';
import {migrateCompletionSettings} from '../utils/completionSettingsVersions';

class PalRepository {
  // Check if we need to migrate from JSON/AsyncStorage
  async checkAndMigrateFromJSON(): Promise<boolean> {
    try {
      // Check if we've already migrated
      const migrationFlagPath = `${RNFS.DocumentDirectoryPath}/pal-db-migration-complete.flag`;
      const migrationComplete = await RNFS.exists(migrationFlagPath);

      if (migrationComplete) {
        console.log('Pal database migration already completed');
        return false;
      }

      // Check if old AsyncStorage data exists
      const oldData = await AsyncStorage.getItem('PalStore');

      if (!oldData) {
        // No old data to migrate, mark as complete
        await RNFS.writeFile(migrationFlagPath, 'true');
        return false;
      }

      console.log(
        'Starting pal migration from AsyncStorage to WatermelonDB...',
      );

      // Parse old data
      const parsedData = JSON.parse(oldData);
      const legacyPals: LegacyPalData[] = parsedData.pals || [];

      if (legacyPals.length === 0) {
        // No pals to migrate
        await RNFS.writeFile(migrationFlagPath, 'true');
        return false;
      }

      // Begin database transaction for atomic migration
      await database.write(async () => {
        // Migrate each legacy pal to new format
        for (const legacyPal of legacyPals) {
          // Convert legacy pal to new format
          const pal = migrateLegacyPalToNew(legacyPal);
          await database.collections
            .get<LocalPal>('local_pals')
            .create((record: LocalPal) => {
              record.name = pal.name;
              record.description = pal.description;
              record.thumbnailUrl = pal.thumbnail_url;
              // console.log('Creating pal with description:', pal.description);
              record.systemPrompt = pal.systemPrompt;
              record.originalSystemPrompt = pal.originalSystemPrompt;
              record.isSystemPromptChanged = pal.isSystemPromptChanged;
              record.useAIPrompt = pal.useAIPrompt;
              record.defaultModel = LocalPal.safeStringify(pal.defaultModel);
              record.promptGenerationModel = LocalPal.safeStringify(
                pal.promptGenerationModel,
              );
              record.generatingPrompt = pal.generatingPrompt;
              record.color = LocalPal.safeStringify(pal.color);
              record.capabilities = LocalPal.safeStringify(pal.capabilities);
              record.parameters = LocalPal.safeStringify(pal.parameters);
              record.parameterSchema = LocalPal.safeStringifyArray(
                pal.parameterSchema || [],
              );
              record.source = pal.source || 'local';
              record.palshubId = pal.palshub_id;
              record.creatorInfo = LocalPal.safeStringify(pal.creator_info);
              record.categories = LocalPal.safeStringifyArray(
                pal.categories || [],
              );
              record.tags = LocalPal.safeStringifyArray(pal.tags || []);
              record.rating = pal.rating;
              record.reviewCount = pal.review_count;
              record.protectionLevel = pal.protection_level;
              record.priceCents = pal.price_cents;
              record.isOwned = pal.is_owned;
              record.generationSettings = LocalPal.safeStringify(
                pal.rawPalshubGenerationSettings,
              );
            });
        }
      });

      // Mark migration as complete
      await RNFS.writeFile(migrationFlagPath, 'true');

      // Optionally remove old data
      await AsyncStorage.removeItem('PalStore');

      console.log(
        `Successfully migrated ${legacyPals.length} pals to database`,
      );
      return true;
    } catch (error) {
      console.error('Error migrating pals from AsyncStorage:', error);
      return false;
    }
  }

  // CRUD Operations

  async getAllPals(): Promise<Pal[]> {
    try {
      const localPals = await database.collections
        .get<LocalPal>('local_pals')
        .query()
        .fetch();

      return localPals.map(pal => pal.toPal());
    } catch (error) {
      console.error('Error fetching all pals:', error);
      return [];
    }
  }

  async getPalById(id: string): Promise<Pal | null> {
    try {
      const localPal = await database.collections
        .get<LocalPal>('local_pals')
        .find(id);

      return localPal.toPal();
    } catch (error) {
      console.error('Error fetching pal by id:', error);
      return null;
    }
  }

  async createPal(
    palData: Omit<Pal, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<Pal> {
    try {
      const newPal = await database.write(async () => {
        return await database.collections
          .get<LocalPal>('local_pals')
          .create((record: LocalPal) => {
            record.name = palData.name;
            record.description = palData.description;
            record.thumbnailUrl = palData.thumbnail_url;
            record.systemPrompt = palData.systemPrompt;
            record.originalSystemPrompt = palData.originalSystemPrompt;
            record.isSystemPromptChanged = palData.isSystemPromptChanged;
            record.useAIPrompt = palData.useAIPrompt;
            record.defaultModel = LocalPal.safeStringify(palData.defaultModel);
            record.promptGenerationModel = LocalPal.safeStringify(
              palData.promptGenerationModel,
            );
            record.generatingPrompt = palData.generatingPrompt;
            record.color = LocalPal.safeStringify(palData.color);
            record.capabilities = LocalPal.safeStringify(palData.capabilities);
            record.parameters = LocalPal.safeStringify(palData.parameters);
            record.parameterSchema = LocalPal.safeStringifyArray(
              palData.parameterSchema || [],
            );
            record.source = palData.source || 'local';
            record.palshubId = palData.palshub_id;
            record.creatorInfo = LocalPal.safeStringify(palData.creator_info);
            record.categories = LocalPal.safeStringifyArray(
              palData.categories || [],
            );
            record.tags = LocalPal.safeStringifyArray(palData.tags || []);
            record.rating = palData.rating;
            record.reviewCount = palData.review_count;
            record.protectionLevel = palData.protection_level;
            record.priceCents = palData.price_cents;
            record.isOwned = palData.is_owned;
            // Save generation settings (prefer local over PalsHub)
            const generationSettings =
              palData.completionSettings ||
              palData.rawPalshubGenerationSettings;
            record.generationSettings =
              LocalPal.safeStringify(generationSettings);
          });
      });

      return newPal.toPal();
    } catch (error) {
      console.error('Error creating pal:', error);
      throw error;
    }
  }

  async updatePal(id: string, updates: Partial<Pal>): Promise<Pal | null> {
    try {
      const updatedPal = await database.write(async () => {
        const localPal = await database.collections
          .get<LocalPal>('local_pals')
          .find(id);

        return await localPal.update((record: LocalPal) => {
          if (updates.name !== undefined) {
            record.name = updates.name;
          }
          if (updates.description !== undefined) {
            record.description = updates.description;
          }
          if (updates.thumbnail_url !== undefined) {
            record.thumbnailUrl = updates.thumbnail_url;
          }
          if (updates.systemPrompt !== undefined) {
            record.systemPrompt = updates.systemPrompt;
          }
          if (updates.originalSystemPrompt !== undefined) {
            record.originalSystemPrompt = updates.originalSystemPrompt;
          }
          if (updates.isSystemPromptChanged !== undefined) {
            record.isSystemPromptChanged = updates.isSystemPromptChanged;
          }
          if (updates.useAIPrompt !== undefined) {
            record.useAIPrompt = updates.useAIPrompt;
          }
          if (updates.defaultModel !== undefined) {
            record.defaultModel = LocalPal.safeStringify(updates.defaultModel);
          }
          if (updates.promptGenerationModel !== undefined) {
            record.promptGenerationModel = LocalPal.safeStringify(
              updates.promptGenerationModel,
            );
          }
          if (updates.generatingPrompt !== undefined) {
            record.generatingPrompt = updates.generatingPrompt;
          }
          if (updates.color !== undefined) {
            record.color = LocalPal.safeStringify(updates.color);
          }
          if (updates.capabilities !== undefined) {
            record.capabilities = LocalPal.safeStringify(updates.capabilities);
          }
          if (updates.parameters !== undefined) {
            record.parameters = LocalPal.safeStringify(updates.parameters);
          }
          if (updates.parameterSchema !== undefined) {
            record.parameterSchema = LocalPal.safeStringifyArray(
              updates.parameterSchema,
            );
          }
          if (updates.source !== undefined) {
            record.source = updates.source;
          }
          if (updates.palshub_id !== undefined) {
            record.palshubId = updates.palshub_id;
          }
          if (updates.creator_info !== undefined) {
            record.creatorInfo = LocalPal.safeStringify(updates.creator_info);
          }
          if (updates.categories !== undefined) {
            record.categories = LocalPal.safeStringifyArray(updates.categories);
          }
          if (updates.tags !== undefined) {
            record.tags = LocalPal.safeStringifyArray(updates.tags);
          }
          if (updates.rating !== undefined) {
            record.rating = updates.rating;
          }
          if (updates.review_count !== undefined) {
            record.reviewCount = updates.review_count;
          }
          if (updates.protection_level !== undefined) {
            record.protectionLevel = updates.protection_level;
          }
          if (updates.price_cents !== undefined) {
            record.priceCents = updates.price_cents;
          }
          if (updates.is_owned !== undefined) {
            record.isOwned = updates.is_owned;
          }
          if (
            updates.rawPalshubGenerationSettings !== undefined ||
            updates.completionSettings !== undefined
          ) {
            // Update generation settings (prefer local over PalsHub)
            record.generationSettings = LocalPal.safeStringify(
              updates.completionSettings ||
                updates.rawPalshubGenerationSettings,
            );
          }
        });
      });

      return updatedPal.toPal();
    } catch (error) {
      console.error('PalRepository: Error updating pal:', error);
      return null;
    }
  }

  async deletePal(id: string): Promise<boolean> {
    try {
      await database.write(async () => {
        const localPal = await database.collections
          .get<LocalPal>('local_pals')
          .find(id);

        await localPal.destroyPermanently();
      });

      return true;
    } catch (error) {
      console.error('Error deleting pal:', error);
      return false;
    }
  }

  // Query methods for filtering
  async getLocalPals(): Promise<Pal[]> {
    try {
      const localPals = await database.collections
        .get<LocalPal>('local_pals')
        .query(Q.where('source', 'local'))
        .fetch();

      return localPals.map(pal => pal.toPal());
    } catch (error) {
      console.error('Error fetching local pals:', error);
      return [];
    }
  }

  async getPalsHubPals(): Promise<Pal[]> {
    try {
      const palshubPals = await database.collections
        .get<LocalPal>('local_pals')
        .query(Q.where('source', 'palshub'))
        .fetch();

      return palshubPals.map(pal => pal.toPal());
    } catch (error) {
      console.error('Error fetching palshub pals:', error);
      return [];
    }
  }

  async getVideoPals(): Promise<Pal[]> {
    try {
      const allPals = await this.getAllPals();
      return allPals.filter(pal => pal.capabilities?.video === true);
    } catch (error) {
      console.error('Error fetching video pals:', error);
      return [];
    }
  }

  /**
   * Reset migration flag to force re-migration (for dev/testing purposes)
   */
  async resetMigration(): Promise<void> {
    try {
      const migrationFlagPath = `${RNFS.DocumentDirectoryPath}/pal-db-migration-complete.flag`;
      const exists = await RNFS.exists(migrationFlagPath);

      if (exists) {
        await RNFS.unlink(migrationFlagPath);
        console.log('Pal migration flag reset successfully');
      }

      // Also clear all local pals from database
      await database.write(async () => {
        const allPals = await database.collections
          .get<LocalPal>('local_pals')
          .query()
          .fetch();

        for (const pal of allPals) {
          await pal.destroyPermanently();
        }
      });

      console.log('All local pals cleared from database');
    } catch (error) {
      console.error('Error resetting pal migration:', error);
      throw error;
    }
  }

  // Get completion settings for a specific pal
  async getPalCompletionSettings(
    palId: string,
  ): Promise<CompletionParams | undefined> {
    try {
      const pal = (await database.collections
        .get('local_pals')
        .find(palId)) as LocalPal;

      const settings = pal.completionSettingsObject;
      if (settings) {
        // Ensure settings are migrated to the latest version
        return migrateCompletionSettings(settings);
      }
      return undefined;
    } catch (error) {
      console.error('Error getting pal completion settings:', error);
      return undefined;
    }
  }

  // Update completion settings for a specific pal
  async updatePalCompletionSettings(
    palId: string,
    settings: CompletionParams,
  ): Promise<void> {
    try {
      await database.write(async () => {
        const pal = (await database.collections
          .get('local_pals')
          .find(palId)) as LocalPal;

        // Ensure settings have a version
        const migratedSettings = migrateCompletionSettings(settings);

        await pal.update((record: any) => {
          record.generationSettings = LocalPal.safeStringify(migratedSettings);
        });
      });
    } catch (error) {
      console.error('Error updating pal completion settings:', error);
      throw error;
    }
  }

  // Clear completion settings for a specific pal (reset to defaults)
  async clearPalCompletionSettings(palId: string): Promise<void> {
    try {
      await database.write(async () => {
        const pal = (await database.collections
          .get('local_pals')
          .find(palId)) as LocalPal;

        await pal.update((record: any) => {
          record.generationSettings = undefined;
        });
      });
    } catch (error) {
      console.error('Error clearing pal completion settings:', error);
      throw error;
    }
  }
}

export const palRepository = new PalRepository();
export default PalRepository;
