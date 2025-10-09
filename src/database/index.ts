import {Database} from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import schema from './schema';
import migrations from './migrations';
import {
  ChatSession,
  Message,
  CompletionSetting,
  GlobalSetting,
  CachedPal,
  UserLibrary,
  SyncStatus,
  LocalPal,
} from './models';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  dbName: 'pocketpalai',
  jsi: true, // enable JSI for better performance if available
  onSetUpError: error => {
    console.error('Database setup error:', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [
    ChatSession,
    Message,
    CompletionSetting,
    GlobalSetting,
    CachedPal,
    UserLibrary,
    SyncStatus,
    LocalPal,
  ],
});

export {
  ChatSession,
  Message,
  CompletionSetting,
  GlobalSetting,
  CachedPal,
  UserLibrary,
  SyncStatus,
  LocalPal,
};
