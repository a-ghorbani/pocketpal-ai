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

      const result = await engine.transcribe('base64pcm', {tier: 'small'});
      expect(result).toEqual({text: 'hello world', language: 'en'});
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
      await expect(pending).resolves.toEqual({text: '', language: ''});
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
      ).resolves.toMatchObject({
        text: 'And so my fellow Americans ask not',
      });
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
      ).resolves.toMatchObject({text: ''});
    });

    it('loads the model once when two transcriptions overlap', async () => {
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
        engine.transcribe('base64pcm', {tier: 'small'}),
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

      const transcribing = engine.transcribe('base64pcm', {tier: 'small'});
      await new Promise(resolve => setImmediate(resolve));
      await engine.release();
      finishLoad(lateContext);

      await expect(transcribing).rejects.toThrow();
      expect(lateContext.release).toHaveBeenCalledTimes(1);
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

    it('reuses the loaded model across transcriptions', async () => {
      installed();
      mockInitWhisper.mockResolvedValue(whisperContext());

      await engine.transcribe('base64pcm', {tier: 'small'});
      await engine.transcribe('base64pcm', {tier: 'small'});

      expect(mockInitWhisper).toHaveBeenCalledTimes(1);
    });

    it('reloads when the tier changes', async () => {
      installed();
      const first = whisperContext();
      mockInitWhisper
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(whisperContext());

      await engine.transcribe('base64pcm', {tier: 'small'});
      await engine.transcribe('base64pcm', {tier: 'base'});

      expect(mockInitWhisper).toHaveBeenCalledTimes(2);
      expect(first.release).toHaveBeenCalled();
    });
  });

  describe('downloadModel progress', () => {
    it('reports progress against the content length, capped at 1', async () => {
      mockExists.mockResolvedValue(false);
      const onProgress = jest.fn();
      mockDownloadFile.mockImplementation(({progress}) => {
        progress({bytesWritten: 50, contentLength: 100});
        progress({bytesWritten: 150, contentLength: 100});
        return {promise: Promise.resolve({statusCode: 200})};
      });

      await engine.downloadModel('small', onProgress);

      expect(onProgress.mock.calls.map(c => c[0])).toEqual([0.5, 1, 1]);
    });
  });

  describe('reclaimLegacySpace', () => {
    it('keeps a tier at the current version', async () => {
      installed();
      await engine.reclaimLegacySpace('small');
      expect(mockUnlink).not.toHaveBeenCalled();
    });

    it('removes a tier left by an older version', async () => {
      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({version: ASR_MODEL_VERSION - 1}),
      );
      mockUnlink.mockResolvedValue(undefined);
      await engine.reclaimLegacySpace('small');
      expect(mockUnlink).toHaveBeenCalledWith(expect.stringMatching(/small$/));
    });
  });

  describe('deleteModel', () => {
    it('releases a loaded tier before removing its files', async () => {
      installed();
      const context = whisperContext();
      mockInitWhisper.mockResolvedValue(context);
      mockUnlink.mockResolvedValue(undefined);
      await engine.transcribe('base64pcm', {tier: 'small'});

      await engine.deleteModel('small');

      expect(context.release.mock.invocationCallOrder[0]).toBeLessThan(
        mockUnlink.mock.invocationCallOrder[0],
      );
      expect(mockUnlink).toHaveBeenCalledWith(expect.stringMatching(/small$/));
    });

    it('does not throw when removal fails', async () => {
      mockExists.mockResolvedValue(true);
      mockUnlink.mockRejectedValue(new Error('busy'));
      await expect(engine.deleteModel('small')).resolves.toBeUndefined();
    });
  });

  it('release survives a native release failure', async () => {
    installed();
    const context = whisperContext();
    context.release.mockRejectedValue(new Error('native'));
    mockInitWhisper.mockResolvedValue(context);
    await engine.transcribe('base64pcm', {tier: 'small'});

    await expect(engine.release()).resolves.toBeUndefined();
  });

  describe('residency and release', () => {
    const markTierInstalled = () => {
      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(
        JSON.stringify({version: ASR_MODEL_VERSION}),
      );
    };

    it('preload loads the context that a later transcription reuses', async () => {
      markTierInstalled();
      mockInitWhisper.mockResolvedValue({
        transcribeData: jest.fn().mockReturnValue({
          stop: jest.fn(),
          promise: Promise.resolve({result: 'hi', isAborted: false}),
        }),
        release: jest.fn().mockResolvedValue(undefined),
      });

      await engine.preload('base');
      await engine.transcribe('pcm', {tier: 'base'});
      await engine.transcribe('pcm', {tier: 'base'});

      expect(mockInitWhisper).toHaveBeenCalledTimes(1);
    });

    it('release stops an in-flight decode and frees the context only after it settles', async () => {
      markTierInstalled();
      const events: string[] = [];
      let finish: (r: object) => void = () => {};
      const stop = jest.fn(async () => {
        events.push('stop');
        setTimeout(() => {
          events.push('decode settled');
          finish({result: '', isAborted: true});
        }, 0);
      });
      const release = jest.fn(async () => {
        events.push('context released');
      });
      mockInitWhisper.mockResolvedValue({
        transcribeData: jest.fn().mockReturnValue({
          stop,
          promise: new Promise(resolve => {
            finish = resolve;
          }),
        }),
        release,
      });

      const pending = engine.transcribe('pcm', {tier: 'base'});
      await new Promise(resolve => setImmediate(resolve));
      await engine.release();

      expect(events).toEqual(['stop', 'decode settled', 'context released']);
      await expect(pending).resolves.toEqual({text: '', language: ''});
    });

    it('release after a finished transcription frees the context without a stop', async () => {
      markTierInstalled();
      const stop = jest.fn();
      const release = jest.fn().mockResolvedValue(undefined);
      mockInitWhisper.mockResolvedValue({
        transcribeData: jest.fn().mockReturnValue({
          stop,
          promise: Promise.resolve({result: 'hi', isAborted: false}),
        }),
        release,
      });

      await engine.transcribe('pcm', {tier: 'small'});
      await engine.release();

      expect(stop).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledTimes(1);
    });
  });
});

function installed() {
  mockExists.mockResolvedValue(true);
  mockReadFile.mockResolvedValue(JSON.stringify({version: ASR_MODEL_VERSION}));
}

function whisperContext() {
  return {
    transcribeData: jest.fn().mockReturnValue({
      stop: jest.fn(),
      promise: Promise.resolve({
        result: 'hi',
        language: 'en',
        isAborted: false,
      }),
    }),
    release: jest.fn().mockResolvedValue(undefined),
  };
}
