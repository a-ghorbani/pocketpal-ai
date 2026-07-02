/**
 * LocalStorageService
 *
 * Wrapper around AsyncStorage for typed CRUD operations.
 * Used for local persistence of Chat, Pal, and UserSettings data.
 *
 * @phase Phase1 - Local Storage Service
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { Chat } from '../../models/Chat';
import { Pal } from '../../models/Pal';
import { UserSettings, DEFAULT_USER_SETTINGS } from '../../models/UserSettings';

const STORAGE_KEYS = {
  CHATS: '@pocketpal_chats',
  PALS: '@pocketpal_pals',
  SETTINGS: '@pocketpal_settings',
};

/**
 * LocalStorageService - Typed AsyncStorage wrapper
 *
 * Features:
 * - Typed CRUD operations for Chat, Pal, UserSettings
 * - Batch operations
 * - Error handling
 */
class LocalStorageService {
  // ========== Chat Operations ==========

  /**
   * Save a chat to local storage
   * @param chat - Chat to save
   */
  async saveChat(chat: Chat): Promise<void> {
    try {
      const chats = await this.getAllChats();
      const index = chats.findIndex((c) => c.id === chat.id);

      if (index >= 0) {
        chats[index] = chat;
      } else {
        chats.push(chat);
      }

      await AsyncStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(chats));
    } catch (error) {
      console.error('[LocalStorage] Failed to save chat:', error);
      throw error;
    }
  }

  /**
   * Get all chats from local storage
   * @returns Promise<Chat[]> - Array of chats
   */
  async getAllChats(): Promise<Chat[]> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.CHATS);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('[LocalStorage] Failed to get chats:', error);
      return [];
    }
  }

  /**
   * Get a chat by ID
   * @param id - Chat ID
   * @returns Promise<Chat | null> - Chat or null
   */
  async getChatById(id: string): Promise<Chat | null> {
    try {
      const chats = await this.getAllChats();
      return chats.find((c) => c.id === id) || null;
    } catch (error) {
      console.error('[LocalStorage] Failed to get chat by ID:', error);
      return null;
    }
  }

  /**
   * Delete a chat (soft delete)
   * @param id - Chat ID
   */
  async deleteChat(id: string): Promise<void> {
    try {
      const chats = await this.getAllChats();
      const updated = chats.map((c) =>
        c.id === id ? { ...c, isDeleted: true, updatedAt: Date.now(), _dirty: true } : c
      );
      await AsyncStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(updated));
    } catch (error) {
      console.error('[LocalStorage] Failed to delete chat:', error);
      throw error;
    }
  }

  /**
   * Get all dirty chats (need sync)
   * @returns Promise<Chat[]> - Array of dirty chats
   */
  async getDirtyChats(): Promise<Chat[]> {
    try {
      const chats = await this.getAllChats();
      return chats.filter((c) => c._dirty && !c.isDeleted);
    } catch (error) {
      console.error('[LocalStorage] Failed to get dirty chats:', error);
      return [];
    }
  }

  // ========== Pal Operations ==========

  /**
   * Save a pal to local storage
   * @param pal - Pal to save
   */
  async savePal(pal: Pal): Promise<void> {
    try {
      const pals = await this.getAllPals();
      const index = pals.findIndex((p) => p.id === pal.id);

      if (index >= 0) {
        pals[index] = pal;
      } else {
        pals.push(pal);
      }

      await AsyncStorage.setItem(STORAGE_KEYS.PALS, JSON.stringify(pals));
    } catch (error) {
      console.error('[LocalStorage] Failed to save pal:', error);
      throw error;
    }
  }

  /**
   * Get all pals from local storage
   * @returns Promise<Pal[]> - Array of pals
   */
  async getAllPals(): Promise<Pal[]> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.PALS);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('[LocalStorage] Failed to get pals:', error);
      return [];
    }
  }

  /**
   * Get a pal by ID
   * @param id - Pal ID
   * @returns Promise<Pal | null> - Pal or null
   */
  async getPalById(id: string): Promise<Pal | null> {
    try {
      const pals = await this.getAllPals();
      return pals.find((p) => p.id === id) || null;
    } catch (error) {
      console.error('[LocalStorage] Failed to get pal by ID:', error);
      return null;
    }
  }

  /**
   * Delete a pal
   * @param id - Pal ID
   */
  async deletePal(id: string): Promise<void> {
    try {
      const pals = await this.getAllPals();
      const updated = pals.filter((p) => p.id !== id);
      await AsyncStorage.setItem(STORAGE_KEYS.PALS, JSON.stringify(updated));
    } catch (error) {
      console.error('[LocalStorage] Failed to delete pal:', error);
      throw error;
    }
  }

  /**
   * Get all dirty pals (need sync)
   * @returns Promise<Pal[]> - Array of dirty pals
   */
  async getDirtyPals(): Promise<Pal[]> {
    try {
      const pals = await this.getAllPals();
      return pals.filter((p) => p._dirty);
    } catch (error) {
      console.error('[LocalStorage] Failed to get dirty pals:', error);
      return [];
    }
  }

  // ========== Settings Operations ==========

  /**
   * Save user settings to local storage
   * @param settings - Settings to save
   */
  async saveSettings(settings: UserSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (error) {
      console.error('[LocalStorage] Failed to save settings:', error);
      throw error;
    }
  }

  /**
   * Get user settings from local storage
   * @returns Promise<UserSettings> - User settings
   */
  async getSettings(): Promise<UserSettings> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
      return stored ? JSON.parse(stored) : DEFAULT_USER_SETTINGS;
    } catch (error) {
      console.error('[LocalStorage] Failed to get settings:', error);
      return DEFAULT_USER_SETTINGS;
    }
  }

  /**
   * Check if settings are dirty (need sync)
   * @returns Promise<boolean> - True if dirty
   */
  async areSettingsDirty(): Promise<boolean> {
    try {
      const settings = await this.getSettings();
      return settings._dirty || false;
    } catch (error) {
      console.error('[LocalStorage] Failed to check settings dirty:', error);
      return false;
    }
  }

  // ========== Utility Operations ==========

  /**
   * Clear all local data
   */
  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
      console.log('[LocalStorage] All data cleared');
    } catch (error) {
      console.error('[LocalStorage] Failed to clear all data:', error);
      throw error;
    }
  }

  /**
   * Get storage usage info
   * @returns Promise<{ chats: number; pals: number; hasSettings: boolean }>
   */
  async getStorageInfo(): Promise<{
    chats: number;
    pals: number;
    hasSettings: boolean;
  }> {
    try {
      const chats = await this.getAllChats();
      const pals = await this.getAllPals();
      const settings = await this.getSettings();

      return {
        chats: chats.length,
        pals: pals.length,
        hasSettings: !!settings,
      };
    } catch (error) {
      console.error('[LocalStorage] Failed to get storage info:', error);
      return { chats: 0, pals: 0, hasSettings: false };
    }
  }
}

// Singleton instance
let localStorageInstance: LocalStorageService | null = null;

/**
 * Get the singleton LocalStorageService instance
 */
export function getLocalStorageService(): LocalStorageService {
  if (!localStorageInstance) {
    localStorageInstance = new LocalStorageService();
  }
  return localStorageInstance;
}

export default LocalStorageService;
export { STORAGE_KEYS };
