import * as RNFS from '@dr.pogodin/react-native-fs';

import {validateLocalModelFileForLoad} from '../modelFileValidation';

describe('validateLocalModelFileForLoad', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.stat as jest.Mock).mockResolvedValue({size: 2 * 10 ** 9});
    (RNFS.read as jest.Mock).mockResolvedValue('GGUF');
  });

  it('passes for a healthy single-file model', async () => {
    await expect(
      validateLocalModelFileForLoad({
        entryPath: '/models/model.gguf',
        storageRoot: '/models',
        expectedSize: 2 * 10 ** 9,
      }),
    ).resolves.toBeUndefined();
  });

  it('passes for a healthy split model', async () => {
    (RNFS.stat as jest.Mock).mockResolvedValue({size: 3 * 10 ** 9});
    await expect(
      validateLocalModelFileForLoad({
        entryPath: '/models/a-00001-of-00002.gguf',
        storageRoot: '/models',
        expectedSize: 3 * 10 ** 9,
        splitParts: ['a-00001-of-00002.gguf', 'a-00002-of-00002.gguf'],
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects a missing entry file', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValueOnce(false);
    await expect(
      validateLocalModelFileForLoad({
        entryPath: '/models/gone.gguf',
        storageRoot: '/models',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('rejects a split model with missing parts', async () => {
    (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
      Promise.resolve(!path.endsWith('00002-of-00002.gguf')),
    );
    await expect(
      validateLocalModelFileForLoad({
        entryPath: '/models/a-00001-of-00002.gguf',
        storageRoot: '/models',
        splitParts: ['a-00001-of-00002.gguf', 'a-00002-of-00002.gguf'],
      }),
    ).rejects.toThrow(/incomplete.*missing 1 file/i);
  });

  it('rejects an empty file', async () => {
    (RNFS.stat as jest.Mock).mockResolvedValueOnce({size: 0});
    await expect(
      validateLocalModelFileForLoad({
        entryPath: '/models/empty.gguf',
        storageRoot: '/models',
      }),
    ).rejects.toThrow(/empty/i);
  });

  it('skips size checks when the size is unknown', async () => {
    (RNFS.stat as jest.Mock).mockResolvedValueOnce({});
    await expect(
      validateLocalModelFileForLoad({
        entryPath: '/models/unknown.gguf',
        storageRoot: '/models',
        expectedSize: 2 * 10 ** 9,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects a clearly truncated download', async () => {
    (RNFS.stat as jest.Mock).mockResolvedValueOnce({size: 100 * 10 ** 6});
    await expect(
      validateLocalModelFileForLoad({
        entryPath: '/models/half.gguf',
        storageRoot: '/models',
        expectedSize: 2 * 10 ** 9,
      }),
    ).rejects.toThrow(/incomplete/i);
  });

  it('rejects a non-GGUF payload (e.g. an HTML error page)', async () => {
    (RNFS.read as jest.Mock).mockResolvedValueOnce('<!DO');
    await expect(
      validateLocalModelFileForLoad({
        entryPath: '/models/fake.gguf',
        storageRoot: '/models',
      }),
    ).rejects.toThrow(/not a valid GGUF/i);
  });
});
