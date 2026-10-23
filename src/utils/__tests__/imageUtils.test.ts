// Mock RNFS with our expected path first
const mockDocumentPath = '/mock/documents';
jest.mock('@dr.pogodin/react-native-fs', () => ({
  exists: jest.fn(),
  mkdir: jest.fn(),
  downloadFile: jest.fn(),
  unlink: jest.fn(),
  readDir: jest.fn(),
  DocumentDirectoryPath: '/mock/documents',
}));

import * as RNFS from '@dr.pogodin/react-native-fs';
import {
  downloadPalThumbnail,
  deletePalThumbnail,
  localThumbnailExists,
  getLocalThumbnailPath,
  cleanupOrphanedThumbnails,
  getAbsoluteThumbnailPath,
  getFullThumbnailUri,
} from '../imageUtils';
import {isSafePathSegment} from '../pathGuard';
import {withEachControl} from '../../../jest/fixtures/controlCharacters';

const mockRNFS = RNFS as jest.Mocked<typeof RNFS>;

describe('imageUtils', () => {
  const mockPalId = 'test-pal-123';
  const mockImageUrl = 'https://example.com/image.jpg';
  const expectedLocalPath = `${mockDocumentPath}/pal-images/${mockPalId}_thumbnail.jpg`;
  const expectedFilename = `${mockPalId}_thumbnail.jpg`;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('downloadPalThumbnail', () => {
    it('should create directory and download image successfully', async () => {
      // Setup mocks
      mockRNFS.exists.mockResolvedValueOnce(false); // Directory doesn't exist
      mockRNFS.mkdir.mockResolvedValueOnce(undefined);
      mockRNFS.exists.mockResolvedValueOnce(false); // File doesn't exist
      mockRNFS.downloadFile.mockReturnValueOnce({
        jobId: 1,
        promise: Promise.resolve({statusCode: 200}),
      } as any);

      // Execute
      const result = await downloadPalThumbnail(mockPalId, mockImageUrl);

      // Verify
      expect(mockRNFS.mkdir).toHaveBeenCalledWith(
        `${mockDocumentPath}/pal-images`,
      );
      expect(mockRNFS.downloadFile).toHaveBeenCalledWith({
        fromUrl: mockImageUrl,
        toFile: expectedLocalPath,
        background: false,
        discretionary: false,
        progressInterval: 1000,
      });
      expect(result).toBe(expectedFilename);
    });

    it('should return existing file path if image already exists', async () => {
      // Setup mocks
      mockRNFS.exists.mockResolvedValueOnce(true); // Directory exists
      mockRNFS.exists.mockResolvedValueOnce(true); // File exists

      // Execute
      const result = await downloadPalThumbnail(mockPalId, mockImageUrl);

      // Verify
      expect(mockRNFS.downloadFile).not.toHaveBeenCalled();
      expect(result).toBe(expectedFilename);
    });

    it('should throw error if download fails', async () => {
      // Setup mocks
      mockRNFS.exists.mockResolvedValueOnce(true); // Directory exists
      mockRNFS.exists.mockResolvedValueOnce(false); // File doesn't exist
      mockRNFS.downloadFile.mockReturnValueOnce({
        jobId: 1,
        promise: Promise.resolve({statusCode: 404}),
      } as any);

      // Execute & Verify
      await expect(
        downloadPalThumbnail(mockPalId, mockImageUrl),
      ).rejects.toThrow('Download failed with status: 404');
    });
  });

  describe('deletePalThumbnail', () => {
    it('should delete existing file', async () => {
      // Setup mocks
      mockRNFS.exists.mockResolvedValueOnce(true);
      mockRNFS.unlink.mockResolvedValueOnce(undefined);

      // Execute
      await deletePalThumbnail(expectedFilename);

      // Verify
      expect(mockRNFS.exists).toHaveBeenCalledWith(expectedLocalPath);
      expect(mockRNFS.unlink).toHaveBeenCalledWith(expectedLocalPath);
    });

    it('should not fail if file does not exist', async () => {
      // Setup mocks
      mockRNFS.exists.mockResolvedValueOnce(false);

      // Execute
      await deletePalThumbnail(expectedFilename);

      // Verify
      expect(mockRNFS.exists).toHaveBeenCalledWith(expectedLocalPath);
      expect(mockRNFS.unlink).not.toHaveBeenCalled();
    });
  });

  describe('localThumbnailExists', () => {
    it('should return true if file exists', async () => {
      mockRNFS.exists.mockResolvedValueOnce(true);

      const result = await localThumbnailExists(expectedFilename);

      expect(result).toBe(true);
      expect(mockRNFS.exists).toHaveBeenCalledWith(expectedLocalPath);
    });

    it('should return false if file does not exist', async () => {
      mockRNFS.exists.mockResolvedValueOnce(false);

      const result = await localThumbnailExists(expectedFilename);

      expect(result).toBe(false);
    });
  });

  describe('getLocalThumbnailPath', () => {
    it('should return filename if file exists', async () => {
      mockRNFS.exists.mockResolvedValueOnce(true);

      const result = await getLocalThumbnailPath(mockPalId, mockImageUrl);

      expect(result).toBe(expectedFilename);
    });

    it('should return null if file does not exist', async () => {
      mockRNFS.exists.mockResolvedValueOnce(false);

      const result = await getLocalThumbnailPath(mockPalId, mockImageUrl);

      expect(result).toBe(null);
    });
  });

  describe('cleanupOrphanedThumbnails', () => {
    it('should remove thumbnails for inactive pal IDs', async () => {
      const activePalIds = ['pal-1', 'pal-2'];
      const mockFiles = [
        {
          name: 'pal-1_thumbnail.jpg',
          path: '/path/pal-1_thumbnail.jpg',
          isFile: () => true,
        },
        {
          name: 'pal-2_thumbnail.png',
          path: '/path/pal-2_thumbnail.png',
          isFile: () => true,
        },
        {
          name: 'pal-3_thumbnail.jpg',
          path: '/path/pal-3_thumbnail.jpg',
          isFile: () => true,
        }, // Orphaned
        {
          name: 'other-file.txt',
          path: '/path/other-file.txt',
          isFile: () => true,
        },
      ];

      mockRNFS.exists.mockResolvedValueOnce(true); // Directory exists
      mockRNFS.readDir.mockResolvedValueOnce(mockFiles as any);
      mockRNFS.unlink.mockResolvedValue(undefined);

      await cleanupOrphanedThumbnails(activePalIds);

      // Should only delete the orphaned thumbnail
      expect(mockRNFS.unlink).toHaveBeenCalledTimes(1);
      expect(mockRNFS.unlink).toHaveBeenCalledWith('/path/pal-3_thumbnail.jpg');
    });

    it('should handle missing directory gracefully', async () => {
      mockRNFS.exists.mockResolvedValueOnce(false); // Directory doesn't exist
      (mockRNFS as any).readDir = jest.fn();

      await cleanupOrphanedThumbnails(['pal-1']);

      expect((mockRNFS as any).readDir).not.toHaveBeenCalled();
      expect(mockRNFS.unlink).not.toHaveBeenCalled();
    });
  });
  describe('getFullThumbnailUri', () => {
    it.each([
      '..',
      '../..',
      '../../Library/x',
      '/etc/hosts',
      'file:///data/local/tmp/x',
      'a\u0000b',
      '',
    ])('%j gives no local URI', name => {
      expect(getFullThumbnailUri(name)).toBeUndefined();
    });

    it('returns a remote URL unchanged', () => {
      expect(getFullThumbnailUri('https://h/t.png')).toBe('https://h/t.png');
      expect(getFullThumbnailUri('http://h/t.png')).toBe('http://h/t.png');
    });

    it('returns a pal-images file URI for a plain name', () => {
      expect(getFullThumbnailUri(expectedFilename)).toBe(
        `file://${expectedLocalPath}`,
      );
    });
  });

  describe('thumbnail paths stay inside pal-images', () => {
    const palImagesDir = `${mockDocumentPath}/pal-images`;
    const UNSAFE_NAMES = [
      '..',
      '../..',
      '/etc/hosts',
      'file:///data/local/tmp/x',
      '',
      '../x',
    ];

    beforeEach(() => {
      mockRNFS.exists.mockReset();
      mockRNFS.mkdir.mockReset();
      mockRNFS.downloadFile.mockReset();
      mockRNFS.unlink.mockReset();
    });

    describe('getAbsoluteThumbnailPath', () => {
      it.each(UNSAFE_NAMES)('%p → null', name => {
        expect(getAbsoluteThumbnailPath(name)).toBeNull();
      });

      it('returns a direct child of pal-images for a plain name', () => {
        expect(getAbsoluteThumbnailPath(expectedFilename)).toBe(
          expectedLocalPath,
        );
      });
    });

    describe('deletePalThumbnail', () => {
      it.each(UNSAFE_NAMES)('%p: no exists and no unlink', async name => {
        await deletePalThumbnail(name);
        expect(mockRNFS.exists).not.toHaveBeenCalled();
        expect(mockRNFS.unlink).not.toHaveBeenCalled();
      });
    });

    describe('localThumbnailExists', () => {
      it.each(UNSAFE_NAMES)('%p → false without touching disk', async name => {
        mockRNFS.exists.mockResolvedValue(true);
        expect(await localThumbnailExists(name)).toBe(false);
        expect(mockRNFS.exists).not.toHaveBeenCalled();
      });
    });

    describe('control characters', () => {
      const names = withEachControl(c => [
        `${mockPalId}_thumbnail.j${c}pg`,
        `${c}${expectedFilename}`,
        `${expectedFilename}${c}`,
      ]);

      it.each(names)('getAbsoluteThumbnailPath(%s) → null', (_shown, name) => {
        expect(getAbsoluteThumbnailPath(name)).toBeNull();
      });

      it.each(names)(
        'deletePalThumbnail(%s): no exists and no unlink',
        async (_shown, name) => {
          await deletePalThumbnail(name);
          expect(mockRNFS.exists).not.toHaveBeenCalled();
          expect(mockRNFS.unlink).not.toHaveBeenCalled();
        },
      );

      it.each(names)(
        'localThumbnailExists(%s) → false without touching disk',
        async (_shown, name) => {
          mockRNFS.exists.mockResolvedValue(true);
          expect(await localThumbnailExists(name)).toBe(false);
          expect(mockRNFS.exists).not.toHaveBeenCalled();
        },
      );

      it.each(
        withEachControl(c => [`https://h/a.p${c}ng`, `https://h/a.png${c}`]),
      )(
        'downloadPalThumbnail(%s) throws before touching disk',
        async (_shown, url) => {
          await expect(downloadPalThumbnail(mockPalId, url)).rejects.toThrow(
            'Invalid thumbnail filename',
          );
          expect(mockRNFS.exists).not.toHaveBeenCalled();
          expect(mockRNFS.downloadFile).not.toHaveBeenCalled();
        },
      );
    });

    describe('downloadPalThumbnail URL extension', () => {
      it.each([
        'https://h/a.b/../x',
        'https://h/a.b/../../x',
        'https://h/a.b//etc/hosts',
        'https://h/a.b/file:/x',
        'https://h/a.b/c',
      ])('%s throws before touching disk', async url => {
        await expect(downloadPalThumbnail(mockPalId, url)).rejects.toThrow(
          'Invalid thumbnail filename',
        );
        expect(mockRNFS.exists).not.toHaveBeenCalled();
        expect(mockRNFS.mkdir).not.toHaveBeenCalled();
        expect(mockRNFS.downloadFile).not.toHaveBeenCalled();
      });

      it.each([
        ['https://h/a.b/..', 'jpg'],
        ['https://h/a.b/../..', 'jpg'],
        ['https://h/a.', 'jpg'],
        ['https://h/a.png', 'png'],
      ])('%s downloads to <id>_thumbnail.%s', async (url, extension) => {
        mockRNFS.exists.mockResolvedValue(false);
        mockRNFS.downloadFile.mockReturnValue({
          jobId: 1,
          promise: Promise.resolve({statusCode: 200}),
        } as any);

        const result = await downloadPalThumbnail(mockPalId, url);

        const name = `${mockPalId}_thumbnail.${extension}`;
        const {toFile} = mockRNFS.downloadFile.mock.calls[0][0];
        expect(result).toBe(name);
        expect(toFile).toBe(`${palImagesDir}/${name}`);
        expect(isSafePathSegment(toFile.slice(`${palImagesDir}/`.length))).toBe(
          true,
        );
      });
    });
  });
});
