import {Q} from '@nozbe/watermelondb';
import {database, ChatFolder, ChatSession} from '../database';

export const FOLDER_NAME_LIMIT = 60;

export function normalizeFolderName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > FOLDER_NAME_LIMIT) {
    throw new Error('invalidFolderName');
  }
  return trimmed;
}

const nameKey = (name: string) => name.normalize('NFKC').toLowerCase();

class ChatFolderRepository {
  private get folders() {
    return database.get<ChatFolder>('chat_folders');
  }

  async getAll(): Promise<ChatFolder[]> {
    return this.folders.query(Q.sortBy('name', Q.asc)).fetch();
  }

  // Called inside a writer so duplicate checks cannot race other writers.
  private async uniqueName(name: string, exceptId?: string) {
    const normalized = normalizeFolderName(name);
    const folders = await this.getAll();
    if (
      folders.some(
        f => f.id !== exceptId && nameKey(f.name) === nameKey(normalized),
      )
    ) {
      throw new Error('duplicateFolderName');
    }
    return normalized;
  }

  async create(name: string, sessionIds: string[] = []): Promise<ChatFolder> {
    return database.write(async () => {
      const normalized = await this.uniqueName(name);
      const sessions = await Promise.all(
        [...new Set(sessionIds)].map(id =>
          database.get<ChatSession>('chat_sessions').find(id),
        ),
      );
      const folder = this.folders.prepareCreate(record => {
        record.name = normalized;
      });
      // One batch is a SQLite transaction: creating and moving succeed together.
      await database.batch(
        folder,
        ...sessions.map(session =>
          session.prepareUpdate(record => {
            record.folderId = folder.id;
          }),
        ),
      );
      return folder;
    });
  }

  async rename(id: string, name: string): Promise<void> {
    await database.write(async () => {
      const normalized = await this.uniqueName(name, id);
      const folder = await this.folders.find(id);
      await folder.update(record => {
        record.name = normalized;
      });
    });
  }

  async moveSessions(ids: string[], folderId: string | null): Promise<void> {
    await database.write(async () => {
      if (folderId !== null) {
        await this.folders.find(folderId);
      }
      const sessions = await Promise.all(
        [...new Set(ids)].map(id =>
          database.get<ChatSession>('chat_sessions').find(id),
        ),
      );
      await database.batch(
        ...sessions.map(session =>
          session.prepareUpdate(record => {
            record.folderId = folderId;
          }),
        ),
      );
    });
  }

  async remove(id: string): Promise<void> {
    await database.write(async () => {
      const folder = await this.folders.find(id);
      const sessions = await database
        .get<ChatSession>('chat_sessions')
        .query(Q.where('folder_id', id))
        .fetch();
      // Never delete chats or messages when removing a folder.
      await database.batch(
        ...sessions.map(session =>
          session.prepareUpdate(record => {
            record.folderId = null;
          }),
        ),
        folder.prepareDestroyPermanently(),
      );
    });
  }

  async exportFolder(id?: string | null): Promise<{name: string} | undefined> {
    if (!id) {
      return undefined;
    }
    const folder = (await this.getAll()).find(f => f.id === id);
    return folder ? {name: folder.name} : undefined;
  }

  // Imported identifiers belong to another database. Reuse a matching local
  // name or create a fresh identifier, without trusting an imported folder ID.
  async resolveImportedFolder(name: string): Promise<string> {
    return database.write(async () => {
      const normalized = normalizeFolderName(name);
      const existing = (await this.getAll()).find(
        f => nameKey(f.name) === nameKey(normalized),
      );
      if (existing) {
        return existing.id;
      }
      const folder = await this.folders.create(record => {
        record.name = normalized;
      });
      return folder.id;
    });
  }
}

export const chatFolderRepository = new ChatFolderRepository();
