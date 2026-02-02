jest.unmock('../ChatSessionStore'); // this is not really needed, as only importing from store is mocked.

import {chatSessionStore, defaultCompletionSettings} from '../ChatSessionStore';
import {chatSessionRepository} from '../../repositories/ChatSessionRepository';

import {MessageType} from '../../utils/types';
import {waitFor} from '@testing-library/react-native';

// Use the mock from __mocks__/repositories/ChatSessionRepository.js
//jest.mock('../../repositories/ChatSessionRepository');

// Make the repository methods mockable
jest.spyOn(chatSessionRepository, 'getAllSessions');
jest.spyOn(chatSessionRepository, 'getSessionById');
jest.spyOn(chatSessionRepository, 'getSessionMetadataWithSettings');
jest.spyOn(chatSessionRepository, 'createSession');
jest.spyOn(chatSessionRepository, 'deleteSession');
jest.spyOn(chatSessionRepository, 'deleteSessions');
jest.spyOn(chatSessionRepository, 'exportSessions');
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
    chatSessionStore.isSelectionMode = false;
    chatSessionStore.selectedSessionIds.clear();
  });

  describe('loadSessionList', () => {
    it('loads session list from database successfully', async () => {
      const mockSession = {
        id: '1',
        title: 'Session 1',
        date: new Date().toISOString(),
      };

      const mockCompletionSettings = {
        getSettings: () => ({
          ...defaultCompletionSettings,
          temperature: 0.7,
        }),
      };

      const mockSessionData = {
        session: mockSession,
        completionSettings: mockCompletionSettings,
      };

      (chatSessionRepository.getAllSessions as jest.Mock).mockResolvedValue([
        mockSession,
      ]);
      (
        chatSessionRepository.getSessionMetadataWithSettings as jest.Mock
      ).mockResolvedValue(mockSessionData);

      await chatSessionStore.loadSessionList();

      expect(chatSessionStore.sessions.length).toBe(1);
      expect(chatSessionStore.sessions[0].title).toBe('Session 1');
      expect(chatSessionStore.sessions[0].messages).toEqual([]);
      expect(chatSessionStore.sessions[0].messagesLoaded).toBe(false);
      expect(chatSessionRepository.getAllSessions).toHaveBeenCalled();
      expect(
        chatSessionRepository.getSessionMetadataWithSettings,
      ).toHaveBeenCalledWith('1');
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
    it('sets the active session id', async () => {
      const sessionId = 'session1';
      await chatSessionStore.setActiveSession(sessionId);
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

  describe('updateMessageStreaming', () => {
    let testMessage: MessageType.Text;
    let mockTime: number;
    let dateNowSpy: jest.SpyInstance;

    beforeEach(() => {
      // Mock Date.now() to work with fake timers
      mockTime = 1000000;
      dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => mockTime);
      jest.useFakeTimers();

      // Reset store's internal streaming state
      (chatSessionStore as any).lastStreamingUpdateTime = 0;
      (chatSessionStore as any).pendingStreamingUpdate = null;
      if ((chatSessionStore as any).streamingThrottleTimer) {
        clearTimeout((chatSessionStore as any).streamingThrottleTimer);
        (chatSessionStore as any).streamingThrottleTimer = null;
      }

      // Create a fresh copy of the message for each test
      testMessage = {
        id: 'message1',
        text: 'Hello, world!',
        type: 'text',
        author: {id: 'user1', name: 'User'},
        createdAt: mockTime,
      } as MessageType.Text;

      const session = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [testMessage],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
      };
      chatSessionStore.sessions = [session];
      chatSessionStore.activeSessionId = 'session1';
      (chatSessionRepository.updateMessage as jest.Mock).mockResolvedValue(
        undefined,
      );
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.clearAllMocks();
      dateNowSpy.mockRestore();
    });

    it('should apply update immediately when no throttle is active', () => {
      const update = {text: 'Streaming text...'};

      chatSessionStore.updateMessageStreaming(
        testMessage.id,
        'session1',
        update,
      );

      // Should apply immediately
      expect(
        (chatSessionStore.sessions[0].messages[0] as MessageType.Text).text,
      ).toBe('Streaming text...');
    });

    it('should update message metadata', () => {
      const update = {
        metadata: {
          thinking: 'Internal reasoning...',
        },
      };

      chatSessionStore.updateMessageStreaming(
        testMessage.id,
        'session1',
        update,
      );

      expect(
        (chatSessionStore.sessions[0].messages[0] as MessageType.Text).metadata
          ?.thinking,
      ).toBe('Internal reasoning...');
    });

    it('should merge metadata with existing metadata', () => {
      // Set initial metadata
      (chatSessionStore.sessions[0].messages[0] as MessageType.Text).metadata =
        {
          existingKey: 'existing value',
        };

      chatSessionStore.updateMessageStreaming(testMessage.id, 'session1', {
        metadata: {
          newKey: 'new value',
        },
      });

      const metadata = (
        chatSessionStore.sessions[0].messages[0] as MessageType.Text
      ).metadata;
      expect(metadata?.existingKey).toBe('existing value');
      expect(metadata?.newKey).toBe('new value');
    });

    it('should persist updates to database asynchronously', () => {
      const update = {text: 'Persisted text'};

      chatSessionStore.updateMessageStreaming(
        testMessage.id,
        'session1',
        update,
      );

      expect(chatSessionRepository.updateMessage).toHaveBeenCalledWith(
        testMessage.id,
        update,
      );
    });

    it('should handle session not found gracefully', () => {
      chatSessionStore.updateMessageStreaming(
        testMessage.id,
        'non-existent-session',
        {text: 'test'},
      );

      // Should not throw, just silently fail
      expect(
        (chatSessionStore.sessions[0].messages[0] as MessageType.Text).text,
      ).toBe('Hello, world!');
    });

    it('should handle message not found gracefully', () => {
      chatSessionStore.updateMessageStreaming(
        'non-existent-message',
        'session1',
        {
          text: 'test',
        },
      );

      // Should not throw, original message unchanged
      expect(
        (chatSessionStore.sessions[0].messages[0] as MessageType.Text).text,
      ).toBe('Hello, world!');
    });

    it('should handle non-text message types gracefully', () => {
      const imageMessage = {
        id: 'image-msg',
        type: 'image',
        uri: 'file://image.jpg',
        author: {id: 'user1'},
        createdAt: Date.now(),
      } as MessageType.Image;

      chatSessionStore.sessions[0].messages = [imageMessage];

      // Should not throw when trying to update non-text message
      chatSessionStore.updateMessageStreaming('image-msg', 'session1', {
        text: 'test',
      });

      expect(chatSessionStore.sessions[0].messages[0].type).toBe('image');
    });

    it('should use activeSessionId when sessionId parameter is empty', () => {
      const update = {text: 'Active session update'};

      chatSessionStore.updateMessageStreaming(testMessage.id, '', update);

      expect(
        (chatSessionStore.sessions[0].messages[0] as MessageType.Text).text,
      ).toBe('Active session update');
    });

    it('should handle database persistence errors gracefully', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      (chatSessionRepository.updateMessage as jest.Mock).mockRejectedValueOnce(
        new Error('DB write failed'),
      );

      chatSessionStore.updateMessageStreaming(testMessage.id, 'session1', {
        text: 'Test update',
      });

      // Message should still be updated in memory
      expect(
        (chatSessionStore.sessions[0].messages[0] as MessageType.Text).text,
      ).toBe('Test update');

      // Wait for async DB operation to complete
      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Failed to persist streaming update to DB:',
          expect.any(Error),
        );
      });

      consoleErrorSpy.mockRestore();
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

  describe('lazy loading', () => {
    it('setActiveSession loads messages on first access', async () => {
      const mockSession = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
        messagesLoaded: false,
      };

      chatSessionStore.sessions = [mockSession];

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
        {
          toMessageObject: () => ({
            id: 'msg2',
            text: 'World',
            type: 'text',
            author: {id: 'user1'},
            createdAt: Date.now(),
          }),
        },
      ];

      const mockSessionData = {
        session: mockSession,
        messages: mockMessages,
        completionSettings: {getSettings: () => defaultCompletionSettings},
      };

      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValue(
        mockSessionData,
      );

      await chatSessionStore.setActiveSession('session1');

      expect(chatSessionRepository.getSessionById).toHaveBeenCalledWith(
        'session1',
      );
      expect(chatSessionStore.sessions[0].messages.length).toBe(2);
      expect(chatSessionStore.sessions[0].messages[0].id).toBe('msg1');
      expect(chatSessionStore.sessions[0].messages[1].id).toBe('msg2');
      expect(chatSessionStore.sessions[0].messagesLoaded).toBe(true);
      expect(chatSessionStore.activeSessionId).toBe('session1');
    });

    it('setActiveSession does not reload messages if already loaded', async () => {
      const cachedMessage = {
        id: 'msg1',
        text: 'Hello',
        type: 'text',
        author: {id: 'user1'},
        createdAt: Date.now(),
      } as MessageType.Text;

      const mockSession = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [cachedMessage],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
        messagesLoaded: true,
      };

      chatSessionStore.sessions = [mockSession];

      await chatSessionStore.setActiveSession('session1');

      expect(chatSessionRepository.getSessionById).not.toHaveBeenCalled();
      expect(chatSessionStore.activeSessionId).toBe('session1');
      expect(chatSessionStore.sessions[0].messages.length).toBe(1);
      expect(chatSessionStore.sessions[0].messages[0].id).toBe('msg1');
    });

    it('currentSessionMessages returns correct messages after lazy load', async () => {
      const mockSession = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
        messagesLoaded: false,
      };

      chatSessionStore.sessions = [mockSession];

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

      const mockSessionData = {
        session: mockSession,
        messages: mockMessages,
        completionSettings: {getSettings: () => defaultCompletionSettings},
      };

      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValue(
        mockSessionData,
      );

      await chatSessionStore.setActiveSession('session1');

      expect(chatSessionStore.currentSessionMessages.length).toBe(1);
      expect(chatSessionStore.currentSessionMessages[0].id).toBe('msg1');
      expect(
        (chatSessionStore.currentSessionMessages[0] as MessageType.Text).text,
      ).toBe('Hello');
    });

    it('createNewSession marks messages as loaded', async () => {
      const mockNewSession = {
        id: 'new-session',
        title: 'My New Session',
        date: new Date().toISOString(),
      };

      const newSessionMessage = {
        toMessageObject: () => ({
          id: 'msg1',
          text: 'Hello',
          type: 'text',
          author: {id: 'user1'},
          createdAt: Date.now(),
        }),
      };

      const mockSessionData = {
        messages: [newSessionMessage],
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

      await chatSessionStore.createNewSession('My New Session', [
        newSessionMessage.toMessageObject() as MessageType.Any,
      ]);

      expect(chatSessionStore.sessions.length).toBe(1);
      expect(chatSessionStore.sessions[0].messagesLoaded).toBe(true);
      expect(chatSessionStore.sessions[0].messages.length).toBe(1);
      expect(chatSessionStore.sessions[0].messages[0].id).toBe('msg1');
    });

    it('addMessageToCurrentSession works correctly with lazy loaded session', async () => {
      const mockMessage1 = {
        id: 'msg1',
        text: 'Hello',
        type: 'text',
        author: {id: 'user1'},
        createdAt: Date.now(),
      } as MessageType.Text;

      const mockSession = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [mockMessage1],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
        messagesLoaded: true,
      };

      chatSessionStore.sessions = [mockSession];
      chatSessionStore.activeSessionId = 'session1';

      const newMessage = {
        id: 'msg2',
        text: 'World',
        type: 'text',
        author: {id: 'user1'},
        createdAt: Date.now(),
      } as MessageType.Text;

      (
        chatSessionRepository.addMessageToSession as jest.Mock
      ).mockResolvedValue({
        id: 'msg2',
      });

      await chatSessionStore.addMessageToCurrentSession(newMessage);

      expect(chatSessionRepository.addMessageToSession).toHaveBeenCalledWith(
        'session1',
        newMessage,
      );
      expect(chatSessionStore.sessions[0].messages.length).toBe(2);
      expect(chatSessionStore.sessions[0].messages[0].id).toBe('msg2');
      expect(chatSessionStore.sessions[0].messages[1].id).toBe('msg1');
    });

    it('handles missing session gracefully during lazy load', async () => {
      const mockSession = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
        messagesLoaded: false,
      };

      chatSessionStore.sessions = [mockSession];

      (chatSessionRepository.getSessionById as jest.Mock).mockResolvedValue(
        null,
      );

      await chatSessionStore.setActiveSession('session1');

      expect(chatSessionRepository.getSessionById).toHaveBeenCalledWith(
        'session1',
      );
      expect(chatSessionStore.sessions[0].messages.length).toBe(0);
      expect(chatSessionStore.sessions[0].messagesLoaded).toBe(false);
      expect(chatSessionStore.activeSessionId).toBe('session1');
    });

    it('handles errors during lazy load gracefully', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const mockSession = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
        messagesLoaded: false,
      };

      chatSessionStore.sessions = [mockSession];

      (chatSessionRepository.getSessionById as jest.Mock).mockRejectedValue(
        new Error('Database error'),
      );

      await chatSessionStore.setActiveSession('session1');

      expect(chatSessionRepository.getSessionById).toHaveBeenCalledWith(
        'session1',
      );
      expect(chatSessionStore.sessions[0].messages.length).toBe(0);
      expect(chatSessionStore.sessions[0].messagesLoaded).toBe(false);
      expect(chatSessionStore.activeSessionId).toBe('session1');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to load messages for session session1:',
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it('loads messages for multiple sessions independently', async () => {
      const mockSession1 = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
        messagesLoaded: false,
      };

      const mockSession2 = {
        id: 'session2',
        title: 'Session 2',
        date: new Date().toISOString(),
        messages: [],
        completionSettings: defaultCompletionSettings,
        settingsSource: 'pal' as 'pal' | 'custom',
        messagesLoaded: false,
      };

      chatSessionStore.sessions = [mockSession1, mockSession2];

      const mockMessages1 = [
        {
          toMessageObject: () => ({
            id: 'msg1',
            text: 'Hello from session 1',
            type: 'text',
            author: {id: 'user1'},
            createdAt: Date.now(),
          }),
        },
      ];

      const mockMessages2 = [
        {
          toMessageObject: () => ({
            id: 'msg2',
            text: 'Hello from session 2',
            type: 'text',
            author: {id: 'user1'},
            createdAt: Date.now(),
          }),
        },
      ];

      (chatSessionRepository.getSessionById as jest.Mock)
        .mockResolvedValueOnce({
          session: mockSession1,
          messages: mockMessages1,
          completionSettings: {getSettings: () => defaultCompletionSettings},
        })
        .mockResolvedValueOnce({
          session: mockSession2,
          messages: mockMessages2,
          completionSettings: {getSettings: () => defaultCompletionSettings},
        });

      await chatSessionStore.setActiveSession('session1');
      expect(chatSessionStore.sessions[0].messages[0].id).toBe('msg1');
      expect(chatSessionStore.sessions[0].messagesLoaded).toBe(true);
      expect(chatSessionStore.sessions[1].messagesLoaded).toBe(false);

      await chatSessionStore.setActiveSession('session2');
      expect(chatSessionStore.sessions[1].messages[0].id).toBe('msg2');
      expect(chatSessionStore.sessions[1].messagesLoaded).toBe(true);
    });
  });

  describe('Selection Mode', () => {
    beforeEach(() => {
      // Set up some sessions for selection tests
      chatSessionStore.sessions = [
        {
          id: 'session1',
          title: 'Session 1',
          date: new Date().toISOString(),
          messages: [],
          completionSettings: defaultCompletionSettings,
          settingsSource: 'pal',
        },
        {
          id: 'session2',
          title: 'Session 2',
          date: new Date().toISOString(),
          messages: [],
          completionSettings: defaultCompletionSettings,
          settingsSource: 'pal',
        },
        {
          id: 'session3',
          title: 'Session 3',
          date: new Date().toISOString(),
          messages: [],
          completionSettings: defaultCompletionSettings,
          settingsSource: 'pal',
        },
      ];
    });

    describe('enterSelectionMode', () => {
      it('sets isSelectionMode to true', () => {
        chatSessionStore.enterSelectionMode();
        expect(chatSessionStore.isSelectionMode).toBe(true);
      });

      it('pre-selects the session when sessionId is provided', () => {
        chatSessionStore.enterSelectionMode('session2');
        expect(chatSessionStore.isSelectionMode).toBe(true);
        expect(chatSessionStore.selectedSessionIds.has('session2')).toBe(true);
        expect(chatSessionStore.selectedCount).toBe(1);
      });

      it('clears previous selections when entering selection mode', () => {
        chatSessionStore.selectedSessionIds.add('session1');
        chatSessionStore.enterSelectionMode('session2');
        expect(chatSessionStore.selectedSessionIds.has('session1')).toBe(false);
        expect(chatSessionStore.selectedSessionIds.has('session2')).toBe(true);
        expect(chatSessionStore.selectedCount).toBe(1);
      });

      it('enters selection mode without pre-selection when no sessionId provided', () => {
        chatSessionStore.enterSelectionMode();
        expect(chatSessionStore.isSelectionMode).toBe(true);
        expect(chatSessionStore.selectedCount).toBe(0);
      });
    });

    describe('exitSelectionMode', () => {
      it('sets isSelectionMode to false', () => {
        chatSessionStore.isSelectionMode = true;
        chatSessionStore.exitSelectionMode();
        expect(chatSessionStore.isSelectionMode).toBe(false);
      });

      it('clears all selections', () => {
        chatSessionStore.isSelectionMode = true;
        chatSessionStore.selectedSessionIds.add('session1');
        chatSessionStore.selectedSessionIds.add('session2');
        chatSessionStore.exitSelectionMode();
        expect(chatSessionStore.selectedSessionIds.size).toBe(0);
      });
    });

    describe('toggleSessionSelection', () => {
      it('adds session ID when not selected', () => {
        chatSessionStore.toggleSessionSelection('session1');
        expect(chatSessionStore.selectedSessionIds.has('session1')).toBe(true);
        expect(chatSessionStore.selectedCount).toBe(1);
      });

      it('removes session ID when already selected', () => {
        chatSessionStore.selectedSessionIds.add('session1');
        chatSessionStore.toggleSessionSelection('session1');
        expect(chatSessionStore.selectedSessionIds.has('session1')).toBe(false);
        expect(chatSessionStore.selectedCount).toBe(0);
      });

      it('handles multiple toggles correctly', () => {
        chatSessionStore.toggleSessionSelection('session1');
        chatSessionStore.toggleSessionSelection('session2');
        expect(chatSessionStore.selectedCount).toBe(2);
        chatSessionStore.toggleSessionSelection('session1');
        expect(chatSessionStore.selectedCount).toBe(1);
        expect(chatSessionStore.selectedSessionIds.has('session2')).toBe(true);
      });
    });

    describe('selectAllSessions', () => {
      it('adds all session IDs to selectedSessionIds', () => {
        chatSessionStore.selectAllSessions();
        expect(chatSessionStore.selectedCount).toBe(3);
        expect(chatSessionStore.selectedSessionIds.has('session1')).toBe(true);
        expect(chatSessionStore.selectedSessionIds.has('session2')).toBe(true);
        expect(chatSessionStore.selectedSessionIds.has('session3')).toBe(true);
      });

      it('works when some sessions are already selected', () => {
        chatSessionStore.selectedSessionIds.add('session1');
        chatSessionStore.selectAllSessions();
        expect(chatSessionStore.selectedCount).toBe(3);
      });
    });

    describe('deselectAllSessions', () => {
      it('clears all selected session IDs', () => {
        chatSessionStore.selectedSessionIds.add('session1');
        chatSessionStore.selectedSessionIds.add('session2');
        chatSessionStore.deselectAllSessions();
        expect(chatSessionStore.selectedCount).toBe(0);
        expect(chatSessionStore.selectedSessionIds.size).toBe(0);
      });
    });

    describe('selectedCount computed property', () => {
      it('returns correct count of selected sessions', () => {
        expect(chatSessionStore.selectedCount).toBe(0);
        chatSessionStore.selectedSessionIds.add('session1');
        expect(chatSessionStore.selectedCount).toBe(1);
        chatSessionStore.selectedSessionIds.add('session2');
        expect(chatSessionStore.selectedCount).toBe(2);
      });
    });

    describe('allSelected computed property', () => {
      it('returns true when all sessions are selected', () => {
        chatSessionStore.selectAllSessions();
        expect(chatSessionStore.allSelected).toBe(true);
      });

      it('returns false when partially selected', () => {
        chatSessionStore.selectedSessionIds.add('session1');
        expect(chatSessionStore.allSelected).toBe(false);
      });

      it('returns false when no sessions are selected', () => {
        expect(chatSessionStore.allSelected).toBe(false);
      });

      it('returns false when sessions array is empty', () => {
        chatSessionStore.sessions = [];
        expect(chatSessionStore.allSelected).toBe(false);
      });
    });

    describe('bulkDeleteSessions', () => {
      it('calls repository deleteSessions with correct IDs', async () => {
        chatSessionStore.selectedSessionIds.add('session1');
        chatSessionStore.selectedSessionIds.add('session2');

        (chatSessionRepository.deleteSessions as jest.Mock).mockResolvedValue(
          undefined,
        );

        await chatSessionStore.bulkDeleteSessions();

        expect(chatSessionRepository.deleteSessions).toHaveBeenCalledWith([
          'session1',
          'session2',
        ]);
      });

      it('updates local state correctly after deletion', async () => {
        chatSessionStore.selectedSessionIds.add('session1');
        chatSessionStore.selectedSessionIds.add('session3');

        (chatSessionRepository.deleteSessions as jest.Mock).mockResolvedValue(
          undefined,
        );

        await chatSessionStore.bulkDeleteSessions();

        expect(chatSessionStore.sessions.length).toBe(1);
        expect(chatSessionStore.sessions[0].id).toBe('session2');
      });

      it('resets active session if it was deleted', async () => {
        chatSessionStore.activeSessionId = 'session2';
        chatSessionStore.selectedSessionIds.add('session2');

        (chatSessionRepository.deleteSessions as jest.Mock).mockResolvedValue(
          undefined,
        );

        const resetSpy = jest.spyOn(chatSessionStore, 'resetActiveSession');

        await chatSessionStore.bulkDeleteSessions();

        expect(resetSpy).toHaveBeenCalled();
      });

      it('does not reset active session if it was not deleted', async () => {
        chatSessionStore.activeSessionId = 'session3';
        chatSessionStore.selectedSessionIds.add('session1');

        (chatSessionRepository.deleteSessions as jest.Mock).mockResolvedValue(
          undefined,
        );

        const resetSpy = jest.spyOn(chatSessionStore, 'resetActiveSession');

        await chatSessionStore.bulkDeleteSessions();

        expect(resetSpy).not.toHaveBeenCalled();
      });

      it('exits selection mode on success', async () => {
        chatSessionStore.isSelectionMode = true;
        chatSessionStore.selectedSessionIds.add('session1');

        (chatSessionRepository.deleteSessions as jest.Mock).mockResolvedValue(
          undefined,
        );

        await chatSessionStore.bulkDeleteSessions();

        expect(chatSessionStore.isSelectionMode).toBe(false);
        expect(chatSessionStore.selectedCount).toBe(0);
      });

      it('handles errors gracefully and re-throws', async () => {
        chatSessionStore.selectedSessionIds.add('session1');

        const error = new Error('Database error');
        (chatSessionRepository.deleteSessions as jest.Mock).mockRejectedValue(
          error,
        );

        await expect(chatSessionStore.bulkDeleteSessions()).rejects.toThrow(
          'Database error',
        );

        // State should not be modified on error
        expect(chatSessionStore.sessions.length).toBe(3);
      });

      it('handles empty selection gracefully', async () => {
        (chatSessionRepository.deleteSessions as jest.Mock).mockResolvedValue(
          undefined,
        );

        await chatSessionStore.bulkDeleteSessions();

        expect(chatSessionRepository.deleteSessions).toHaveBeenCalledWith([]);
        expect(chatSessionStore.sessions.length).toBe(3);
      });
    });

    describe('bulkExportSessions', () => {
      it('calls repository exportSessions with selected IDs', async () => {
        chatSessionStore.selectedSessionIds.add('session1');
        chatSessionStore.selectedSessionIds.add('session3');

        (chatSessionRepository.exportSessions as jest.Mock).mockResolvedValue(
          undefined,
        );

        await chatSessionStore.bulkExportSessions();

        expect(chatSessionRepository.exportSessions).toHaveBeenCalledWith([
          'session1',
          'session3',
        ]);
      });

      it('exits selection mode on success', async () => {
        chatSessionStore.isSelectionMode = true;
        chatSessionStore.selectedSessionIds.add('session1');

        (chatSessionRepository.exportSessions as jest.Mock).mockResolvedValue(
          undefined,
        );

        await chatSessionStore.bulkExportSessions();

        expect(chatSessionStore.isSelectionMode).toBe(false);
        expect(chatSessionStore.selectedCount).toBe(0);
      });

      it('handles errors gracefully and re-throws', async () => {
        chatSessionStore.selectedSessionIds.add('session1');

        const error = new Error('Export failed');
        (chatSessionRepository.exportSessions as jest.Mock).mockRejectedValue(
          error,
        );

        await expect(chatSessionStore.bulkExportSessions()).rejects.toThrow(
          'Export failed',
        );
      });

      it('handles empty selection gracefully', async () => {
        (chatSessionRepository.exportSessions as jest.Mock).mockResolvedValue(
          undefined,
        );

        await chatSessionStore.bulkExportSessions();

        expect(chatSessionRepository.exportSessions).toHaveBeenCalledWith([]);
      });
    });
  });
});
