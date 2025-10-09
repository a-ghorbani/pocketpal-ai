jest.unmock('../ChatSessionStore'); // this is not really needed, as only importing from store is mocked.
import {LlamaContext} from '@pocketpalai/llama.rn';

import {chatSessionStore, defaultCompletionSettings} from '../ChatSessionStore';
import {chatSessionRepository} from '../../repositories/ChatSessionRepository';

import {MessageType} from '../../utils/types';
import {mockContextModel} from '../../../jest/fixtures/models';
import {waitFor} from '@testing-library/react-native';

// Use the mock from __mocks__/repositories/ChatSessionRepository.js
//jest.mock('../../repositories/ChatSessionRepository');

// Make the repository methods mockable
jest.spyOn(chatSessionRepository, 'getAllSessions');
jest.spyOn(chatSessionRepository, 'getSessionById');
jest.spyOn(chatSessionRepository, 'createSession');
jest.spyOn(chatSessionRepository, 'deleteSession');
jest.spyOn(chatSessionRepository, 'addMessageToSession');
jest.spyOn(chatSessionRepository, 'updateMessage');
jest.spyOn(chatSessionRepository, 'updateSessionTitle');
jest.spyOn(chatSessionRepository, 'updateSessionCompletionSettings');
jest.spyOn(chatSessionRepository, 'getGlobalCompletionSettings');
jest.spyOn(chatSessionRepository, 'saveGlobalCompletionSettings');
jest.spyOn(chatSessionRepository, 'setSessionActivePal');

describe('chatSessionStore', () => {
  const mockMessage = {
    id: 'message1',
    text: 'Hello, world!',
    type: 'text',
    author: {id: 'user1', name: 'User'},
    createdAt: Date.now(),
  } as MessageType.Text;

  beforeEach(() => {
    jest.clearAllMocks();
    chatSessionStore.sessions = [];
    chatSessionStore.activeSessionId = null;
  });

  describe('loadSessionList', () => {
    it('loads session list from database successfully', async () => {
      const mockSession = {
        id: '1',
        title: 'Session 1',
        date: new Date().toISOString(),
      };

      const mockMessages = [
        {
          toMessageObject: () => ({
            id: 'msg1',
            text: 'Hello',
            type: 'text',
            author: {id: 'user1'},
            createdAt: Date.now(),
          }),
        },
      ];

      const mockCompletionSettings = {
        getSettings: () => ({
          ...defaultCompletionSettings,
          temperature: 0.7,
        }),
      };

      const mockSessionData = {
        messages: mockMessages,
        completionSettings: mockCompletionSettings,
      };

      (chatSessionRepository.getAllSessions as jest.Mock).mockResolvedValue([
        mockSession,
      ]);
      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValue(
        mockSessionData,
      );

      await chatSessionStore.loadSessionList();

      expect(chatSessionStore.sessions.length).toBe(1);
      expect(chatSessionStore.sessions[0].title).toBe('Session 1');
      expect(chatSessionRepository.getAllSessions).toHaveBeenCalled();
      expect(chatSessionRepository.getSessionById).toHaveBeenCalledWith('1');
    });

    it('handles database error gracefully', async () => {
      (chatSessionRepository.getAllSessions as jest.Mock).mockRejectedValue(
        new Error('Database error'),
      );

      await chatSessionStore.loadSessionList();

      expect(chatSessionStore.sessions).toEqual([]);
      expect(chatSessionRepository.getAllSessions).toHaveBeenCalled();
    });
  });

  describe('deleteSession', () => {
    it('deletes the session from database and updates store', async () => {
      const mockSessionId = 'session1';
      chatSessionStore.sessions = [
        {
          id: mockSessionId,
          title: 'Session 1',
          date: new Date().toISOString(),
          messages: [],
          completionSettings: defaultCompletionSettings,
          settingsSource: 'pal',
        },
      ];
      (chatSessionRepository.deleteSession as jest.Mock).mockResolvedValue(
        undefined,
      );

      await chatSessionStore.deleteSession(mockSessionId);

      expect(chatSessionRepository.deleteSession).toHaveBeenCalledWith(
        mockSessionId,
      );
      expect(chatSessionStore.sessions.length).toBe(0);
    });

    it('handles database error during session deletion', async () => {
      const mockSessionId = 'session1';
      chatSessionStore.sessions = [
        {
          id: mockSessionId,
          title: 'Session 1',
          date: new Date().toISOString(),
          messages: [],
          completionSettings: defaultCompletionSettings,
          settingsSource: 'pal',
        },
      ];
      (chatSessionRepository.deleteSession as jest.Mock).mockRejectedValue(
        new Error('Database error'),
      );

      await chatSessionStore.deleteSession(mockSessionId);

      expect(chatSessionRepository.deleteSession).toHaveBeenCalledWith(
        mockSessionId,
      );
      // Session should still be in the store if deletion failed
      expect(chatSessionStore.sessions.length).toBe(1);
    });
  });

  describe('addMessageToCurrentSession', () => {
    it('creates a new session if no active session', async () => {
      const mockNewSession = {
        id: 'new-session',
        title: 'New Session',
        date: new Date().toISOString(),
      };

      const mockSessionData = {
        messages: [
          {
            toMessageObject: () => mockMessage,
          },
        ],
        completionSettings: {
          getSettings: () => defaultCompletionSettings,
        },
      };

      (chatSessionRepository.createSession as jest.Mock).mockResolvedValue(
        mockNewSession,
      );
      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValue(
        mockSessionData,
      );

      await chatSessionStore.addMessageToCurrentSession(mockMessage);

      expect(chatSessionRepository.createSession).toHaveBeenCalled();
      expect(chatSessionRepository.getSessionById).toHaveBeenCalledWith(
        mockNewSession.id,
      );
      expect(chatSessionStore.sessions.length).toBe(1);
      expect(chatSessionStore.activeSessionId).toBe(mockNewSession.id);
    });

    it('adds a message to the active session', async () => {
      const mockSession = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
      };
      chatSessionStore.sessions = [mockSession];
      chatSessionStore.activeSessionId = mockSession.id;

      await chatSessionStore.addMessageToCurrentSession(mockMessage);

      expect(chatSessionRepository.addMessageToSession).toHaveBeenCalledWith(
        mockSession.id,
        mockMessage,
      );
      expect(chatSessionStore.sessions[0].messages.length).toBe(1);
      expect(chatSessionStore.sessions[0].messages[0]).toEqual(mockMessage);
    });
  });

  describe('updateMessage', () => {
    it('updates a message in the active session', async () => {
      const mockSession = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [mockMessage],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
      };
      chatSessionStore.sessions = [mockSession];
      chatSessionStore.activeSessionId = mockSession.id;

      (chatSessionRepository.updateMessage as jest.Mock).mockResolvedValue(
        undefined,
      );

      const updatedMessage = {text: 'Updated message text'};
      await chatSessionStore.updateMessage(
        mockMessage.id,
        mockSession.id,
        updatedMessage,
      );

      expect(chatSessionRepository.updateMessage).toHaveBeenCalledWith(
        mockMessage.id,
        updatedMessage,
      );
      expect(
        (chatSessionStore.sessions[0].messages[0] as MessageType.Text).text,
      ).toBe(updatedMessage.text);
    });
  });

  describe('updateSessionTitle', () => {
    it('updates the session title based on the latest message', async () => {
      const mockSession = {
        id: 'session1',
        title: 'New Session',
        date: new Date().toISOString(),
        messages: [mockMessage],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
      };

      (chatSessionRepository.updateSessionTitle as jest.Mock).mockResolvedValue(
        undefined,
      );

      await chatSessionStore.updateSessionTitle(mockSession);

      expect(chatSessionRepository.updateSessionTitle).toHaveBeenCalledWith(
        mockSession.id,
        'Hello, world!',
      );
      expect(mockSession.title).toBe('Hello, world!');
    });

    it('limits the session title to 40 characters', async () => {
      const longMessage = 'a'.repeat(100);
      const mockSession = {
        id: 'session1',
        title: 'New Session',
        date: new Date().toISOString(),
        messages: [{...mockMessage, text: longMessage}],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
      };

      (chatSessionRepository.updateSessionTitle as jest.Mock).mockResolvedValue(
        undefined,
      );

      await chatSessionStore.updateSessionTitle(mockSession);

      const expectedTitle = longMessage.substring(0, 40) + '...';
      expect(chatSessionRepository.updateSessionTitle).toHaveBeenCalledWith(
        mockSession.id,
        expectedTitle,
      );
      expect(mockSession.title.length).toBe(43); // 40 chars + '...'
      expect(mockSession.title.endsWith('...')).toBe(true);
    });
  });

  describe('createNewSession', () => {
    it('creates a new session and sets it as active', async () => {
      const mockNewSession = {
        id: 'new-session',
        title: 'My New Session',
        date: new Date().toISOString(),
      };

      const mockSessionData = {
        messages: [
          {
            toMessageObject: () => mockMessage,
          },
        ],
        completionSettings: {
          getSettings: () => defaultCompletionSettings,
        },
      };

      (chatSessionRepository.createSession as jest.Mock).mockResolvedValue(
        mockNewSession,
      );
      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValue(
        mockSessionData,
      );

      await chatSessionStore.createNewSession('My New Session', [mockMessage]);

      expect(chatSessionRepository.createSession).toHaveBeenCalledWith(
        'My New Session',
        [mockMessage],
        defaultCompletionSettings,
        undefined,
      );
      expect(chatSessionRepository.getSessionById).toHaveBeenCalledWith(
        mockNewSession.id,
      );
      expect(chatSessionStore.sessions.length).toBe(1);
      expect(chatSessionStore.activeSessionId).toBe(mockNewSession.id);
    });

    it('inherits settings from active session when creating a new session', async () => {
      // Create and set active session with custom settings
      const originalSession = {
        id: 'session1',
        title: 'Original Session',
        date: new Date().toISOString(),
        messages: [],
        completionSettings: {
          ...defaultCompletionSettings,
          temperature: 0.9,
        },
        settingsSource: 'pal' as 'pal' | 'custom',
      };
      chatSessionStore.sessions = [originalSession];
      chatSessionStore.activeSessionId = originalSession.id;

      // When active session exists and user creates a new session
      chatSessionStore.resetActiveSession();
      // This simulates that settings from active session are copied to newChatCompletionSettings
      chatSessionStore.newChatCompletionSettings =
        originalSession.completionSettings;

      // Mock for addMessageToCurrentSession
      const mockNewSession = {
        id: 'new-session',
        title: 'New Session',
        date: new Date().toISOString(),
      };

      const mockSessionData = {
        messages: [
          {
            toMessageObject: () => mockMessage,
          },
        ],
        completionSettings: {
          getSettings: () => originalSession.completionSettings,
        },
      };

      (chatSessionRepository.createSession as jest.Mock).mockResolvedValue(
        mockNewSession,
      );
      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValue(
        mockSessionData,
      );

      await chatSessionStore.addMessageToCurrentSession(mockMessage);

      // The new session should have the same settings
      expect(chatSessionRepository.createSession).toHaveBeenCalledWith(
        expect.any(String),
        [mockMessage],
        originalSession.completionSettings,
        undefined,
      );
      expect(chatSessionStore.sessions.length).toBe(2);
      expect(chatSessionStore.sessions[1].completionSettings.temperature).toBe(
        0.9,
      );
    });
  });

  describe('resetActiveSession', () => {
    it('resets the active session to null', () => {
      chatSessionStore.activeSessionId = 'session1';
      chatSessionStore.resetActiveSession();

      expect(chatSessionStore.activeSessionId).toBeNull();
    });
  });

  // saveSessionsMetadata tests removed as this method is no longer needed with database storage

  describe('setActiveSession', () => {
    it('sets the active session id', () => {
      const sessionId = 'session1';
      chatSessionStore.setActiveSession(sessionId);
      expect(chatSessionStore.activeSessionId).toBe(sessionId);
    });
  });

  describe('currentSessionMessages', () => {
    it('returns messages for active session', () => {
      const session = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [mockMessage],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
      };
      chatSessionStore.sessions = [session];
      chatSessionStore.activeSessionId = session.id;

      expect(chatSessionStore.currentSessionMessages).toEqual([mockMessage]);
    });

    it('returns empty array when no active session', () => {
      expect(chatSessionStore.currentSessionMessages).toEqual([]);
    });
  });

  describe('updateMessageToken', () => {
    it('updates existing message with new token', async () => {
      const session = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [mockMessage],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
      };
      chatSessionStore.sessions = [session];
      chatSessionStore.activeSessionId = session.id;

      const mockContext = new LlamaContext({
        contextId: 1,
        gpu: false,
        reasonNoGPU: 'Test environment',
        model: mockContextModel,
      });

      (chatSessionRepository.updateMessage as jest.Mock).mockResolvedValue(
        true,
      );

      await chatSessionStore.updateMessageToken(
        {token: ' world'},
        Date.now(),
        mockMessage.id,
        session.id,
        mockContext,
      );

      expect(chatSessionRepository.updateMessage).toHaveBeenCalled();
      expect(
        (chatSessionStore.currentSessionMessages[0] as MessageType.Text).text,
      ).toBe('Hello, world! world');
    });

    it('creates new message if id not found', async () => {
      const session = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
      };
      chatSessionStore.sessions = [session];
      chatSessionStore.activeSessionId = session.id;

      const mockContext = new LlamaContext({
        contextId: 1,
        gpu: false,
        reasonNoGPU: 'Test environment',
        model: mockContextModel,
      });
      const newMessageId = 'new-message';
      const createdAt = Date.now();

      // Mock the updateMessage method to return false (message not found)
      (chatSessionRepository.updateMessage as jest.Mock).mockResolvedValue(
        false,
      );

      await chatSessionStore.updateMessageToken(
        {token: 'New message'},
        createdAt,
        newMessageId,
        session.id,
        mockContext,
      );

      expect(chatSessionRepository.updateMessage).toHaveBeenCalled();
      const newMessage = chatSessionStore.currentSessionMessages[0];
      expect(newMessage.id).toBe(newMessageId);
      expect((newMessage as MessageType.Text).text).toBe('New message');
      expect(newMessage.metadata).toEqual({contextId: 1, copyable: true});
    });
  });

  describe('groupedSessions', () => {
    it('groups sessions by date categories', () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);

      chatSessionStore.sessions = [
        {
          id: '1',
          title: 'Today Session',
          date: today.toISOString(),
          messages: [],
          completionSettings: defaultCompletionSettings,
          settingsSource: 'pal',
        },
        {
          id: '2',
          title: 'Yesterday Session',
          date: yesterday.toISOString(),
          messages: [],
          completionSettings: defaultCompletionSettings,
          settingsSource: 'pal',
        },
        {
          id: '3',
          title: 'Last Week Session',
          date: lastWeek.toISOString(),
          messages: [],
          completionSettings: defaultCompletionSettings,
          settingsSource: 'pal',
        },
      ];

      const grouped = chatSessionStore.groupedSessions;
      expect(grouped.Today).toBeDefined();
      expect(grouped.Yesterday).toBeDefined();
      expect(grouped['Last week']).toBeDefined();
    });
  });

  describe('duplicateSession', () => {
    it('duplicates a session with its messages and settings', async () => {
      const originalSession = {
        id: 'session1',
        title: 'Original Session',
        date: new Date().toISOString(),
        messages: [mockMessage],
        completionSettings: {
          ...defaultCompletionSettings,
          temperature: 0.7,
        },
        settingsSource: 'pal' as 'pal' | 'custom',
      };

      chatSessionStore.sessions = [originalSession];

      const mockNewSession = {
        id: 'new-session',
        title: 'Original Session - Copy',
        date: new Date().toISOString(),
      };

      const mockSessionData = {
        messages: [
          {
            toMessageObject: () => mockMessage,
          },
        ],
        completionSettings: {
          getSettings: () => originalSession.completionSettings,
        },
      };

      (chatSessionRepository.createSession as jest.Mock).mockResolvedValue(
        mockNewSession,
      );
      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValue(
        mockSessionData,
      );

      await chatSessionStore.duplicateSession('session1');

      expect(chatSessionRepository.createSession).toHaveBeenCalledWith(
        'Original Session - Copy',
        [mockMessage],
        originalSession.completionSettings,
        undefined,
      );
      expect(chatSessionStore.sessions.length).toBe(2);
      expect(chatSessionStore.sessions[1].title).toBe(
        'Original Session - Copy',
      );
      expect(chatSessionStore.sessions[1].completionSettings.temperature).toBe(
        0.7,
      );
    });
  });

  // Tests from ChatSessionStoreExtended.test.ts
  describe('isGenerating flag', () => {
    it('sets and gets the isGenerating flag', () => {
      expect(chatSessionStore.isGenerating).toBe(false);

      chatSessionStore.setIsGenerating(true);
      expect(chatSessionStore.isGenerating).toBe(true);

      chatSessionStore.setIsGenerating(false);
      expect(chatSessionStore.isGenerating).toBe(false);
    });

    it('shouldShowHeaderDivider returns true when conditions met', () => {
      // No active session
      expect(chatSessionStore.shouldShowHeaderDivider).toBe(true);

      // Active session with no messages
      const session = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [] as MessageType.Any[],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
      };
      chatSessionStore.sessions = [session];
      chatSessionStore.activeSessionId = session.id;
      expect(chatSessionStore.shouldShowHeaderDivider).toBe(true);

      // Active session with messages
      session.messages = [mockMessage] as MessageType.Any[];
      expect(chatSessionStore.shouldShowHeaderDivider).toBe(true);

      // With isGenerating true
      chatSessionStore.setIsGenerating(true);
      expect(chatSessionStore.shouldShowHeaderDivider).toBe(false);

      // With isEditMode true
      chatSessionStore.setIsGenerating(false);
      chatSessionStore.isEditMode = true;
      expect(chatSessionStore.shouldShowHeaderDivider).toBe(false);
    });
  });

  describe('updateSessionTitleBySessionId', () => {
    it('updates session title by ID', async () => {
      const session = {
        id: 'session1',
        title: 'Original Title',
        date: new Date().toISOString(),
        messages: [],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
      };
      chatSessionStore.sessions = [session];

      (chatSessionRepository.updateSessionTitle as jest.Mock).mockResolvedValue(
        undefined,
      );

      await chatSessionStore.updateSessionTitleBySessionId(
        'session1',
        'New Title',
      );

      expect(chatSessionRepository.updateSessionTitle).toHaveBeenCalledWith(
        'session1',
        'New Title',
      );
      expect(chatSessionStore.sessions[0].title).toBe('New Title');
    });

    it('does nothing for non-existent session ID', async () => {
      const session = {
        id: 'session1',
        title: 'Original Title',
        date: new Date().toISOString(),
        messages: [],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
      };
      chatSessionStore.sessions = [session];

      (chatSessionRepository.updateSessionTitle as jest.Mock).mockResolvedValue(
        undefined,
      );

      await chatSessionStore.updateSessionTitleBySessionId(
        'non-existent',
        'New Title',
      );

      expect(chatSessionRepository.updateSessionTitle).toHaveBeenCalledWith(
        'non-existent',
        'New Title',
      );
      expect(chatSessionStore.sessions[0].title).toBe('Original Title');
    });
  });

  describe('completion settings', () => {
    it('updates completion settings for active session', async () => {
      const session = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
      };
      chatSessionStore.sessions = [session];
      chatSessionStore.activeSessionId = session.id;

      const newSettings = {
        ...defaultCompletionSettings,
        temperature: 0.9,
        top_p: 0.95,
      };

      (
        chatSessionRepository.updateSessionCompletionSettings as jest.Mock
      ).mockResolvedValue(undefined);

      await chatSessionStore.updateSessionCompletionSettings(newSettings);

      expect(
        chatSessionRepository.updateSessionCompletionSettings,
      ).toHaveBeenCalledWith(session.id, newSettings);
      expect(chatSessionStore.sessions[0].completionSettings).toEqual(
        newSettings,
      );
    });

    it('sets new chat completion settings', async () => {
      const newSettings = {
        ...defaultCompletionSettings,
        temperature: 0.9,
      };

      (
        chatSessionRepository.saveGlobalCompletionSettings as jest.Mock
      ).mockResolvedValue(undefined);

      await chatSessionStore.setNewChatCompletionSettings(newSettings);

      expect(
        chatSessionRepository.saveGlobalCompletionSettings,
      ).toHaveBeenCalledWith(newSettings);
      expect(chatSessionStore.newChatCompletionSettings).toEqual(newSettings);
    });

    it('resets new chat completion settings', async () => {
      chatSessionStore.newChatCompletionSettings = {
        ...defaultCompletionSettings,
        temperature: 0.9,
      };

      (
        chatSessionRepository.saveGlobalCompletionSettings as jest.Mock
      ).mockResolvedValue(undefined);

      await chatSessionStore.resetNewChatCompletionSettings();

      expect(
        chatSessionRepository.saveGlobalCompletionSettings,
      ).toHaveBeenCalledWith(defaultCompletionSettings);
      expect(chatSessionStore.newChatCompletionSettings).toEqual(
        defaultCompletionSettings,
      );
    });

    it('applies new chat completion settings when creating a new session', async () => {
      const customSettings = {
        ...defaultCompletionSettings,
        temperature: 0.7,
        top_p: 0.95,
      };

      chatSessionStore.newChatCompletionSettings = customSettings;

      const mockNewSession = {
        id: 'new-session',
        title: 'New Session',
        date: new Date().toISOString(),
      };

      const mockSessionData = {
        messages: [],
        completionSettings: {
          getSettings: () => customSettings,
        },
      };

      (chatSessionRepository.createSession as jest.Mock).mockResolvedValue(
        mockNewSession,
      );
      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValue(
        mockSessionData,
      );
      (
        chatSessionRepository.saveGlobalCompletionSettings as jest.Mock
      ).mockResolvedValue(undefined);

      await chatSessionStore.createNewSession('New Session');

      expect(chatSessionRepository.createSession).toHaveBeenCalledWith(
        'New Session',
        [],
        customSettings,
        undefined,
      );
      expect(chatSessionStore.sessions[0].completionSettings).toEqual(
        customSettings,
      );
      expect(chatSessionStore.newChatCompletionSettings).toEqual(
        defaultCompletionSettings,
      );
    });
  });

  describe('edit mode', () => {
    const mockMessage2 = {
      id: 'message2',
      text: 'Second message',
      type: 'text',
      author: {id: 'assistant', name: 'Assistant'},
      createdAt: Date.now() - 1000,
    } as MessageType.Text;

    const mockMessage3 = {
      id: 'message3',
      text: 'Third message',
      type: 'text',
      author: {id: 'user1', name: 'User'},
      createdAt: Date.now(),
    } as MessageType.Text;

    beforeEach(() => {
      const session = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [
          mockMessage3, // newest - user (message3)
          mockMessage2, // middle - assistant (message2)
          mockMessage, // oldest - user (message1)
        ],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
      };
      chatSessionStore.sessions = [session];
      chatSessionStore.activeSessionId = 'session1';
    });

    it('enters edit mode for a specific message', () => {
      chatSessionStore.enterEditMode(mockMessage2.id);

      expect(chatSessionStore.isEditMode).toBe(true);
      expect(chatSessionStore.editingMessageId).toBe(mockMessage2.id);
    });

    it('exits edit mode', () => {
      chatSessionStore.enterEditMode(mockMessage2.id);
      chatSessionStore.exitEditMode();

      expect(chatSessionStore.isEditMode).toBe(false);
      expect(chatSessionStore.editingMessageId).toBeNull();
    });

    it('commits edit by removing messages after the edited message', async () => {
      chatSessionStore.enterEditMode(mockMessage3.id);
      await chatSessionStore.commitEdit();

      await waitFor(() => {
        expect(chatSessionStore.isEditMode).toBe(false);
      });

      // expect(chatSessionStore.isEditMode).toBe(false);
      expect(chatSessionStore.editingMessageId).toBeNull();
      // Not sure how to test this after migration to db
      // expect(chatSessionStore.sessions[0].messages.length).toBe(2);
      // expect(chatSessionStore.sessions[0].messages[0].id).toBe(mockMessage2.id);
      // expect(chatSessionStore.sessions[0].messages[1].id).toBe(mockMessage.id);
    });

    it('returns correct messages when in edit mode', () => {
      // editing the first message will remove all messages after it
      chatSessionStore.enterEditMode(mockMessage.id);

      const messages = chatSessionStore.currentSessionMessages;
      expect(messages.length).toBe(0);
    });
  });

  describe('removeMessagesFromId', () => {
    const mockMessage2 = {
      id: 'message2',
      text: 'Second message',
      type: 'text',
      author: {id: 'assistant', name: 'Assistant'},
      createdAt: Date.now() - 1000,
    } as MessageType.Text;

    const mockMessage3 = {
      id: 'message3',
      text: 'Third message',
      type: 'text',
      author: {id: 'user1', name: 'User'},
      createdAt: Date.now(),
    } as MessageType.Text;

    beforeEach(() => {
      const session = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [
          mockMessage3, // newest - user (message3)
          mockMessage2, // middle - assistant (message2)
          mockMessage, // oldest - user (message1)
        ],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
      };
      chatSessionStore.sessions = [session];
      chatSessionStore.activeSessionId = 'session1';
    });

    it('removes messages up to a specific ID (including the message)', async () => {
      // TODO: this is cheating: we need to mock db so we can test this
      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValueOnce(
        {
          session: {
            id: 'session1',
            title: 'Session 1',
            date: new Date().toISOString(),
          },
          messages: [
            {
              toMessageObject: () => mockMessage,
            },
          ],
          completionSettings: {
            getSettings: () => defaultCompletionSettings,
          },
        },
      );

      await chatSessionStore.removeMessagesFromId(mockMessage2.id, true);

      // Should remove mockMessage3 and mockMessage2, leaving only mockMessage
      expect(chatSessionStore.sessions[0].messages.length).toBe(1);
      expect(chatSessionStore.sessions[0].messages[0].id).toBe(mockMessage.id);
    });

    it('removes messages up to a specific ID (excluding the message)', async () => {
      // TODO: this is cheating: we need to mock db so we can test this
      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValueOnce(
        {
          session: {
            id: 'session1',
            title: 'Session 1',
            date: new Date().toISOString(),
          },
          messages: [
            {
              toMessageObject: () => mockMessage2,
            },
            {
              toMessageObject: () => mockMessage,
            },
          ],
          completionSettings: {
            getSettings: () => defaultCompletionSettings,
          },
        },
      );

      await chatSessionStore.removeMessagesFromId(mockMessage2.id, false);

      // Should remove only mockMessage3, leaving mockMessage2 and mockMessage
      expect(chatSessionStore.sessions[0].messages.length).toBe(2);
      expect(chatSessionStore.sessions[0].messages[0].id).toBe(mockMessage2.id);
      expect(chatSessionStore.sessions[0].messages[1].id).toBe(mockMessage.id);
    });

    it('does nothing for non-existent message ID', async () => {
      await chatSessionStore.removeMessagesFromId('non-existent');

      expect(chatSessionStore.sessions[0].messages.length).toBe(3);
    });
  });

  describe('pal management', () => {
    it('gets active pal ID from active session', () => {
      const session = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [],
        completionSettings: defaultCompletionSettings,
        activePalId: 'pal1',
        settingsSource: 'pal' as 'pal' | 'custom',
      };
      chatSessionStore.sessions = [session];
      chatSessionStore.activeSessionId = 'session1';

      expect(chatSessionStore.activePalId).toBe('pal1');
    });

    it('gets active pal ID from newChatPalId when no active session', () => {
      chatSessionStore.newChatPalId = 'pal2';

      expect(chatSessionStore.activePalId).toBe('pal2');
    });

    it('sets active pal ID for active session', async () => {
      const session = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
      };
      chatSessionStore.sessions = [session];
      chatSessionStore.activeSessionId = 'session1';

      await chatSessionStore.setActivePal('pal1');

      expect(chatSessionStore.sessions[0].activePalId).toBe('pal1');
    });

    it('sets newChatPalId when no active session', async () => {
      await chatSessionStore.setActivePal('pal2');

      expect(chatSessionStore.newChatPalId).toBe('pal2');
    });

    it('preserves active pal ID when resetting active session', () => {
      const session = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [],
        completionSettings: defaultCompletionSettings,
        activePalId: 'pal1',
        settingsSource: 'pal' as 'pal' | 'custom',
      };
      chatSessionStore.sessions = [session];
      chatSessionStore.activeSessionId = 'session1';

      chatSessionStore.resetActiveSession();

      expect(chatSessionStore.newChatPalId).toBe('pal1');
      expect(chatSessionStore.activeSessionId).toBeNull();
    });

    it('applies newChatPalId when creating a new session', async () => {
      chatSessionStore.newChatPalId = 'pal1';

      await chatSessionStore.createNewSession('New Session');

      expect(chatSessionStore.sessions[0].activePalId).toBe('pal1');
      expect(chatSessionStore.newChatPalId).toBeUndefined();
    });
  });
});
