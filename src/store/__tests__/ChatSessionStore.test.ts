jest.unmock('../ChatSessionStore'); // this is not really needed, as only importing from store is mocked.
import {runInAction} from 'mobx';
import RNFS from 'react-native-fs';
import {LlamaContext} from '@pocketpalai/llama.rn';

import {chatSessionStore} from '../ChatSessionStore';

import {MessageType} from '../../utils/types';

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
    it('loads session list from file successfully', async () => {
      const mockData = JSON.stringify([
        {
          id: '1',
          title: 'Session 1',
          date: new Date().toISOString(),
          messages: [],
        },
      ]);
      (RNFS.readFile as jest.Mock).mockResolvedValue(mockData);

      await chatSessionStore.loadSessionList();

      expect(chatSessionStore.sessions.length).toBe(1);
      expect(chatSessionStore.sessions[0].title).toBe('Session 1');
      expect(RNFS.readFile).toHaveBeenCalledWith(
        '/path/to/documents/session-metadata.json',
      );
    });

    it('handles file read error gracefully', async () => {
      (RNFS.readFile as jest.Mock).mockRejectedValue(
        new Error('File not found'),
      );

      await chatSessionStore.loadSessionList();

      expect(chatSessionStore.sessions).toEqual([]);
      expect(RNFS.readFile).toHaveBeenCalledWith(
        '/path/to/documents/session-metadata.json',
      );
    });
  });

  describe('deleteSession', () => {
    it('deletes the session file and updates store', async () => {
      const mockSessionId = 'session1';
      chatSessionStore.sessions = [
        {
          id: mockSessionId,
          title: 'Session 1',
          date: new Date().toISOString(),
          messages: [],
        },
      ];
      (RNFS.exists as jest.Mock).mockResolvedValue(true);

      await chatSessionStore.deleteSession(mockSessionId);

      expect(RNFS.unlink).toHaveBeenCalledWith(
        `/path/to/documents/${mockSessionId}.llama-session.bin`,
      );
      expect(chatSessionStore.sessions.length).toBe(0);
    });

    it('handles file not existing during session deletion', async () => {
      const mockSessionId = 'session1';
      chatSessionStore.sessions = [
        {
          id: mockSessionId,
          title: 'Session 1',
          date: new Date().toISOString(),
          messages: [],
        },
      ];
      (RNFS.exists as jest.Mock).mockResolvedValue(false);

      await chatSessionStore.deleteSession(mockSessionId);

      expect(RNFS.unlink).not.toHaveBeenCalled();
      expect(chatSessionStore.sessions.length).toBe(0);
    });
  });

  describe('addMessageToCurrentSession', () => {
    it('creates a new session if no active session', async () => {
      await runInAction(async () => {
        chatSessionStore.addMessageToCurrentSession(mockMessage);
      });

      expect(chatSessionStore.sessions.length).toBe(1);
      expect(
        (chatSessionStore.sessions[0].messages[0] as MessageType.Text).text,
      ).toBe(mockMessage.text);
    });

    it('adds a message to the active session', async () => {
      const mockSession = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [],
      };
      chatSessionStore.sessions = [mockSession];
      chatSessionStore.activeSessionId = mockSession.id;

      runInAction(() => {
        chatSessionStore.addMessageToCurrentSession(mockMessage);
      });

      expect(chatSessionStore.sessions[0].messages.length).toBe(1);
      expect(
        (chatSessionStore.sessions[0].messages[0] as MessageType.Text).text,
      ).toBe('Hello, world!');
    });
  });

  describe('updateMessage', () => {
    it('updates a message in the active session', () => {
      const mockSession = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [mockMessage],
      };
      chatSessionStore.sessions = [mockSession];
      chatSessionStore.activeSessionId = mockSession.id;

      const updatedMessage = {text: 'Updated message text'};
      chatSessionStore.updateMessage(mockMessage.id, updatedMessage);

      expect(
        (chatSessionStore.sessions[0].messages[0] as MessageType.Text).text,
      ).toBe(updatedMessage.text);
    });
  });

  describe('updateSessionTitle', () => {
    it('updates the session title based on the latest message', () => {
      const mockSession = {
        id: 'session1',
        title: 'New Session',
        date: new Date().toISOString(),
        messages: [mockMessage],
      };
      chatSessionStore.updateSessionTitle(mockSession);

      expect(mockSession.title).toBe('Hello, world!');
    });

    it('limits the session title to 40 characters', () => {
      const longMessage = 'a'.repeat(100);
      const mockSession = {
        id: 'session1',
        title: 'New Session',
        date: new Date().toISOString(),
        messages: [{...mockMessage, text: longMessage}],
      };
      chatSessionStore.updateSessionTitle(mockSession);

      expect(mockSession.title.length).toBe(43); // 40 chars + '...'
      expect(mockSession.title.endsWith('...')).toBe(true);
    });
  });

  describe('createNewSession', () => {
    it('creates a new session and sets it as active', async () => {
      await chatSessionStore.createNewSession('My New Session', [mockMessage]);

      expect(chatSessionStore.sessions.length).toBe(1);
      expect(chatSessionStore.sessions[0].title).toBe('My New Session');
      expect(chatSessionStore.activeSessionId).toBe(
        chatSessionStore.sessions[0].id,
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

  describe('saveSessionsMetadata', () => {
    it('saves the session metadata to file', async () => {
      const session = {
        id: '1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [],
      };
      chatSessionStore.sessions = [session];

      await chatSessionStore.saveSessionsMetadata();

      expect(RNFS.writeFile).toHaveBeenCalledWith(
        '/path/to/documents/session-metadata.json',
        JSON.stringify([session]),
      );
    });

    it('handles write error gracefully', async () => {
      const session = {
        id: '1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [],
      };
      chatSessionStore.sessions = [session];
      (RNFS.writeFile as jest.Mock).mockRejectedValue(
        new Error('Write failed'),
      );

      await chatSessionStore.saveSessionsMetadata();

      expect(RNFS.writeFile).toHaveBeenCalled();
    });
  });

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
    it('updates existing message with new token', () => {
      const session = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [mockMessage],
      };
      chatSessionStore.sessions = [session];
      chatSessionStore.activeSessionId = session.id;

      const mockContext = new LlamaContext({
        contextId: 1,
        gpu: false,
        reasonNoGPU: 'Test environment',
        model: 'mock-model',
      });

      chatSessionStore.updateMessageToken(
        {token: ' world'},
        Date.now(),
        mockMessage.id,
        mockContext,
      );

      expect(
        (chatSessionStore.currentSessionMessages[0] as MessageType.Text).text,
      ).toBe('Hello, world! world');
    });

    it('creates new message if id not found', () => {
      const session = {
        id: 'session1',
        title: 'Session 1',
        date: new Date().toISOString(),
        messages: [],
      };
      chatSessionStore.sessions = [session];
      chatSessionStore.activeSessionId = session.id;

      const mockContext = new LlamaContext({
        contextId: 1,
        gpu: false,
        reasonNoGPU: 'Test environment',
        model: 'mock-model',
      });
      const newMessageId = 'new-message';
      const createdAt = Date.now();

      chatSessionStore.updateMessageToken(
        {token: 'New message'},
        createdAt,
        newMessageId,
        mockContext,
      );

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
        },
        {
          id: '2',
          title: 'Yesterday Session',
          date: yesterday.toISOString(),
          messages: [],
        },
        {
          id: '3',
          title: 'Last Week Session',
          date: lastWeek.toISOString(),
          messages: [],
        },
      ];

      const grouped = chatSessionStore.groupedSessions;
      expect(grouped.Today).toBeDefined();
      expect(grouped.Yesterday).toBeDefined();
      expect(grouped['Last week']).toBeDefined();
    });
  });
});
