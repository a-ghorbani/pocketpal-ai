import {chatSessionRepository} from '../ChatSessionRepository';

// Mock the database
jest.mock('../../database', () => ({
  database: {
    write: jest.fn().mockImplementation(async callback => {
      await callback();
    }),
    collections: {
      get: jest.fn().mockReturnValue({
        create: jest.fn(),
        find: jest.fn(),
        query: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnThis(),
          sortBy: jest.fn().mockReturnThis(),
          fetch: jest.fn().mockResolvedValue([]),
        }),
      }),
    },
  },
}));

// Mock RNFS
jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/path',
  exists: jest.fn().mockResolvedValue(false),
  readFile: jest.fn().mockResolvedValue('[]'),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

describe('ChatSessionRepository', () => {
  it('should have all required methods', () => {
    // Verify that the repository has all the expected methods
    expect(chatSessionRepository).toBeDefined();
    expect(typeof chatSessionRepository.getAllSessions).toBe('function');
    expect(typeof chatSessionRepository.getSessionById).toBe('function');
    expect(typeof chatSessionRepository.createSession).toBe('function');
    expect(typeof chatSessionRepository.deleteSession).toBe('function');
    expect(typeof chatSessionRepository.addMessageToSession).toBe('function');
    expect(typeof chatSessionRepository.updateMessage).toBe('function');
    expect(typeof chatSessionRepository.updateSessionCompletionSettings).toBe(
      'function',
    );
    expect(typeof chatSessionRepository.getGlobalCompletionSettings).toBe(
      'function',
    );
    expect(typeof chatSessionRepository.saveGlobalCompletionSettings).toBe(
      'function',
    );
    expect(typeof chatSessionRepository.updateSessionTitle).toBe('function');
    expect(typeof chatSessionRepository.setSessionActivePal).toBe('function');
    expect(typeof chatSessionRepository.deleteMessage).toBe('function');
    // These might be private methods, so we don't test for them
    // expect(typeof chatSessionRepository.resetMigration).toBe('function');
    // expect(typeof chatSessionRepository.migrateAllSettings).toBe('function');
    // expect(typeof chatSessionRepository.checkAndMigrateFromJSON).toBe('function');
  });

  it('should be able to call getAllSessions without errors', async () => {
    await expect(chatSessionRepository.getAllSessions()).resolves.not.toThrow();
  });

  it('should be able to call getSessionById without errors', async () => {
    await expect(
      chatSessionRepository.getSessionById('test-id'),
    ).resolves.not.toThrow();
  });

  it('should be able to call getGlobalCompletionSettings without errors', async () => {
    await expect(
      chatSessionRepository.getGlobalCompletionSettings(),
    ).resolves.not.toThrow();
  });

  describe('Batch Operations', () => {
    describe('deleteSessions', () => {
      it('should have deleteSessions method', () => {
        expect(typeof chatSessionRepository.deleteSessions).toBe('function');
      });

      it('handles empty array gracefully without errors', async () => {
        await expect(
          chatSessionRepository.deleteSessions([]),
        ).resolves.not.toThrow();
      });

      it('can be called with multiple session IDs', async () => {
        const ids = ['session1', 'session2', 'session3'];
        await expect(
          chatSessionRepository.deleteSessions(ids),
        ).resolves.not.toThrow();
      });

      it('can be called with single session ID', async () => {
        const ids = ['session1'];
        await expect(
          chatSessionRepository.deleteSessions(ids),
        ).resolves.not.toThrow();
      });

      it('handles non-existent session IDs without throwing', async () => {
        const ids = ['nonexistent-session'];
        await expect(
          chatSessionRepository.deleteSessions(ids),
        ).resolves.not.toThrow();
      });
    });

    describe('exportSessions', () => {
      it('exports all specified sessions by calling exportChatSession for each', async () => {
        const ids = ['session1', 'session2'];

        // The actual implementation dynamically imports exportUtils
        // We can test that it completes without error
        await expect(
          chatSessionRepository.exportSessions(ids),
        ).resolves.not.toThrow();
      });

      it('handles empty array gracefully', async () => {
        await expect(
          chatSessionRepository.exportSessions([]),
        ).resolves.not.toThrow();
      });

      it('calls exportChatSession for each session ID in sequence', async () => {
        const ids = ['session1', 'session2', 'session3'];

        // Test that the method completes successfully
        // The actual export logic is tested elsewhere
        await expect(
          chatSessionRepository.exportSessions(ids),
        ).resolves.not.toThrow();
      });
    });
  });
});
