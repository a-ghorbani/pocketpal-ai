import * as RNFS from '@dr.pogodin/react-native-fs';
import {initWhisper} from 'whisper.rn';

import {ASR_MODEL_VERSION} from '../../../constants';
import {WhisperAsrEngine} from '../index';

const mockExists = RNFS.exists as jest.Mock;
const mockReadFile = RNFS.readFile as jest.Mock;
const mockWriteFile = RNFS.writeFile as jest.Mock;
const mockUnlink = RNFS.unlink as jest.Mock;
const mockDownloadFile = RNFS.downloadFile as jest.Mock;
const mockInitWhisper = initWhisper as jest.Mock;

describe('WhisperAsrEngine', () => {
  let engine: WhisperAsrEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new WhisperAsrEngine();
  });

  describe('isInstalled (sentinel gating)', () => {
    it('returns false when the model file is missing', async () => {
      mockExists.mockResolvedValue(false);
      expect(await engine.isInstalled('small')).toBe(false);
    });

    it('returns false when the sentinel is missing', async () => {
      mockExists.mockImplementation((p: string) =>
        Promise.resolve(!p.endsWith('model-version.json')),
      );
      expect(await engine.isInstalled('small')).toBe(false);
    });

    it('returns false when the sentinel records an older version', async () => {
      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({version: ASR_MODEL_VERSION - 1}),
      );
      expect(await engine.isInstalled('small')).toBe(false);
    });

    it('returns true when model + current-version sentinel are present', async () => {
      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({version: ASR_MODEL_VERSION}),
      );
      expect(await engine.isInstalled('small')).toBe(true);
    });

    it('returns false on an unparseable sentinel', async () => {
      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('not json');
      expect(await engine.isInstalled('small')).toBe(false);
    });
  });

  describe('downloadModel', () => {
    it('writes the sentinel only as the final step', async () => {
      mockExists.mockResolvedValue(false);
      mockDownloadFile.mockReturnValue({
        promise: Promise.resolve({statusCode: 200}),
      });
      await engine.downloadModel('small');
      expect(mockDownloadFile).toHaveBeenCalled();
      const sentinelWrite = mockWriteFile.mock.calls.find((c: unknown[]) =>
        String(c[0]).endsWith('model-version.json'),
      );
      expect(sentinelWrite).toBeDefined();
      expect(JSON.parse(String(sentinelWrite![1]))).toEqual({
        version: ASR_MODEL_VERSION,
      });
    });

    it('does not write the sentinel and cleans up on HTTP failure', async () => {
      mockExists.mockResolvedValue(true);
      mockDownloadFile.mockReturnValue({
        promise: Promise.resolve({statusCode: 404}),
      });
      await expect(engine.downloadModel('small')).rejects.toThrow();
      expect(mockWriteFile).not.toHaveBeenCalled();
      expect(mockUnlink).toHaveBeenCalled();
    });
  });

  describe('transcribe (I-OFFLINE: no network)', () => {
    it('throws when the tier is not installed', async () => {
      mockExists.mockResolvedValue(false);
      await expect(
        engine.transcribe('base64pcm', {tier: 'small'}),
      ).rejects.toThrow();
      expect(mockInitWhisper).not.toHaveBeenCalled();
    });

    it('decodes locally without any download call', async () => {
      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({version: ASR_MODEL_VERSION}),
      );
      const transcribeData = jest.fn().mockReturnValue({
        stop: jest.fn(),
        promise: Promise.resolve({
          result: '  hello world ',
          language: 'en',
          isAborted: false,
        }),
      });
      mockInitWhisper.mockResolvedValue({
        transcribeData,
        release: jest.fn().mockResolvedValue(undefined),
      });

      const text = await engine.transcribe('base64pcm', {tier: 'small'});
      expect(text).toBe('hello world');
      expect(transcribeData).toHaveBeenCalledWith(
        'base64pcm',
        expect.objectContaining({language: 'auto'}),
      );
      // The decode path never reaches out to the network.
      expect(mockDownloadFile).not.toHaveBeenCalled();
    });
  });
});
