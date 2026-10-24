import * as RNFS from '@dr.pogodin/react-native-fs';
import {pick} from '@react-native-documents/picker';
import {palStore} from '../../store';
import {
  readJsonFile,
  validateImportedData,
  ImportedChatSession,
  importPals,
} from '../importUtils';

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

  describe('imported chat image URIs', () => {
    const tmp = RNFS.TemporaryDirectoryPath;
    const pickerUri = `file://${tmp}A1B2C3D4-E5F6-4789-ABCD-EF0123456789.jpg`;
    const importedMessage = (metadata: unknown) =>
      (
        validateImportedData({
          id: 's1',
          title: 'Chat',
          date: '2024-01-01T12:00:00.000Z',
          messages: [
            {id: 'm1', author: 'user', text: 'look', type: 'text', metadata},
          ],
        }) as ImportedChatSession
      ).messages[0];

    it.each([
      `file://${tmp}..`,
      `file://${tmp}../..`,
      '/etc/hosts',
      'file:///data/local/tmp/x',
      '',
      `file://${tmp}A1B2C3D4-E5F6-4789-ABCD-EF0123456789.j\u0000pg`,
    ])('drops %j and keeps the message', bad => {
      const message = importedMessage({imageUris: [bad, pickerUri]});
      expect(message.metadata?.imageUris).toEqual([pickerUri]);
      expect(message.text).toBe('look');
    });

    it('turns a non-array imageUris into an empty list', () => {
      expect(
        importedMessage({imageUris: 'file:///etc/hosts'}).metadata?.imageUris,
      ).toEqual([]);
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

      it('does not write a base64 thumbnail whose generated name is unsafe', async () => {
        jest.spyOn(require('uuid'), 'v4').mockReturnValueOnce('../x');
        (RNFS.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify([mockImportedPalWithBase64]),
        );

        expect(await importPals()).toBe(1);

        expect(RNFS.writeFile).not.toHaveBeenCalled();
        const created = (palStore.createPal as jest.Mock).mock.calls[0][0];
        expect(created.thumbnail_url).toBeUndefined();
      });

      const importThumbnail = async (thumbnail_url: unknown) => {
        (RNFS.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify({...mockImportedPal, thumbnail_url}),
        );
        expect(await importPals()).toBe(1);
        return (palStore.createPal as jest.Mock).mock.calls[0][0];
      };

      it.each([
        '..',
        '../..',
        '/etc/hosts',
        'file:///data/local/tmp/x',
        '',
        '\u0000https://h/a.png',
      ])('drops the thumbnail_url %j and keeps the pal', async url => {
        const created = await importThumbnail(url);
        expect(created.thumbnail_url).toBeUndefined();
        expect(created.name).toBe(mockImportedPal.name);
      });

      it('keeps an https thumbnail_url', async () => {
        const created = await importThumbnail('https://h/a.png');
        expect(created.thumbnail_url).toBe('https://h/a.png');
      });
    });
  });
});
