import {Q} from '@nozbe/watermelondb';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {
  database,
  ChatSession,
  Message,
  CompletionSetting,
  GlobalSetting,
} from '../database';

import {SessionMetaData} from '../store/ChatSessionStore';

import {MessageType} from '../utils/types';
import {CompletionParams} from '../utils/completionTypes';
import {
  defaultCompletionParams,
  migrateCompletionSettings,
} from '../utils/completionSettingsVersions';

// Default completion settings without prompt and stop
const defaultCompletionSettings = {...defaultCompletionParams};
delete defaultCompletionSettings.prompt;
delete defaultCompletionSettings.stop;

class ChatSessionRepository {
  // Check if we need to migrate from JSON files
  async checkAndMigrateFromJSON(): Promise<boolean> {
    try {
      // Check if we've already migrated
      const migrationFlagPath = `${RNFS.DocumentDirectoryPath}/db-migration-complete.flag`;
      const migrationComplete = await RNFS.exists(migrationFlagPath);

      if (migrationComplete) {
        console.log('Database migration already completed');
        return false;
      }

      // Check if old JSON data exists
      const oldDataPath = `${RNFS.DocumentDirectoryPath}/session-metadata.json`;
      const oldDataExists = await RNFS.exists(oldDataPath);

      if (!oldDataExists) {
        // No old data to migrate, mark as complete
        await RNFS.writeFile(migrationFlagPath, 'true');
        return false;
      }

      console.log('Starting migration from JSON to WatermelonDB...');

      // Read old data
      const jsonData = await RNFS.readFile(oldDataPath);
      const sessions: SessionMetaData[] = JSON.parse(jsonData);

      // Begin database transaction for atomic migration
      await database.write(async () => {
        // Migrate each session
        for (const session of sessions) {
          // Create session record
          const newSession = await database.collections
            .get('chat_sessions')
            .create((record: any) => {
              record.title = session.title;
              record.date = session.date;
              if (session.activePalId) {
                record.activePalId = session.activePalId;
              }
            });

          // Ensure the completion settings have a version
          const migratedSettings = migrateCompletionSettings(
            session.completionSettings,
          );

          await database.collections
            .get('completion_settings')
            .create((record: any) => {
              record.sessionId = newSession.id;
              record.settings = JSON.stringify(migratedSettings);
            });

          for (let i = 0; i < session.messages.length; i++) {
            const msg = session.messages[i];

            // Extract author ID and prepare metadata with author data
            // Handle both string authors and object authors
            const authorId =
              typeof msg.author === 'string'
                ? msg.author
                : msg.author?.id || 'unknown';
            const metadata = msg.metadata || {};

            // Store author data in metadata for reconstruction
            if (typeof msg.author === 'object' && msg.author !== null) {
              if (
                msg.author.firstName ||
                msg.author.lastName ||
                msg.author.imageUrl
              ) {
                metadata.authorData = {
                  firstName: msg.author.firstName,
                  lastName: msg.author.lastName,
                  imageUrl: msg.author.imageUrl,
                  role: msg.author.role,
                };
              }
            }

            try {
              // Check if createdAt is valid
              if (!msg.createdAt) {
                console.warn(
                  'Message has no createdAt timestamp, using current time',
                );
              }

              await database.collections
                .get('messages')
                .create((record: any) => {
                  record.sessionId = newSession.id; // Use sessionId (JavaScript property), not session_id (DB column)
                  record.author = authorId;
                  if (msg.type === 'text') {
                    record.text = msg.text;
                  }
                  record.type = msg.type;
                  record.metadata = JSON.stringify(metadata);
                  record.position = session.messages.length - i; // Reverse order for correct sorting
                  record.createdAt = msg.createdAt || Date.now(); // Use createdAt, not created_at
                });
            } catch (error) {
              console.error('Error creating message record:', error);
              throw error; // Re-throw to stop the migration
            }
          }
        }

        // Migrate global settings if they exist
        const globalSettingsPath = `${RNFS.DocumentDirectoryPath}/global-completion-settings.json`;
        const globalSettingsExist = await RNFS.exists(globalSettingsPath);

        if (globalSettingsExist) {
          const globalSettingsData = await RNFS.readFile(globalSettingsPath);
          const globalSettings: CompletionParams =
            JSON.parse(globalSettingsData);

          // Ensure the global settings have a version
          const migratedGlobalSettings =
            migrateCompletionSettings(globalSettings);

          await database.collections
            .get('global_settings')
            .create((record: any) => {
              record.key = 'newChatCompletionSettings';
              record.value = JSON.stringify(migratedGlobalSettings);
            });
        }
      });

      // Mark migration as complete
      await RNFS.writeFile(migrationFlagPath, 'true');
      console.log('Migration from JSON to WatermelonDB completed successfully');

      return true;
    } catch (error) {
      console.error('Error during migration:', error);
      return false;
    }
  }

  // Get all sessions grouped by date
  async getAllSessions(): Promise<ChatSession[]> {
    const sessions = await database.collections
      .get('chat_sessions')
      .query()
      .fetch();
    return sessions as unknown as ChatSession[];
  }

  // Get a single session with its messages and settings
  async getSessionById(id: string): Promise<{
    session: ChatSession;
    messages: Message[];
    completionSettings: CompletionSetting;
  } | null> {
    const session = await database.collections
      .get('chat_sessions')
      .find(id)
      .catch(() => null);

    if (!session) {
      return null;
    }

    const messages = await database.collections
      .get('messages')
      .query(Q.where('session_id', id), Q.sortBy('position', Q.desc))
      .fetch();

    // Since we're using 'has_many' for completion_settings in the model (TypeScript limitation),
    // we need to fetch as an array and get the first item
    const completionSettingsArray = await database.collections
      .get('completion_settings')
      .query(Q.where('session_id', id))
      .fetch();

    const completionSettings =
      completionSettingsArray.length > 0 ? completionSettingsArray[0] : null;

    return {
      session: session as unknown as ChatSession,
      messages: messages as unknown as Message[],
      completionSettings: completionSettings as unknown as CompletionSetting,
    };
  }

  // Get session metadata with settings but without messages (for lazy loading)
  async getSessionMetadataWithSettings(id: string): Promise<{
    session: ChatSession;
    completionSettings: CompletionSetting;
  } | null> {
    const session = await database.collections
      .get('chat_sessions')
      .find(id)
      .catch(() => null);

    if (!session) {
      return null;
    }

    // Get completion settings but NOT messages
    const completionSettingsArray = await database.collections
      .get('completion_settings')
      .query(Q.where('session_id', id))
      .fetch();

    const completionSettings =
      completionSettingsArray.length > 0 ? completionSettingsArray[0] : null;

    return {
      session: session as unknown as ChatSession,
      completionSettings: completionSettings as unknown as CompletionSetting,
    };
  }

  // Create a new session
  async createSession(
    title: string,
    initialMessages: MessageType.Any[] = [],
    completionSettings: CompletionParams = defaultCompletionSettings,
    activePalId?: string,
  ): Promise<ChatSession> {
    let newSession: any;

    await database.write(async () => {
      // Create session
      newSession = await database.collections
        .get('chat_sessions')
        .create((record: any) => {
          record.title = title;
          record.date = new Date().toISOString();
          if (activePalId) {
            record.activePalId = activePalId;
          }
        });

      // Create completion settings with version
      const migratedSettings = migrateCompletionSettings(completionSettings);

      await database.collections
        .get('completion_settings')
        .create((record: any) => {
          record.sessionId = newSession.id;
          record.settings = JSON.stringify(migratedSettings);
        });

      // Create initial messages if any
      for (let i = 0; i < initialMessages.length; i++) {
        const msg = initialMessages[i];

        const authorId = msg.author.id;
        const metadata = msg.metadata || {};

        if (
          msg.author.firstName ||
          msg.author.lastName ||
          msg.author.imageUrl
        ) {
          metadata.authorData = {
            firstName: msg.author.firstName,
            lastName: msg.author.lastName,
            imageUrl: msg.author.imageUrl,
            role: msg.author.role,
          };
        }
        if (msg.type === 'text' && msg.imageUris) {
          metadata.imageUris = msg.imageUris;
        }

        await database.collections.get('messages').create((record: any) => {
          record.sessionId = newSession.id;
          record.author = authorId;
          if (msg.type === 'text') {
            record.text = msg.text;
          }
          record.type = msg.type;
          record.metadata = JSON.stringify(metadata);
          record.position = initialMessages.length - i; // Reverse order
          record.createdAt = msg.createdAt || Date.now();
        });
      }
    });

    return newSession as unknown as ChatSession;
  }

  // Delete a session
  async deleteSession(id: string): Promise<void> {
    const session = await database.collections
      .get('chat_sessions')
      .find(id)
      .catch(() => null);

    if (!session) {
      return;
    }

    await database.write(async () => {
      // Delete associated messages
      const messages = await database.collections
        .get('messages')
        .query(Q.where('session_id', id))
        .fetch();

      for (const message of messages) {
        await message.destroyPermanently();
      }

      // Delete associated completion settings
      const settings = await database.collections
        .get('completion_settings')
        .query(Q.where('session_id', id))
        .fetch();

      for (const setting of settings) {
        await setting.destroyPermanently();
      }

      // Delete the session itself
      await session.destroyPermanently();
    });
  }

  // Delete multiple sessions in a single transaction
  async deleteSessions(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await database.write(async () => {
      for (const id of ids) {
        const session = await database.collections
          .get('chat_sessions')
          .find(id)
          .catch(() => null);

        if (!session) {
          console.warn(`Session ${id} not found during bulk delete, skipping`);
          continue;
        }

        // Delete associated messages
        const messages = await database.collections
          .get('messages')
          .query(Q.where('session_id', id))
          .fetch();

        for (const message of messages) {
          await message.destroyPermanently();
        }

        // Delete associated completion settings
        const settings = await database.collections
          .get('completion_settings')
          .query(Q.where('session_id', id))
          .fetch();

        for (const setting of settings) {
          await setting.destroyPermanently();
        }

        // Delete the session itself
        await session.destroyPermanently();
      }
    });
  }

  // Export multiple sessions
  async exportSessions(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const {exportChatSession} = await import('../utils/exportUtils');

    for (const id of ids) {
      await exportChatSession(id);
    }
  }

  // Add a message to a session
  async addMessageToSession(
    sessionId: string,
    message: MessageType.Any,
  ): Promise<Message> {
    let newMessage: any;

    await database.write(async () => {
      // Get the highest position
      const messages = await database.collections
        .get('messages')
        .query(Q.where('session_id', sessionId))
        .fetch();

      // Calculate highest position - need to cast to any to access position property
      const positions = messages.map(m => (m as any).position || 0);
      const highestPosition = positions.length > 0 ? Math.max(...positions) : 0;

      // Extract author ID from User object
      const authorId = message.author.id;

      // Store additional author data in metadata
      const metadata = message.metadata || {};
      if (
        message.author.firstName ||
        message.author.lastName ||
        message.author.imageUrl
      ) {
        metadata.authorData = {
          firstName: message.author.firstName,
          lastName: message.author.lastName,
          imageUrl: message.author.imageUrl,
          role: message.author.role,
          // Add any other User properties you need
        };
      }

      // Store imageUris in metadata for text messages
      if (message.type === 'text' && (message as MessageType.Text).imageUris) {
        metadata.imageUris = (message as MessageType.Text).imageUris;
      }

      newMessage = await database.collections
        .get('messages')
        .create((record: any) => {
          record.sessionId = sessionId;
          record.author = authorId; // Store just the ID
          if (message.type === 'text') {
            record.text = message.text;
          }
          record.type = message.type;
          record.metadata = JSON.stringify(metadata);
          record.position = highestPosition + 1;
          record.createdAt = message.createdAt || Date.now();
        });
    });

    return newMessage as unknown as Message;
  }

  // Update a message
  async updateMessage(
    id: string,
    update: Partial<MessageType.Text>,
  ): Promise<boolean> {
    try {
      const message = await database.collections
        .get('messages')
        .find(id)
        .catch(() => null);

      if (!message) {
        console.warn(
          `Message with ID ${id} not found in database, cannot update`,
        );
        return false;
      }

      await database.write(async () => {
        await message.update((record: any) => {
          if (update.text !== undefined) {
            record.text = update.text;
          }
          if (update.metadata !== undefined) {
            // MERGE metadata instead of replacing to preserve existing fields (e.g., timings)
            const existingMetadata = JSON.parse(record.metadata || '{}');
            record.metadata = JSON.stringify({
              ...existingMetadata,
              ...update.metadata,
            });
          }
        });
      });

      return true;
    } catch (error) {
      console.error('Error updating message:', error);
      return false;
    }
  }

  // Update session completion settings
  async updateSessionCompletionSettings(
    sessionId: string,
    settings: CompletionParams,
  ): Promise<void> {
    const completionSettingsArray = await database.collections
      .get('completion_settings')
      .query(Q.where('session_id', sessionId))
      .fetch();

    if (completionSettingsArray.length === 0) {
      return;
    }

    const completionSettings = completionSettingsArray[0];

    await database.write(async () => {
      // Ensure settings have a version
      const migratedSettings = migrateCompletionSettings(settings);

      await completionSettings.update((record: any) => {
        record.settings = JSON.stringify(migratedSettings);
      });
    });
  }

  // Get global completion settings
  async getGlobalCompletionSettings(): Promise<CompletionParams> {
    const globalSettingsArray = await database.collections
      .get('global_settings')
      .query(Q.where('key', 'newChatCompletionSettings'))
      .fetch();

    if (globalSettingsArray.length === 0) {
      return defaultCompletionSettings;
    }

    const globalSettings = globalSettingsArray[0] as any;
    return JSON.parse(globalSettings.value);
  }

  // Save global completion settings
  async saveGlobalCompletionSettings(
    settings: CompletionParams,
  ): Promise<void> {
    await database.write(async () => {
      const existingSettingsArray = await database.collections
        .get('global_settings')
        .query(Q.where('key', 'newChatCompletionSettings'))
        .fetch();

      const migratedSettings = migrateCompletionSettings(settings);

      if (existingSettingsArray.length > 0) {
        const existingSettings = existingSettingsArray[0];
        await existingSettings.update((record: any) => {
          record.value = JSON.stringify(migratedSettings);
        });
      } else {
        await database.collections
          .get('global_settings')
          .create((record: any) => {
            record.key = 'newChatCompletionSettings';
            record.value = JSON.stringify(migratedSettings);
          });
      }
    });
  }

  // Update session title
  async updateSessionTitle(sessionId: string, newTitle: string): Promise<void> {
    const session = await database.collections
      .get('chat_sessions')
      .find(sessionId)
      .catch(() => null);

    if (!session) {
      return;
    }

    await database.write(async () => {
      await session.update((record: any) => {
        record.title = newTitle;
      });
    });
  }

  // Set active pal for a session
  async setSessionActivePal(sessionId: string, palId?: string): Promise<void> {
    const session = await database.collections
      .get('chat_sessions')
      .find(sessionId)
      .catch(() => null);

    if (!session) {
      return;
    }

    await database.write(async () => {
      await session.update((record: any) => {
        record.activePalId = palId || null;
      });
    });
  }

  // Delete a message by ID
  async deleteMessage(id: string): Promise<void> {
    const message = await database.collections
      .get('messages')
      .find(id)
      .catch(() => null);

    if (!message) {
      return;
    }

    await database.write(async () => {
      await message.destroyPermanently();
    });
  }

  // Reset migration flag for testing
  async resetMigration(): Promise<void> {
    try {
      const migrationFlagPath = `${RNFS.DocumentDirectoryPath}/db-migration-complete.flag`;
      if (await RNFS.exists(migrationFlagPath)) {
        await RNFS.unlink(migrationFlagPath);
        console.log('Migration flag reset successfully');
      } else {
        console.log('Migration flag does not exist');
      }

      // Clear the database for a clean migration test
      await database.write(async () => {
        // Get all collections
        const collections = [
          'chat_sessions',
          'messages',
          'completion_settings',
          'global_settings',
        ];

        // Delete all records in each collection
        for (const collectionName of collections) {
          const records = await database.collections
            .get(collectionName)
            .query()
            .fetch();

          for (const record of records) {
            await record.destroyPermanently();
          }
        }
      });

      console.log('Database cleared for migration test');
    } catch (error) {
      console.error('Failed to reset migration:', error);
    }
  }

  /**
   * Migrates settings for all sessions and global settings if needed
   * This should be called periodically to ensure all settings are up to date
   */
  async migrateAllSettings(): Promise<void> {
    try {
      console.log('Checking for settings that need migration...');

      // Get all completion settings
      const completionSettings = (await database.collections
        .get('completion_settings')
        .query()
        .fetch()) as CompletionSetting[];

      // Get all global settings
      const globalSettings = (await database.collections
        .get('global_settings')
        .query()
        .fetch()) as GlobalSetting[];

      // Check which settings need migration
      const settingsToMigrate = completionSettings.filter(setting => {
        try {
          const parsedSettings = JSON.parse(setting.settings);
          const migratedSettings = migrateCompletionSettings(parsedSettings);
          return migratedSettings.version !== parsedSettings.version;
        } catch (error) {
          console.error('Error checking if settings need migration:', error);
          return false;
        }
      });

      // Check which global settings need migration
      const globalSettingsToMigrate = globalSettings.filter(setting => {
        if (setting.key !== 'newChatCompletionSettings') {
          return false;
        }

        try {
          const parsedSettings = JSON.parse(setting.value);
          const migratedSettings = migrateCompletionSettings(parsedSettings);
          return migratedSettings.version !== parsedSettings.version;
        } catch (error) {
          console.error(
            'Error checking if global settings need migration:',
            error,
          );
          return false;
        }
      });

      console.log(
        `Found ${settingsToMigrate.length} session settings and ${globalSettingsToMigrate.length} global settings that need migration`,
      );

      // Migrate settings in a single transaction
      if (settingsToMigrate.length > 0 || globalSettingsToMigrate.length > 0) {
        await database.write(async () => {
          // Migrate completion settings
          for (const setting of settingsToMigrate) {
            const parsedSettings = JSON.parse(setting.settings);
            const migratedSettings = migrateCompletionSettings(parsedSettings);

            await setting.update((record: any) => {
              record.settings = JSON.stringify(migratedSettings);
            });

            console.log(
              `Migrated settings for session ${setting.sessionId} from version ${parsedSettings.version} to ${migratedSettings.version}`,
            );
          }

          // Migrate global settings
          for (const setting of globalSettingsToMigrate) {
            const parsedSettings = JSON.parse(setting.value);
            const migratedSettings = migrateCompletionSettings(parsedSettings);

            await setting.update((record: any) => {
              record.value = JSON.stringify(migratedSettings);
            });

            console.log(
              `Migrated global settings for key ${setting.key} from version ${parsedSettings.version} to ${migratedSettings.version}`,
            );
          }
        });

        console.log('Settings migration completed successfully');
      } else {
        console.log('No settings need migration');
      }
    } catch (error) {
      console.error('Error migrating settings:', error);
    }
  }
}

export const chatSessionRepository = new ChatSessionRepository();
