import * as RNFS from '@dr.pogodin/react-native-fs';
import {pick} from '@react-native-documents/picker';
import {palStore} from '../../store';
import {
  readJsonFile,
  validateImportedData,
  ImportedChatSession,
  importPals,
  isEncryptedBackup,
  pickAndReadBackup,
  restoreBackup,
} from '../importUtils';

// Stub exportUtils so importUtils doesn't pull in react-native-share etc.
// Only BACKUP_FORMAT is needed at runtime by isEncryptedBackup.
jest.mock('../exportUtils', () => ({
  BACKUP_FORMAT: 'pocketpal-backup',
}));

// Mock E2EE service for restoreBackup's decrypt path.
const mockDecrypt = jest.fn();
const mockDeriveKey = jest.fn().mockResolvedValue('mock-key');
jest.mock('../../services/encryption', () => ({
  getE2EEService: () => ({
    generateSalt: jest.fn().mockReturnValue('mock-salt'),
    deriveKeyFromPassword: mockDeriveKey,
    decrypt: mockDecrypt,
  }),
}));

import {chatSessionRepository} from '../../repositories/ChatSessionRepository';

describe('importUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('readJsonFile', () => {
    it('should read and parse a JSON file successfully', async () => {
      // Setup
      const mockJsonData = '{"test":"data"}';
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(mockJsonData);

      // Execute
      const result = await readJsonFile('file:///mock/path/test.json');

      // Verify
      expect(RNFS.readFile).toHaveBeenCalled();
      expect(result).toEqual({test: 'data'});
    });
  });

  describe('validateImportedData', () => {
    it('should validate a single session correctly', () => {
      // Setup
      const mockSession = {
        id: 'test-id',
        title: 'Test Session',
        date: '2024-01-01T12:00:00.000Z',
        messages: [
          {
            id: 'msg1',
            author: 'user',
            text: 'Hello',
            type: 'text',
          },
        ],
        completionSettings: {
          temperature: 0.7,
        },
      };

      // Execute
      const result = validateImportedData(mockSession);

      // Verify
      expect(result).toEqual(mockSession);
    });

    it('should add missing fields with default values', () => {
      // Setup
      const incompleteSession = {
        title: 'Incomplete Session',
      };

      // Execute
      const result = validateImportedData(
        incompleteSession,
      ) as ImportedChatSession;

      // Verify
      expect(result.id).toMatch(/^mock-uuid-12345/); // UUID will have random component
      expect(result.date).toBeDefined();
      expect(result.messages).toEqual([]);
      expect(result.completionSettings).toBeDefined();
    });
  });

  describe('Pal Import Functions', () => {
    const mockImportedPal = {
      version: '2.0',
      id: 'imported-pal-1',
      name: 'Imported Pal',
      description: 'An imported pal',
      thumbnail_url: 'https://example.com/image.jpg',
      systemPrompt: 'You are a helpful assistant',
      originalSystemPrompt: 'You are a helpful assistant',
      isSystemPromptChanged: false,
      useAIPrompt: false,
      defaultModel: 'test-model',
    };

    const mockImportedPalWithBase64 = {
      ...mockImportedPal,
      thumbnail_data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD',
      thumbnail_url: undefined,
    };

    beforeEach(() => {
      jest.clearAllMocks();
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      (RNFS.mkdir as jest.Mock).mockResolvedValue(undefined);
      (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);

      // Mock document picker to return a file
      (pick as jest.Mock).mockResolvedValue([
        {
          uri: 'file://path/to/pals.json',
          name: 'pals.json',
          type: 'application/json',
        },
      ]);
    });

    describe('importPals', () => {
      it('should return 0 when user cancels file picker', async () => {
        (pick as jest.Mock).mockResolvedValue(null);

        const result = await importPals();

        expect(result).toBe(0);
      });

      it('should handle file read errors', async () => {
        (RNFS.readFile as jest.Mock).mockRejectedValue(
          new Error('File read failed'),
        );

        await expect(importPals()).rejects.toThrow(
          'Failed to read or parse the selected file',
        );
      });

      it('should import pal with remote thumbnail URL', async () => {
        (RNFS.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify([mockImportedPal]),
        );

        const result = await importPals();

        expect(result).toBe(1); // Should return number of imported pals
        // Note: We can't easily test the mock calls with the centralized mock
        // but we can verify the function returns the correct count
      });

      it('should import pal with base64 thumbnail and save as local file', async () => {
        (RNFS.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify([mockImportedPalWithBase64]),
        );

        const result = await importPals();

        expect(result).toBe(1);
        // Should create pal-images directory
        expect(RNFS.mkdir).toHaveBeenCalledWith(
          expect.stringContaining('/pal-images'),
        );

        // Should write base64 data to file
        expect(RNFS.writeFile).toHaveBeenCalledWith(
          expect.stringContaining('_thumbnail.jpeg'),
          '/9j/4AAQSkZJRgABAQEAYABgAAD',
          'base64',
        );
      });

      it('should handle base64 thumbnail save errors gracefully', async () => {
        (RNFS.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify([mockImportedPalWithBase64]),
        );
        (RNFS.writeFile as jest.Mock).mockRejectedValue(
          new Error('Write failed'),
        );

        const result = await importPals();

        expect(result).toBe(1);
        // Function should still succeed even if thumbnail save fails
      });

      it('should import multiple pals', async () => {
        const multiplePals = [
          mockImportedPal,
          {...mockImportedPal, id: 'imported-pal-2', name: 'Second Pal'},
        ];
        (RNFS.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify(multiplePals),
        );

        const result = await importPals();

        expect(result).toBe(2);
      });

      it('should handle single pal import', async () => {
        (RNFS.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify(mockImportedPal),
        );

        const result = await importPals();

        expect(result).toBe(1);
      });

      // pact (talent set) and greeting are first-class persisted state.
      // The transform path MUST forward them onto palStore.createPal so a
      // re-imported Pal keeps its tools and greeting.
      it('preserves pact (talents) and greeting through import', async () => {
        const palWithTalents = {
          ...mockImportedPal,
          pact: {
            talents: [
              {name: 'calculate'},
              {name: 'render_html', required: true},
            ],
          },
          greeting: {
            text: 'Hello! How can I help you today?',
            suggestedPrompts: ['Tell me a joke', 'Summarize this'],
          },
        };
        (RNFS.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify(palWithTalents),
        );

        await importPals();

        expect(palStore.createPal).toHaveBeenCalledTimes(1);
        const created = (palStore.createPal as jest.Mock).mock.calls[0][0];
        expect(created.pact).toEqual(palWithTalents.pact);
        expect(created.greeting).toEqual(palWithTalents.greeting);
      });
    });
  });

  describe('Encrypted backup restore', () => {
    const mockPal = {
      version: '2.0',
      id: 'pal-1',
      name: 'Pal',
      description: '',
      thumbnail_url: 'https://example.com/x.jpg',
      systemPrompt: 'sp',
      originalSystemPrompt: 'sp',
      isSystemPromptChanged: false,
      useAIPrompt: false,
      defaultModel: 'm',
    };

    const mockChat = {
      schemaVersion: 1,
      id: 'c1',
      title: 'Chat',
      date: '2024-01-01T00:00:00.000Z',
      messages: [{id: 'm1', author: 'user', text: 'hi', type: 'text'}],
      completionSettings: {temperature: 0.7},
    };

    describe('isEncryptedBackup', () => {
      it('returns true for a pocketpal-backup envelope', () => {
        const envelope = {
          format: 'pocketpal-backup',
          schemaVersion: 1,
          encrypted: true,
          encryption: {version: 1, salt: 's', iv: 'i', ciphertext: 'c'},
        };
        expect(isEncryptedBackup(envelope)).toBe(true);
      });

      it('returns false for plain chat data', () => {
        expect(isEncryptedBackup(mockChat)).toBe(false);
        expect(isEncryptedBackup([mockChat])).toBe(false);
        expect(isEncryptedBackup(null)).toBe(false);
      });

      it('returns false when encryption metadata is incomplete', () => {
        expect(
          isEncryptedBackup({
            format: 'pocketpal-backup',
            encrypted: true,
            encryption: {salt: 's'},
          }),
        ).toBe(false);
      });
    });

    describe('restoreBackup — encrypted', () => {
      const buildEnvelope = () => ({
        format: 'pocketpal-backup',
        schemaVersion: 1,
        encrypted: true,
        encryption: {
          version: 1,
          salt: 'mock-salt',
          iv: 'mock-iv',
          ciphertext: 'mock-ciphertext',
        },
      });

      beforeEach(() => {
        mockDecrypt.mockReset();
        mockDeriveKey.mockClear();
        (palStore.createPal as jest.Mock).mockClear();
      });

      it('throws when no password is supplied for an encrypted envelope', async () => {
        await expect(restoreBackup(buildEnvelope())).rejects.toThrow(
          'Password is required',
        );
      });

      it('decrypts and imports chats + pals', async () => {
        mockDecrypt.mockResolvedValue(
          JSON.stringify({chats: [mockChat], pals: [mockPal]}),
        );
        const createSpy = jest
          .spyOn(chatSessionRepository, 'createSession')
          .mockResolvedValue({id: 'x'} as any);

        const result = await restoreBackup(buildEnvelope(), 'pw');

        expect(mockDeriveKey).toHaveBeenCalledWith('pw', 'mock-salt');
        expect(mockDecrypt).toHaveBeenCalledWith(
          {iv: 'mock-iv', ciphertext: 'mock-ciphertext', version: 1},
          'mock-key',
        );
        expect(createSpy).toHaveBeenCalledTimes(1);
        expect(palStore.createPal).toHaveBeenCalledTimes(1);
        expect(result).toEqual({chats: 1, pals: 1});

        createSpy.mockRestore();
      });

      it('surfaces a clear error on wrong password (decrypt throws)', async () => {
        mockDecrypt.mockRejectedValue(new Error('bad key'));

        await expect(restoreBackup(buildEnvelope(), 'wrong')).rejects.toThrow(
          'Failed to decrypt backup',
        );
      });
    });

    describe('restoreBackup — plain routing', () => {
      beforeEach(() => {
        (palStore.createPal as jest.Mock).mockClear();
      });

      it('routes a plain chat array to chat import', async () => {
        const createSpy = jest
          .spyOn(chatSessionRepository, 'createSession')
          .mockResolvedValue({id: 'x'} as any);

        const result = await restoreBackup([mockChat]);

        expect(result).toEqual({chats: 1, pals: 0});
        expect(createSpy).toHaveBeenCalledTimes(1);
        expect(palStore.createPal).not.toHaveBeenCalled();
        createSpy.mockRestore();
      });

      it('routes a plain pal array to pal import', async () => {
        const result = await restoreBackup([mockPal]);

        expect(result).toEqual({chats: 0, pals: 1});
        expect(palStore.createPal).toHaveBeenCalledTimes(1);
      });

      it('routes a single pal object to pal import', async () => {
        const result = await restoreBackup(mockPal);
        expect(result).toEqual({chats: 0, pals: 1});
      });

      it('throws on unrecognized shapes', async () => {
        await expect(restoreBackup({foo: 'bar'})).rejects.toThrow(
          'Unrecognized backup format',
        );
      });
    });

    describe('pickAndReadBackup', () => {
      it('returns needsPassword=true for an encrypted envelope', async () => {
        (pick as jest.Mock).mockResolvedValue([
          {uri: 'file:///b.json', name: 'b.json', type: 'application/json'},
        ]);
        (RNFS.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify({
            format: 'pocketpal-backup',
            schemaVersion: 1,
            encrypted: true,
            encryption: {version: 1, salt: 's', iv: 'i', ciphertext: 'c'},
          }),
        );

        const result = await pickAndReadBackup();
        expect(result.needsPassword).toBe(true);
      });

      it('returns needsPassword=false for plain data', async () => {
        (pick as jest.Mock).mockResolvedValue([
          {uri: 'file:///c.json', name: 'c.json', type: 'application/json'},
        ]);
        (RNFS.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify([mockChat]),
        );

        const result = await pickAndReadBackup();
        expect(result.needsPassword).toBe(false);
        expect(Array.isArray(result.data)).toBe(true);
      });

      it('returns null data when the picker is cancelled', async () => {
        (pick as jest.Mock).mockResolvedValue(null);

        const result = await pickAndReadBackup();
        expect(result.data).toBeNull();
      });
    });
  });
});
