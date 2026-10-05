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

    it('stops an in-flight decode on cancel and returns no text', async () => {
      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({version: ASR_MODEL_VERSION}),
      );
      let finish: (r: object) => void = () => {};
      const stop = jest.fn(async () =>
        finish({result: ' partial', language: 'en', isAborted: true}),
      );
      mockInitWhisper.mockResolvedValue({
        transcribeData: jest.fn().mockReturnValue({
          stop,
          promise: new Promise(resolve => {
            finish = resolve;
          }),
        }),
        release: jest.fn().mockResolvedValue(undefined),
      });

      const pending = engine.transcribe('base64pcm', {tier: 'small'});
      await new Promise(resolve => setImmediate(resolve));
      await engine.cancelTranscription();

      expect(stop).toHaveBeenCalledTimes(1);
      await expect(pending).resolves.toBe('');
    });

    it('strips non-speech tags from the transcript', async () => {
      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({version: ASR_MODEL_VERSION}),
      );
      mockInitWhisper.mockResolvedValue({
        transcribeData: jest.fn().mockReturnValue({
          stop: jest.fn(),
          promise: Promise.resolve({
            result: ' [Music] And so my fellow Americans (applause) ask not ',
            language: 'en',
            isAborted: false,
          }),
        }),
        release: jest.fn().mockResolvedValue(undefined),
      });

      await expect(
        engine.transcribe('base64pcm', {tier: 'small'}),
      ).resolves.toBe('And so my fellow Americans ask not');
    });

    it('returns no text when the transcript is only non-speech tags', async () => {
      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({version: ASR_MODEL_VERSION}),
      );
      mockInitWhisper.mockResolvedValue({
        transcribeData: jest.fn().mockReturnValue({
          stop: jest.fn(),
          promise: Promise.resolve({
            result: ' [BLANK_AUDIO] ',
            language: 'en',
            isAborted: false,
          }),
        }),
        release: jest.fn().mockResolvedValue(undefined),
      });

      await expect(
        engine.transcribe('base64pcm', {tier: 'small'}),
      ).resolves.toBe('');
    });

    it('loads the model once when prepare and transcribe overlap', async () => {
      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({version: ASR_MODEL_VERSION}),
      );
      mockInitWhisper.mockResolvedValue({
        transcribeData: jest.fn().mockReturnValue({
          stop: jest.fn(),
          promise: Promise.resolve({
            result: 'hi',
            language: 'en',
            isAborted: false,
          }),
        }),
        release: jest.fn().mockResolvedValue(undefined),
      });

      await Promise.all([
        engine.prepare('small'),
        engine.transcribe('base64pcm', {tier: 'small'}),
      ]);

      expect(mockInitWhisper).toHaveBeenCalledTimes(1);
    });

    it('frees a model that finishes loading after a release', async () => {
      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({version: ASR_MODEL_VERSION}),
      );
      const lateContext = {
        transcribeData: jest.fn(),
        release: jest.fn().mockResolvedValue(undefined),
      };
      let finishLoad: (c: typeof lateContext) => void = () => {};
      mockInitWhisper.mockReturnValueOnce(
        new Promise(resolve => {
          finishLoad = resolve;
        }),
      );

      const preparing = engine.prepare('small');
      await new Promise(resolve => setImmediate(resolve));
      await engine.release();
      finishLoad(lateContext);

      await expect(preparing).rejects.toThrow();
      expect(lateContext.release).toHaveBeenCalledTimes(1);
    });

    it('does not load a tier that is not installed', async () => {
      mockExists.mockResolvedValue(false);

      await engine.prepare('small');

      expect(mockInitWhisper).not.toHaveBeenCalled();
    });

    it('passes earlier text to whisper as the prompt', async () => {
      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({version: ASR_MODEL_VERSION}),
      );
      const transcribeData = jest.fn().mockReturnValue({
        stop: jest.fn(),
        promise: Promise.resolve({
          result: 'more',
          language: 'en',
          isAborted: false,
        }),
      });
      mockInitWhisper.mockResolvedValue({
        transcribeData,
        release: jest.fn().mockResolvedValue(undefined),
      });

      await engine.transcribe('base64pcm', {tier: 'small', prompt: 'before'});

      expect(transcribeData).toHaveBeenCalledWith(
        'base64pcm',
        expect.objectContaining({prompt: 'before'}),
      );
    });

    it('treats cancel with no decode in flight as a no-op', async () => {
      await expect(engine.cancelTranscription()).resolves.toBeUndefined();
    });
  });
});
