/**
 * LocalStorageService Test Suite
 *
 * Tests the local storage service implementation.
 */

import { getLocalStorageService } from '../LocalStorageService';
import { createChat, addMessageToChat, deleteChat } from '../../../models/Chat';
import { createPal } from '../../../models/Pal';
import { DEFAULT_USER_SETTINGS, UserSettings } from '../../../models/UserSettings';

// In-memory storage for AsyncStorage mock
const mockStorage = new Map<string, string>();

// Mock AsyncStorage with working in-memory implementation
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStorage.get(key) || null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStorage.set(key, value);
    return Promise.resolve();
  }),
  removeItem: jest.fn((key: string) => {
    mockStorage.delete(key);
    return Promise.resolve();
  }),
  multiRemove: jest.fn((keys: string[]) => {
    keys.forEach(key => mockStorage.delete(key));
    return Promise.resolve();
  }),
  clear: jest.fn(() => {
    mockStorage.clear();
    return Promise.resolve();
  }),
}));

describe('LocalStorageService', () => {
  let storageService: ReturnType<typeof getLocalStorageService>;

  beforeEach(() => {
    // Reset singleton
    (getLocalStorageService as any).localStorageInstance = null;
    storageService = getLocalStorageService();
    
    // Clear mock storage
    mockStorage.clear();
    jest.clearAllMocks();
  });

  describe('Chat Operations', () => {
    it('should save and retrieve a chat', async () => {
      const chat = createChat('test-chat-1');
      chat.title = 'Test Chat';

      await storageService.saveChat(chat);

      const retrieved = await storageService.getChatById('test-chat-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('test-chat-1');
      expect(retrieved?.title).toBe('Test Chat');
    });

    it('should update existing chat', async () => {
      const chat = createChat('test-chat-1');
      await storageService.saveChat(chat);

      const updatedChat = addMessageToChat(chat, {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      });
      await storageService.saveChat(updatedChat);

      const retrieved = await storageService.getChatById('test-chat-1');
      expect(retrieved?.messages).toHaveLength(1);
      expect(retrieved?.messages[0].content).toBe('Hello');
    });

    it('should get all chats', async () => {
      const chat1 = createChat('chat-1');
      const chat2 = createChat('chat-2');

      await storageService.saveChat(chat1);
      await storageService.saveChat(chat2);

      const allChats = await storageService.getAllChats();
      expect(allChats).toHaveLength(2);
    });

    it('should return null for non-existent chat', async () => {
      const result = await storageService.getChatById('non-existent');
      expect(result).toBeNull();
    });

    it('should soft delete a chat', async () => {
      const chat = createChat('test-chat');
      await storageService.saveChat(chat);

      await storageService.deleteChat('test-chat');

      const retrieved = await storageService.getChatById('test-chat');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.isDeleted).toBe(true);
      expect(retrieved?._dirty).toBe(true);
    });

    it('should get dirty chats', async () => {
      const chat1 = createChat('chat-1');
      chat1._dirty = true;
      await storageService.saveChat(chat1);

      const chat2 = createChat('chat-2');
      chat2._dirty = false;
      await storageService.saveChat(chat2);

      const dirtyChats = await storageService.getDirtyChats();
      expect(dirtyChats).toHaveLength(1);
      expect(dirtyChats[0].id).toBe('chat-1');
    });

    it('should not include deleted chats in dirty chats', async () => {
      const chat = createChat('chat-1');
      chat.isDeleted = true;
      chat._dirty = true;
      await storageService.saveChat(chat);

      const dirtyChats = await storageService.getDirtyChats();
      expect(dirtyChats).toHaveLength(0);
    });
  });

  describe('Pal Operations', () => {
    it('should save and retrieve a pal', async () => {
      const pal = createPal('Test Pal');
      pal.id = 'test-pal-1';

      await storageService.savePal(pal);

      const retrieved = await storageService.getPalById('test-pal-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('test-pal-1');
      expect(retrieved?.name).toBe('Test Pal');
    });

    it('should get all pals', async () => {
      const pal1 = createPal('Pal 1');
      pal1.id = 'pal-1';
      const pal2 = createPal('Pal 2');
      pal2.id = 'pal-2';

      await storageService.savePal(pal1);
      await storageService.savePal(pal2);

      const allPals = await storageService.getAllPals();
      expect(allPals).toHaveLength(2);
    });

    it('should delete a pal permanently', async () => {
      const pal = createPal('Test Pal');
      pal.id = 'test-pal';
      await storageService.savePal(pal);

      await storageService.deletePal('test-pal');

      const retrieved = await storageService.getPalById('test-pal');
      expect(retrieved).toBeNull();
    });

    it('should get dirty pals', async () => {
      const pal1 = createPal('Pal 1');
      pal1.id = 'pal-1';
      pal1._dirty = true;
      await storageService.savePal(pal1);

      const pal2 = createPal('Pal 2');
      pal2.id = 'pal-2';
      pal2._dirty = false;
      await storageService.savePal(pal2);

      const dirtyPals = await storageService.getDirtyPals();
      expect(dirtyPals).toHaveLength(1);
      expect(dirtyPals[0].id).toBe('pal-1');
    });
  });

  describe('Settings Operations', () => {
    it('should save and retrieve settings', async () => {
      const settings: UserSettings = {
        ...DEFAULT_USER_SETTINGS,
        theme: 'dark',
        language: 'zh',
      };

      await storageService.saveSettings(settings);

      const retrieved = await storageService.getSettings();
      expect(retrieved.theme).toBe('dark');
      expect(retrieved.language).toBe('zh');
    });

    it('should return default settings if not saved', async () => {
      const settings = await storageService.getSettings();
      expect(settings.theme).toBe('system');
      expect(settings.language).toBe('en');
    });

    it('should check if settings are dirty', async () => {
      const settings: UserSettings = {
        ...DEFAULT_USER_SETTINGS,
        _dirty: true,
      };

      await storageService.saveSettings(settings);

      const isDirty = await storageService.areSettingsDirty();
      expect(isDirty).toBe(true);
    });

    it('should return false for clean settings', async () => {
      const settings: UserSettings = {
        ...DEFAULT_USER_SETTINGS,
        _dirty: false,
      };

      await storageService.saveSettings(settings);

      const isDirty = await storageService.areSettingsDirty();
      expect(isDirty).toBe(false);
    });
  });

  describe('Utility Operations', () => {
    it('should clear all data', async () => {
      // Save some data
      await storageService.saveChat(createChat('test'));
      await storageService.saveSettings(DEFAULT_USER_SETTINGS);

      // Clear all
      await storageService.clearAll();

      // Verify cleared
      const chats = await storageService.getAllChats();
      expect(chats).toHaveLength(0);
    });

    it('should get storage info', async () => {
      await storageService.saveChat(createChat('chat-1'));
      await storageService.savePal(createPal('Test'));
      await storageService.saveSettings(DEFAULT_USER_SETTINGS);

      const info = await storageService.getStorageInfo();
      expect(info.chats).toBe(1);
      expect(info.pals).toBe(1);
      expect(info.hasSettings).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle AsyncStorage errors gracefully for getAllChats', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      AsyncStorage.getItem.mockRejectedValueOnce(new Error('Storage error'));

      const result = await storageService.getAllChats();
      expect(result).toEqual([]);
    });

    it('should handle AsyncStorage errors gracefully for getSettings', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      AsyncStorage.getItem.mockRejectedValueOnce(new Error('Storage error'));

      const result = await storageService.getSettings();
      expect(result.theme).toBe('system');
      expect(result.language).toBe('en');
    });

    it('should throw error for saveChat on storage failure', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      AsyncStorage.setItem.mockRejectedValueOnce(new Error('Storage error'));

      await expect(storageService.saveChat(createChat('test'))).rejects.toThrow();
    });
  });
});
