import * as RNFS from '@dr.pogodin/react-native-fs';
import {Platform} from 'react-native';
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
import {hfAsModel} from '..';
import {processHFSearchResults} from '../hf';
import smolVlmModelInfo from '../../../jest/fixtures/hfApi/ggml-org__SmolVLM-500M-Instruct-GGUF.model.json';
import {withEachControl} from '../../../jest/fixtures/controlCharacters';

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

  describe('imported chat image URIs', () => {
    const tmp = RNFS.TemporaryDirectoryPath;
    const pickerUri = `file://${tmp}A1B2C3D4-E5F6-4789-ABCD-EF0123456789.jpg`;
    const sessionWith = (metadata: unknown) => ({
      id: 's1',
      title: 'Chat',
      date: '2024-01-01T12:00:00.000Z',
      messages: [
        {id: 'm1', author: 'user', text: 'look', type: 'text', metadata},
      ],
    });
    const importedMessage = (metadata: unknown) =>
      (validateImportedData(sessionWith(metadata)) as ImportedChatSession)
        .messages[0];

    it.each([
      `file://${tmp}..`,
      `file://${tmp}../..`,
      '/etc/hosts',
      'file:///data/local/tmp/x',
      '',
    ])('drops %p and keeps the message', bad => {
      const message = importedMessage({imageUris: [bad, pickerUri]});
      expect(message.metadata?.imageUris).toEqual([pickerUri]);
      expect(message.text).toBe('look');
      expect(message.author).toBe('user');
    });

    it('keeps only the picker URI and the other metadata', () => {
      const message = importedMessage({
        imageUris: [
          pickerUri,
          `file://${tmp}../files/x`,
          '/etc/hosts',
          'file:///data/local/tmp/a.jpg',
          '',
          7,
          `file://${tmp}other.jpg`,
          `file://${RNFS.CachesDirectoryPath}/chat_x_2024-01-01_12-00-00.json`,
        ],
        partialCompletionResult: {foo: 1},
      });
      expect(message.metadata).toEqual({
        imageUris: [pickerUri],
        partialCompletionResult: {foo: 1},
      });
    });

    it.each(
      withEachControl(c => [
        `file://${tmp}A1B2C3D4-E5F6-4789-ABCD-EF0123456789.j${c}pg`,
        `file://${tmp}A1B2C3D4-E5F6-4789-ABCD-EF0123456789.jpg${c}`,
      ]),
    )('drops %s and keeps the message', (_shown, uri) => {
      const message = importedMessage({imageUris: [uri, pickerUri]});
      expect(message.metadata?.imageUris).toEqual([pickerUri]);
      expect(message.text).toBe('look');
    });

    it.each(
      withEachControl(c => [
        `file://${RNFS.CachesDirectoryPath}/rn_image_picker_lib_temp_a${c}b.jpg`,
        `file://${RNFS.CachesDirectoryPath}/rn_image_picker_lib_temp_ab.jpg${c}`,
      ]),
    )('android drops %s and keeps the message', (_shown, uri) => {
      const savedOS = Platform.OS;
      Platform.OS = 'android';
      try {
        const androidPick = `file://${RNFS.CachesDirectoryPath}/rn_image_picker_lib_temp_ab.jpg`;
        const message = importedMessage({imageUris: [uri, androidPick]});
        expect(message.metadata?.imageUris).toEqual([androidPick]);
        expect(message.text).toBe('look');
      } finally {
        Platform.OS = savedOS;
      }
    });

    it.each(
      withEachControl(c => [
        `file://${tmp}${c}A1B2C3D4-E5F6-4789-ABCD-EF0123456789.jpg`,
        `${c}${pickerUri}`,
      ]),
    )('also drops %s, which other rules already reject', (_shown, uri) => {
      const message = importedMessage({imageUris: [uri, pickerUri]});
      expect(message.metadata?.imageUris).toEqual([pickerUri]);
    });

    it.each([null, 'file:///etc/hosts', {0: pickerUri}])(
      'a non-array imageUris %p becomes empty',
      imageUris => {
        expect(importedMessage({imageUris}).metadata?.imageUris).toEqual([]);
      },
    );

    it('defers to isAllowedChatImageUri for which entries are kept', () => {
      const guard = jest
        .spyOn(require('../chatImageUri'), 'isAllowedChatImageUri')
        .mockImplementation(uri => uri === '/etc/hosts');
      try {
        expect(
          importedMessage({imageUris: ['/etc/hosts', pickerUri]}).metadata
            ?.imageUris,
        ).toEqual(['/etc/hosts']);
      } finally {
        guard.mockRestore();
      }
    });

    it('leaves metadata without imageUris alone', () => {
      expect(importedMessage({other: 1}).metadata).toEqual({other: 1});
      expect(importedMessage(undefined).metadata).toBeUndefined();
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

        it.each(withEachControl(c => [`${c}https://h/a.png`]))(
          '%s is dropped as a non-remote value',
          async (_shown, thumbnail_url) => {
            const created = await importOne({...basePal, thumbnail_url});
            expect(created.thumbnail_url).toBeUndefined();
            expectRestKept(created);
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

      const CONTROL_CARRIERS: [string, Setter, (c: string) => string[]][] = [
        ['filename', FIELDS[0][1], c => [`x${c}.gguf`, `${c}x.gguf`]],
        ['hfModel.author', FIELDS[1][1], c => [`ggml${c}org`, `ggml-org${c}`]],
        ['hfModel.id', FIELDS[2][1], c => [`ggml-org/Smol${c}VLM`]],
        ['hfModelFile.rfilename', FIELDS[3][1], c => [`x${c}.gguf`]],
        ['mmproj sibling rfilename', setMmproj, c => [`a${c}b`]],
        ['author', FIELDS[5][1], c => [`ggml${c}org`]],
        ['repo', FIELDS[6][1], c => [`Smol${c}VLM`]],
        ['id', FIELDS[7][1], c => [`ggml-org/SmolVLM/x${c}.gguf`]],
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

          describe.each(CONTROL_CARRIERS)(
            '%s with a control character',
            (_field, set, carriers) => {
              it.each(withEachControl(carriers))(
                '%s drops the model, keeps the pal',
                async (_shown, v) => {
                  const created = await importOne({
                    ...basePal,
                    [modelKey]: withField(set, v),
                  });
                  expect(created[modelKey]).toBeUndefined();
                  expectRestKept(created);
                },
              );
            },
          );
        },
      );

      describe('local model fullPath', () => {
        const localModel = (fullPath: string) => ({
          id: 'local-model-id',
          author: '',
          name: 'm.gguf',
          filename: 'm.gguf',
          fullPath,
          isLocal: true,
          origin: 'local',
        });

        it.each([
          '/x/models/local/..',
          '/x/models/local/../..',
          '/etc/hosts',
          'file:///data/local/tmp/x',
          '/x/models/local/a\u0000b',
        ])('%j drops the model, keeps the pal', async fullPath => {
          const created = await importOne({
            ...basePal,
            defaultModel: localModel(fullPath),
            promptGenerationModel: localModel(fullPath),
          });
          expect(created.defaultModel).toBeUndefined();
          expect(created.promptGenerationModel).toBeUndefined();
          expectRestKept(created);
        });

        it.each(['/docs/models/local/m.gguf', ''])(
          '%j is kept',
          async fullPath => {
            const ref = localModel(fullPath);
            const created = await importOne({...basePal, defaultModel: ref});
            expect(created.defaultModel).toEqual(ref);
          },
        );
      });

      describe('model filename', () => {
        const capturedRef = () => {
          const [listed] = processHFSearchResults([smolVlmModelInfo as any]);
          const file = listed.siblings.find(
            f => f.rfilename === 'SmolVLM-500M-Instruct-Q8_0.gguf',
          )!;
          return asJson(hfAsModel(listed, file));
        };

        it('keeps an HF ref built from the captured HF response', async () => {
          const ref = capturedRef();
          const created = await importOne({...basePal, defaultModel: ref});
          expect(created.defaultModel).toEqual(ref);
        });

        it.each(['pocketpalai.db', 'x.bin', 'models', 'pal-images'])(
          'drops an HF ref whose filename is %p, keeps the pal',
          async filename => {
            const created = await importOne({
              ...basePal,
              defaultModel: {...capturedRef(), filename},
              promptGenerationModel: {
                id: 'srv/m',
                origin: 'remote',
                filename,
              },
            });
            expect(created.defaultModel).toBeUndefined();
            expect(created.promptGenerationModel).toBeUndefined();
            expectRestKept(created);
          },
        );
      });

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
