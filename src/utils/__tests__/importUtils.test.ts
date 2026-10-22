import * as RNFS from '@dr.pogodin/react-native-fs';
import {pick} from '@react-native-documents/picker';
import {palStore} from '../../store';
import {
  readJsonFile,
  validateImportedData,
  ImportedChatSession,
  importPals,
} from '../importUtils';
import {exportPal} from '../exportUtils';
import {LOOKIE_DEFAULT_MODEL} from '../../store/builtinPalModels';

jest.mock('react-native-share', () => ({
  open: jest.fn().mockResolvedValue({success: true}),
}));

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

      it('does not write a base64 thumbnail whose generated name is unsafe', async () => {
        jest.spyOn(require('uuid'), 'v4').mockReturnValueOnce('../x');
        (RNFS.readFile as jest.Mock).mockResolvedValue(
          JSON.stringify([mockImportedPalWithBase64]),
        );

        expect(await importPals()).toBe(1);

        expect(RNFS.exists).not.toHaveBeenCalled();
        expect(RNFS.mkdir).not.toHaveBeenCalled();
        expect(RNFS.writeFile).not.toHaveBeenCalled();
        const created = (palStore.createPal as jest.Mock).mock.calls[0][0];
        expect(created.thumbnail_url).toBeUndefined();
        expect(created.name).toBe(mockImportedPal.name);
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

    describe('path-forming fields', () => {
      const BAD_VALUES = [
        '..',
        '../..',
        '/etc/hosts',
        'file:///data/local/tmp/x',
      ];
      const pact = {talents: [{name: 'calculate'}]};
      const basePal = {...mockImportedPal, defaultModel: undefined, pact};
      const asJson = (v: unknown) => JSON.parse(JSON.stringify(v));

      const importOne = async (pal: object) => {
        (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify(pal));
        expect(await importPals()).toBe(1);
        return (palStore.createPal as jest.Mock).mock.calls[0][0];
      };

      const expectRestKept = (created: any) => {
        expect(created.name).toBe(basePal.name);
        expect(created.systemPrompt).toBe(basePal.systemPrompt);
        expect(created.pact).toEqual(pact);
      };

      describe('thumbnail_url without thumbnail_data', () => {
        it.each([...BAD_VALUES, ''])('%p is dropped', async thumbnail_url => {
          const created = await importOne({...basePal, thumbnail_url});
          expect(created.thumbnail_url).toBeUndefined();
          expectRestKept(created);
        });

        it.each(['https://h/a.png', 'http://h/a.png'])(
          '%s is kept',
          async thumbnail_url => {
            const created = await importOne({...basePal, thumbnail_url});
            expect(created.thumbnail_url).toBe(thumbnail_url);
          },
        );

        it('a non-string value is dropped', async () => {
          const created = await importOne({...basePal, thumbnail_url: 7});
          expect(created.thumbnail_url).toBeUndefined();
        });
      });

      type Setter = (ref: any, v: unknown) => void;
      const setMmproj: Setter = (ref, v) => {
        ref.hfModel.siblings[1].rfilename = `${v}/mmproj-x.gguf`;
      };
      const FIELDS: [string, Setter, boolean][] = [
        ['filename', (ref, v) => (ref.filename = v), true],
        ['hfModel.author', (ref, v) => (ref.hfModel.author = v), true],
        ['hfModel.id', (ref, v) => (ref.hfModel.id = v), false],
        [
          'hfModelFile.rfilename',
          (ref, v) => (ref.hfModelFile.rfilename = v),
          false,
        ],
        ['mmproj sibling rfilename', setMmproj, false],
        ['author', (ref, v) => (ref.author = v), true],
        ['repo', (ref, v) => (ref.repo = v), true],
        ['id', (ref, v) => (ref.id = v), true],
      ];

      const withField = (set: Setter, v: unknown) => {
        const ref = asJson(LOOKIE_DEFAULT_MODEL);
        set(ref, v);
        return ref;
      };

      describe.each(['defaultModel', 'promptGenerationModel'])(
        '%s',
        modelKey => {
          it('a shipped HF model ref is kept unchanged', async () => {
            const created = await importOne({
              ...basePal,
              [modelKey]: LOOKIE_DEFAULT_MODEL,
            });
            expect(created[modelKey]).toEqual(asJson(LOOKIE_DEFAULT_MODEL));
          });

          describe.each(FIELDS)('%s', (_field, set, emptyAllowed) => {
            it.each(BAD_VALUES)(
              '%p drops the model, keeps the pal',
              async v => {
                const created = await importOne({
                  ...basePal,
                  [modelKey]: withField(set, v),
                });
                expect(created[modelKey]).toBeUndefined();
                expectRestKept(created);
              },
            );

            it(`'' is ${emptyAllowed ? 'kept' : 'dropped'}`, async () => {
              const ref = withField(set, '');
              const created = await importOne({...basePal, [modelKey]: ref});
              expect(created[modelKey]).toEqual(emptyAllowed ? ref : undefined);
            });
          });
        },
      );

      it('drops each traversing model ref and keeps the pal', async () => {
        const lookie = () => asJson(LOOKIE_DEFAULT_MODEL);
        const pals = [
          ...['../../x.gguf', 'Q4/z/..', 'Q4'].map(rfilename => {
            const ref = lookie();
            ref.hfModelFile.rfilename = rfilename;
            return {...basePal, defaultModel: ref};
          }),
          (() => {
            const ref = lookie();
            ref.hfModel.id = 'a/..';
            return {...basePal, promptGenerationModel: ref};
          })(),
          {...basePal, defaultModel: {...lookie(), filename: 'a//b.gguf'}},
        ];
        (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify(pals));

        expect(await importPals()).toBe(pals.length);

        for (const [created] of (palStore.createPal as jest.Mock).mock.calls) {
          expect(created.defaultModel).toBeUndefined();
          expect(created.promptGenerationModel).toBeUndefined();
          expectRestKept(created);
        }
      });

      describe('export then import round trip', () => {
        const hfRef = (() => {
          const ref = asJson(LOOKIE_DEFAULT_MODEL);
          ref.id = `${ref.hfModel.id}/Q4/x.gguf`;
          ref.filename = 'Q4/x.gguf';
          ref.hfModelFile.rfilename = 'Q4/x.gguf';
          ref.author = null;
          return ref;
        })();
        const localRef = {
          id: 'local-model-id',
          author: '',
          name: 'x.gguf',
          filename: 'x.gguf',
          fullPath: '/docs/models/local/x.gguf',
          isLocal: true,
          origin: 'local',
        };
        const remoteRef = {
          id: 'srv//models/x.gguf',
          author: 'Home/Mac',
          name: 'x',
          filename: '',
          isLocal: false,
          origin: 'remote',
        };

        const exportThenImport = async (pal: object) => {
          let exported = '';
          (RNFS.readFile as jest.Mock).mockImplementation(
            async (path: string) =>
              path.includes('/pal-images/') ? 'aGVsbG8=' : exported,
          );
          (palStore.pals as any) = [pal];
          await exportPal('round-trip');
          exported = (RNFS.writeFile as jest.Mock).mock.calls.at(-1)[1];
          (RNFS.writeFile as jest.Mock).mockClear();
          (palStore.createPal as jest.Mock).mockClear();
          await importPals();
          return (palStore.createPal as jest.Mock).mock.calls[0][0];
        };

        const exportablePal = {
          ...basePal,
          id: 'round-trip',
          type: 'local',
          source: 'local',
          parameters: {},
          parameterSchema: [],
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        };

        it('keeps HF, LOCAL and remote refs and restores the local thumbnail', async () => {
          const created = await exportThenImport({
            ...exportablePal,
            thumbnail_url: 'round-trip_thumbnail.png',
            defaultModel: hfRef,
            promptGenerationModel: localRef,
          });

          expect(created.defaultModel).toEqual(hfRef);
          expect(created.promptGenerationModel).toEqual(localRef);
          expect(created.thumbnail_url).toMatch(/_thumbnail\.png$/);
          expect(RNFS.writeFile).toHaveBeenCalledWith(
            expect.stringMatching(/\/pal-images\/[^/]+_thumbnail\.png$/),
            'aGVsbG8=',
            'base64',
          );

          const remote = await exportThenImport({
            ...exportablePal,
            defaultModel: remoteRef,
          });
          expect(remote.defaultModel).toEqual(remoteRef);
        });

        it('drops the remote ref once it carries a traversing hfModelFile', async () => {
          const created = await exportThenImport({
            ...exportablePal,
            defaultModel: {
              ...remoteRef,
              hfModelFile: {rfilename: '../../x.gguf'},
            },
          });
          expect(created.defaultModel).toBeUndefined();
          expect(created.name).toBe(exportablePal.name);
        });
      });
    });
  });
});
