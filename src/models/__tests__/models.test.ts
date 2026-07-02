/**
 * Data Models Test Suite
 *
 * Tests the data models and utility functions.
 */

import {
  createChat,
  addMessageToChat,
  markChatDirty,
  markChatClean,
  deleteChat,
} from '../Chat';
import { Message } from '../Message';
import {
  createPal,
  markPalDirty,
  markPalClean,
  incrementPalUsage,
  Pal,
} from '../Pal';
import {
  DEFAULT_USER_SETTINGS,
  createDefaultUserSettings,
  updateUserSettings,
  markSettingsDirty,
  markSettingsClean,
  UserSettings,
} from '../UserSettings';

describe('Chat Model', () => {
  describe('createChat', () => {
    it('should create a new chat with default values', () => {
      const chat = createChat();

      expect(chat.id).toContain('chat_');
      expect(chat.title).toBe('New Chat');
      expect(chat.messages).toEqual([]);
      expect(chat.updatedAt).toBeDefined();
      expect(chat.isDeleted).toBe(false);
      expect(chat._dirty).toBe(true);
    });

    it('should create a chat with custom ID', () => {
      const chat = createChat('custom-id');
      expect(chat.id).toBe('custom-id');
    });

    it('should generate unique IDs', () => {
      const chat1 = createChat();
      const chat2 = createChat();

      expect(chat1.id).not.toBe(chat2.id);
    });
  });

  describe('addMessageToChat', () => {
    it('should add a message to chat', () => {
      const chat = createChat();
      const message: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello, AI!',
        timestamp: Date.now(),
      };

      const updatedChat = addMessageToChat(chat, message);

      expect(updatedChat.messages).toHaveLength(1);
      expect(updatedChat.messages[0].content).toBe('Hello, AI!');
      expect(updatedChat.updatedAt).toBeDefined();
      expect(updatedChat._dirty).toBe(true);
    });

    it('should not mutate original chat', () => {
      const chat = createChat();
      const message: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'Test',
        timestamp: Date.now(),
      };

      const updatedChat = addMessageToChat(chat, message);

      expect(chat.messages).toHaveLength(0);
      expect(updatedChat.messages).toHaveLength(1);
    });

    it('should append messages to existing array', () => {
      const chat = createChat();
      const message1: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'First',
        timestamp: Date.now(),
      };
      const message2: Message = {
        id: 'msg-2',
        role: 'assistant',
        content: 'Second',
        timestamp: Date.now(),
      };

      const chatWithMsg1 = addMessageToChat(chat, message1);
      const chatWithMsg2 = addMessageToChat(chatWithMsg1, message2);

      expect(chatWithMsg2.messages).toHaveLength(2);
      expect(chatWithMsg2.messages[0].content).toBe('First');
      expect(chatWithMsg2.messages[1].content).toBe('Second');
    });
  });

  describe('markChatDirty / markChatClean', () => {
    it('should mark chat as dirty', () => {
      const chat = createChat();
      chat._dirty = false;

      const marked = markChatDirty(chat);

      expect(marked._dirty).toBe(true);
    });

    it('should mark chat as clean', () => {
      const chat = createChat();
      expect(chat._dirty).toBe(true);

      const marked = markChatClean(chat);

      expect(marked._dirty).toBe(false);
    });

    it('should not mutate original chat', () => {
      const chat = createChat();

      const marked = markChatClean(chat);

      expect(chat._dirty).toBe(true);
      expect(marked._dirty).toBe(false);
    });
  });

  describe('deleteChat', () => {
    it('should soft delete a chat', () => {
      const chat = createChat();
      expect(chat.isDeleted).toBe(false);

      const deleted = deleteChat(chat);

      expect(deleted.isDeleted).toBe(true);
      expect(deleted.updatedAt).toBeDefined();
      expect(deleted._dirty).toBe(true);
    });

    it('should not mutate original chat', () => {
      const chat = createChat();

      const deleted = deleteChat(chat);

      expect(chat.isDeleted).toBe(false);
      expect(deleted.isDeleted).toBe(true);
    });
  });
});

describe('Pal Model', () => {
  describe('createPal', () => {
    it('should create a pal with default values', () => {
      const pal = createPal('Test Pal');

      expect(pal.id).toContain('pal_');
      expect(pal.name).toBe('Test Pal');
      expect(pal.avatar).toBe('🤖');
      expect(pal.systemPrompt).toContain('You are Test Pal');
      expect(pal.modelConfig.modelId).toBe('default');
      expect(pal.modelConfig.temperature).toBe(0.7);
      expect(pal.isDefault).toBe(false);
      expect(pal._dirty).toBe(true);
    });

    it('should create a pal with custom ID', () => {
      const pal = createPal('Test', 'Prompt', 'custom-id');
      expect(pal.id).toBe('custom-id');
    });

    it('should use provided system prompt', () => {
      const pal = createPal('Test', 'Custom prompt here');
      expect(pal.systemPrompt).toBe('Custom prompt here');
    });
  });

  describe('update Pal (using spread)', () => {
    it('should update pal properties using spread', () => {
      const pal = createPal('Test Pal');
      const updated = {
        ...pal,
        name: 'Updated Pal',
        modelConfig: {
          ...pal.modelConfig,
          temperature: 0.9,
        },
        updatedAt: Date.now(),
        _dirty: true,
      };

      expect(updated.name).toBe('Updated Pal');
      expect(updated.modelConfig.temperature).toBe(0.9);
      expect(updated.updatedAt).toBeDefined();
      expect(updated._dirty).toBe(true);
    });

    it('should not mutate original pal', () => {
      const pal = createPal('Test Pal');
      const updated = {
        ...pal,
        name: 'Updated',
      };

      expect(pal.name).toBe('Test Pal');
      expect(updated.name).toBe('Updated');
    });
  });

  describe('markPalDirty / markPalClean', () => {
    it('should mark pal as dirty', () => {
      const pal = createPal('Test');
      pal._dirty = false;

      const marked = markPalDirty(pal);

      expect(marked._dirty).toBe(true);
    });

    it('should mark pal as clean', () => {
      const pal = createPal('Test');

      const marked = markPalClean(pal);

      expect(marked._dirty).toBe(false);
    });
  });

  describe('incrementPalUsage', () => {
    it('should increment usage count', () => {
      const pal = createPal('Test');
      pal.usageCount = 5;

      const updated = incrementPalUsage(pal);

      expect(updated.usageCount).toBe(6);
      expect(updated.updatedAt).toBeDefined();
      expect(updated._dirty).toBe(true);
    });

    it('should start from 0 if usageCount is undefined', () => {
      const pal = createPal('Test');

      const updated = incrementPalUsage(pal);

      expect(updated.usageCount).toBe(1);
    });
  });
});

describe('UserSettings Model', () => {
  describe('DEFAULT_USER_SETTINGS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_USER_SETTINGS.theme).toBe('system');
      expect(DEFAULT_USER_SETTINGS.language).toBe('en');
      expect(DEFAULT_USER_SETTINGS.displayMemUsage).toBe(false);
      expect(DEFAULT_USER_SETTINGS.autoNavigateToChat).toBe(true);
    });
  });

  describe('createDefaultUserSettings', () => {
    it('should create settings with default values', () => {
      const settings = createDefaultUserSettings();

      expect(settings.theme).toBe('system');
      expect(settings.language).toBe('en');
      expect(settings.displayMemUsage).toBe(false);
      expect(settings._dirty).toBe(true);
    });

    it('should create settings with default values (no partial params)', () => {
      const settings = createDefaultUserSettings();

      expect(settings.theme).toBe('system');
      expect(settings.language).toBe('en');
    });
  });

  describe('updateUserSettings', () => {
    it('should update settings properties', () => {
      const settings = createDefaultUserSettings();
      const updates: Partial<UserSettings> = {
        theme: 'dark',
        language: 'zh',
      };

      const updated = updateUserSettings(settings, updates);

      expect(updated.theme).toBe('dark');
      expect(updated.language).toBe('zh');
      expect(updated.updatedAt).toBeDefined();
      expect(updated._dirty).toBe(true);
    });

    it('should not mutate original settings', () => {
      const settings = createDefaultUserSettings();
      const updates: Partial<UserSettings> = { theme: 'dark' };

      const updated = updateUserSettings(settings, updates);

      expect(settings.theme).toBe('system');
      expect(updated.theme).toBe('dark');
    });
  });

  describe('markSettingsDirty / markSettingsClean', () => {
    it('should mark settings as dirty', () => {
      const settings = createDefaultUserSettings();
      const marked = markSettingsDirty(settings);

      expect(marked._dirty).toBe(true);
    });

    it('should mark settings as clean', () => {
      const settings = createDefaultUserSettings();
      const marked = markSettingsClean(settings);

      expect(marked._dirty).toBe(false);
    });
  });
});
