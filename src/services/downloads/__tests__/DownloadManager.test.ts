import {NativeModules, Platform, NativeEventEmitter} from 'react-native';

import * as RNFS from '@dr.pogodin/react-native-fs';

import {basicModel} from '../../../../jest/fixtures/models';

import {DownloadManager, DownloadCancelledError} from '../DownloadManager';
import {ensureNotificationPermission} from '../../../utils/androidPermission';
import * as utils from '../../../utils';
import {NetworkError} from '../../../utils/errors';
import {l10n} from '../../../locales';

jest.mock('../../../utils/androidPermission', () => ({
  ensureNotificationPermission: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native', () => {
  // Create a shared mock for DownloadModule inside the factory
  const mockDownloadModule = {
    startDownload: jest.fn(),
    cancelDownload: jest.fn(),
    getActiveDownloads: jest.fn(),
    reattachDownloadObserver: jest.fn(),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
    pauseDownload: jest.fn(),
    resumeDownload: jest.fn(),
    retryDownload: jest.fn(),
    logDownloadDatabase: jest.fn(),
  };

  return {
    NativeModules: {
      DownloadModule: mockDownloadModule,
    },
    NativeEventEmitter: jest.fn(),
    Platform: {
      OS: 'android',
    },
    Appearance: {
      getColorScheme: jest.fn(() => 'light'),
    },
    TurboModuleRegistry: {
      getEnforcing: jest.fn((name: string) => {
        if (name === 'DownloadModule') {
          return mockDownloadModule;
        }
        return null;
      }),
    },
  };
});

describe('DownloadManager', () => {
  let downloadManager: DownloadManager;
  let mockEventEmitter: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock event emitter
    mockEventEmitter = {
      addListener: jest.fn(),
      removeAllListeners: jest.fn(),
    };
    (NativeEventEmitter as jest.Mock).mockReturnValue(mockEventEmitter);

    // Reset platform to Android by default
    (Platform as any).OS = 'android';

    downloadManager = new DownloadManager();
  });

  it('initializes correctly', () => {
    expect(downloadManager).toBeDefined();
    expect(NativeEventEmitter).toHaveBeenCalled();
    expect(mockEventEmitter.addListener).toHaveBeenCalledWith(
      'onDownloadProgress',
      expect.any(Function),
    );
    expect(mockEventEmitter.addListener).toHaveBeenCalledWith(
      'onDownloadComplete',
      expect.any(Function),
    );
    expect(mockEventEmitter.addListener).toHaveBeenCalledWith(
      'onDownloadFailed',
      expect.any(Function),
    );
  });

  it('starts a download on Android', async () => {
    NativeModules.DownloadModule.startDownload.mockResolvedValue({
      downloadId: 'download123',
    });

    const callbacks = {
      onStart: jest.fn(),
      onProgress: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
    };

    downloadManager.setCallbacks(callbacks);

    await downloadManager.startDownload(basicModel, '/path/to/model.bin');

    expect(RNFS.mkdir).toHaveBeenCalledWith('/path/to');
    expect(NativeModules.DownloadModule.startDownload).toHaveBeenCalledWith(
      basicModel.downloadUrl,
      expect.objectContaining({
        destination: '/path/to/model.bin',
      }),
    );
    expect(callbacks.onStart).toHaveBeenCalledWith('model-1');
    expect(downloadManager.isDownloading('model-1')).toBe(true);
  });

  it('asks for notification permission before starting on Android', async () => {
    const order: string[] = [];
    (ensureNotificationPermission as jest.Mock).mockImplementation(async () => {
      order.push('permission');
    });
    NativeModules.DownloadModule.startDownload.mockImplementation(async () => {
      order.push('start');
      return {downloadId: 'download123'};
    });

    await downloadManager.startDownload(basicModel, '/path/to/model.bin');

    expect(order).toEqual(['permission', 'start']);
  });

  it('passes the progress Android kept to onError on failure', async () => {
    NativeModules.DownloadModule.startDownload.mockResolvedValue({
      downloadId: 'download123',
    });
    const onError = jest.fn();
    downloadManager.setCallbacks({onError});
    await downloadManager.startDownload(basicModel, '/path/to/model.bin');
    const [, emitFailure] = mockEventEmitter.addListener.mock.calls.find(
      ([name]: [string]) => name === 'onDownloadFailed',
    );

    emitFailure({downloadId: 'download123', error: 'stalled', progress: 40});

    expect(onError).toHaveBeenCalledWith('model-1', expect.any(Error), 40);
    expect(downloadManager.isDownloading('model-1')).toBe(false);
  });

  describe('Android failure that is not the model', () => {
    const startAndCaptureFailure = async () => {
      NativeModules.DownloadModule.startDownload.mockResolvedValue({
        downloadId: 'download123',
      });
      const onError = jest.fn();
      downloadManager.setCallbacks({onError});
      await downloadManager.startDownload(basicModel, '/path/to/model.gguf');
      const [, emitFailure] = mockEventEmitter.addListener.mock.calls.find(
        ([name]: [string]) => name === 'onDownloadFailed',
      );
      return {onError, emitFailure};
    };

    it.each([
      'Downloaded data is not the model',
      'Downloaded file size does not match the expected size',
    ])('reports "%s" as the localized not-the-model message', async error => {
      const {onError, emitFailure} = await startAndCaptureFailure();

      emitFailure({downloadId: 'download123', error, progress: 0});

      const reported = onError.mock.calls[0][1];
      expect(reported).toBeInstanceOf(NetworkError);
      expect(reported.message).toBe(l10n.en.errors.downloadNotTheModel);
    });

    it('passes any other engine error through unchanged', async () => {
      const {onError, emitFailure} = await startAndCaptureFailure();

      emitFailure({downloadId: 'download123', error: 'Client error: 404'});

      const reported = onError.mock.calls[0][1];
      expect(reported).not.toBeInstanceOf(NetworkError);
      expect(reported.message).toBe('Client error: 404');
    });
  });

  it('starts a download on iOS', async () => {
    (Platform as any).OS = 'ios';

    const mockDownloadResult = {
      jobId: 123,
      promise: Promise.resolve({
        statusCode: 200,
        bytesWritten: basicModel.size,
      }),
    };

    (RNFS.downloadFile as jest.Mock).mockReturnValue(mockDownloadResult);

    const callbacks = {
      onStart: jest.fn(),
      onProgress: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
    };

    downloadManager.setCallbacks(callbacks);

    await downloadManager.startDownload(basicModel, '/path/to/model.bin');

    expect(RNFS.mkdir).toHaveBeenCalledWith('/path/to');
    expect(RNFS.downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fromUrl: basicModel.downloadUrl,
        toFile: '/path/to/model.bin',
      }),
    );

    expect(callbacks.onComplete).toHaveBeenCalledWith('model-1');
    expect(downloadManager.isDownloading('model-1')).toBe(false);
  });

  it('cancels a download', async () => {
    // Setup a download first
    NativeModules.DownloadModule.startDownload.mockResolvedValue({
      downloadId: 'download123',
    });

    await downloadManager.startDownload(basicModel, '/path/to/model.bin');
    expect(downloadManager.isDownloading('model-1')).toBe(true);

    // Now cancel it
    await downloadManager.cancelDownload('model-1');

    expect(NativeModules.DownloadModule.cancelDownload).toHaveBeenCalledWith(
      'download123',
    );
    expect(downloadManager.isDownloading('model1')).toBe(false);
  });

  it('syncs with active downloads', async () => {
    NativeModules.DownloadModule.getActiveDownloads.mockResolvedValue([
      {
        id: 'download123',
        url: basicModel.downloadUrl,
        destination: '/path/to/model.bin',
        bytesWritten: 500000,
        totalBytes: 1000000,
        progress: 50,
      },
    ]);

    const callbacks = {
      onStart: jest.fn(),
    };

    downloadManager.setCallbacks(callbacks);

    await downloadManager.syncWithActiveDownloads([basicModel]);

    expect(NativeModules.DownloadModule.getActiveDownloads).toHaveBeenCalled();
    expect(downloadManager.isDownloading('model-1')).toBe(true);
    expect(downloadManager.getDownloadProgress('model-1')).toBe(50);
    expect(callbacks.onStart).toHaveBeenCalledWith('model-1');
  });

  it('handles download progress events', async () => {
    // Setup a download first
    NativeModules.DownloadModule.startDownload.mockResolvedValue({
      downloadId: 'download123',
    });

    const callbacks = {
      onStart: jest.fn(),
      onProgress: jest.fn(),
    };

    downloadManager.setCallbacks(callbacks);

    // Start download and wait for it to complete
    await downloadManager.startDownload(basicModel, '/path/to/model.bin');

    // Verify the download job was created
    expect(downloadManager.isDownloading('model-1')).toBe(true);

    // Get the progress listener directly from the mock
    const progressListener = mockEventEmitter.addListener.mock.calls.find(
      call => call[0] === 'onDownloadProgress',
    )[1];

    // Call the progress listener with a mock event that matches model ID
    progressListener({
      downloadId: 'download123',
      bytesWritten: 500000,
      totalBytes: 1000000,
      progress: 50,
    });

    // Now check if onProgress was called
    expect(callbacks.onProgress).toHaveBeenCalledWith(
      'model-1', // Make sure this matches model ID
      expect.objectContaining({
        bytesDownloaded: 500000,
        bytesTotal: 1000000,
        progress: 50,
      }),
    );
  });

  it('starts and manages a download on iOS', async () => {
    // Set platform to iOS
    (Platform as any).OS = 'ios';

    // Create a new instance for iOS testing
    const iosDownloadManager = new DownloadManager();

    const callbacks = {
      onStart: jest.fn(),
      onProgress: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
    };

    iosDownloadManager.setCallbacks(callbacks);

    let beginCallback: any;
    let progressCallback: any;
    let finishDownload: (result: {
      statusCode: number;
      bytesWritten: number;
    }) => void = () => {};

    const mockDownloadResult = {
      jobId: 456,
      promise: new Promise(resolve => {
        finishDownload = resolve;
      }),
    };

    (RNFS.downloadFile as jest.Mock).mockImplementation(options => {
      // Save the callbacks so we can call them manually
      beginCallback = options.begin;
      progressCallback = options.progress;
      return mockDownloadResult;
    });

    // Start the download
    const downloadPromise = iosDownloadManager.startDownload(
      basicModel,
      '/path/to/model.bin',
    );

    await new Promise(resolve => setImmediate(resolve));

    expect(RNFS.mkdir).toHaveBeenCalledWith('/path/to');

    expect(RNFS.downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fromUrl: basicModel.downloadUrl,
        toFile: '/path/to/model.bin',
        discretionary: false,
      }),
    );

    expect(iosDownloadManager.isDownloading('model-1')).toBe(true);

    // Simulate begin callback
    beginCallback({
      statusCode: 200,
      contentLength: 1000000,
      headers: {},
    });

    expect(callbacks.onStart).toHaveBeenCalledWith('model-1');
    expect(callbacks.onProgress).toHaveBeenCalledWith(
      'model-1',
      expect.objectContaining({
        bytesDownloaded: 0,
        bytesTotal: 1000000,
        progress: 0,
      }),
    );

    // Reset mock to check next call
    callbacks.onProgress.mockClear();

    // Simulate progress callback (50%)
    progressCallback({
      bytesWritten: 500000,
      contentLength: 1000000,
    });

    expect(callbacks.onProgress).toHaveBeenCalledWith(
      'model-1',
      expect.objectContaining({
        bytesDownloaded: 500000,
        bytesTotal: 1000000,
        progress: 50,
      }),
    );

    finishDownload({statusCode: 200, bytesWritten: basicModel.size});
    await downloadPromise;

    expect(callbacks.onComplete).toHaveBeenCalledWith('model-1');
    expect(iosDownloadManager.isDownloading('model-1')).toBe(false);
  });

  it('handles download failure on iOS', async () => {
    // Set platform to iOS
    (Platform as any).OS = 'ios';

    const iosDownloadManager = new DownloadManager();

    const callbacks = {
      onStart: jest.fn(),
      onProgress: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
    };

    iosDownloadManager.setCallbacks(callbacks);

    const mockDownloadResult = {
      jobId: 789,
      promise: Promise.resolve({statusCode: 404}), // Error status
    };

    (RNFS.downloadFile as jest.Mock).mockReturnValue(mockDownloadResult);

    await expect(
      iosDownloadManager.startDownload(basicModel, '/path/to/model.bin'),
    ).rejects.toThrow('Download failed with status: 404');

    expect(callbacks.onError).toHaveBeenCalledWith(
      'model-1',
      expect.any(Error),
    );

    expect(iosDownloadManager.isDownloading('model-1')).toBe(false);
  });

  it('does not surface an error when an iOS download is cancelled', async () => {
    (Platform as any).OS = 'ios';

    const iosDownloadManager = new DownloadManager();

    const callbacks = {
      onStart: jest.fn(),
      onProgress: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
    };

    iosDownloadManager.setCallbacks(callbacks);

    // A cancel aborts the RNFS task, rejecting the download promise.
    let rejectDownload: (reason: Error) => void = () => {};
    const downloadPromise = new Promise((_resolve, reject) => {
      rejectDownload = reject;
    });

    (RNFS.downloadFile as jest.Mock).mockReturnValue({
      jobId: 321,
      promise: downloadPromise,
    });

    const startPromise = iosDownloadManager.startDownload(
      basicModel,
      '/path/to/model.bin',
    );

    // Let the async setup (mkdir, job registration) settle before cancelling.
    await new Promise(resolve => setImmediate(resolve));

    expect(iosDownloadManager.isDownloading('model-1')).toBe(true);

    // User taps Stop, then the aborted task rejects the download promise.
    await iosDownloadManager.cancelDownload('model-1');
    rejectDownload(new Error('Download has been aborted'));

    // The cancel surfaces as a distinct DownloadCancelledError (not a generic
    // failure), so onError is never called and callers can special-case it.
    await expect(startPromise).rejects.toBeInstanceOf(DownloadCancelledError);

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(iosDownloadManager.isDownloading('model-1')).toBe(false);
  });

  it('still surfaces an error for a genuine iOS download failure', async () => {
    (Platform as any).OS = 'ios';

    const iosDownloadManager = new DownloadManager();

    const callbacks = {
      onStart: jest.fn(),
      onProgress: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
    };

    iosDownloadManager.setCallbacks(callbacks);

    (RNFS.downloadFile as jest.Mock).mockReturnValue({
      jobId: 654,
      promise: Promise.reject(new Error('Network connection lost')),
    });

    await expect(
      iosDownloadManager.startDownload(basicModel, '/path/to/model.bin'),
    ).rejects.toThrow('Network connection lost');

    expect(callbacks.onError).toHaveBeenCalledWith(
      'model-1',
      expect.any(Error),
    );
    expect(iosDownloadManager.isDownloading('model-1')).toBe(false);
  });

  it('still surfaces a later genuine failure after the same model was cancelled', async () => {
    (Platform as any).OS = 'ios';

    const iosDownloadManager = new DownloadManager();

    const callbacks = {
      onStart: jest.fn(),
      onProgress: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
    };

    iosDownloadManager.setCallbacks(callbacks);

    // First attempt: user cancels mid-download.
    let rejectFirst: (reason: Error) => void = () => {};
    const firstPromise = new Promise((_resolve, reject) => {
      rejectFirst = reject;
    });
    (RNFS.downloadFile as jest.Mock).mockReturnValueOnce({
      jobId: 111,
      promise: firstPromise,
    });

    const firstStart = iosDownloadManager.startDownload(
      basicModel,
      '/path/to/model.bin',
    );
    await new Promise(resolve => setImmediate(resolve));
    await iosDownloadManager.cancelDownload('model-1');
    rejectFirst(new Error('Download has been aborted'));
    await expect(firstStart).rejects.toBeInstanceOf(DownloadCancelledError);
    expect(callbacks.onError).not.toHaveBeenCalled();

    // Second attempt for the SAME model genuinely fails. The cancelled-id
    // marker from the first attempt must not swallow this real failure.
    (RNFS.downloadFile as jest.Mock).mockReturnValueOnce({
      jobId: 222,
      promise: Promise.reject(new Error('Network connection lost')),
    });

    await expect(
      iosDownloadManager.startDownload(basicModel, '/path/to/model.bin'),
    ).rejects.toThrow('Network connection lost');

    expect(callbacks.onError).toHaveBeenCalledWith(
      'model-1',
      expect.any(Error),
    );
    expect(iosDownloadManager.isDownloading('model-1')).toBe(false);
  });

  describe('iOS file that is not the model', () => {
    const GGUF_HEAD = 'R0dVRg==';
    const destination = '/path/to/model.gguf';

    beforeEach(() => {
      (RNFS.read as jest.Mock).mockReset().mockResolvedValue('');
    });

    const settleable = () => {
      let resolve: (result: {
        statusCode: number;
        bytesWritten: number;
      }) => void = () => {};
      let reject: (error: Error) => void = () => {};
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return {promise, resolve, reject};
    };

    const startIOS = async (model: typeof basicModel, path = destination) => {
      (Platform as any).OS = 'ios';
      const manager = new DownloadManager();
      const callbacks = {onComplete: jest.fn(), onError: jest.fn()};
      manager.setCallbacks(callbacks);
      jest.spyOn(utils, 'hasEnoughSpace').mockResolvedValueOnce(true);
      const settle = settleable();
      let begin: (res: object) => void = () => {};
      (RNFS.downloadFile as jest.Mock).mockImplementation(options => {
        begin = options.begin;
        return {jobId: 42, promise: settle.promise};
      });
      const started = manager.startDownload(model, path);
      started.catch(() => {});
      await new Promise(resolve => setImmediate(resolve));
      return {
        manager,
        callbacks,
        started,
        settle,
        begin: (headers: Record<string, string>) =>
          begin({jobId: 42, statusCode: 200, contentLength: 4465, headers}),
      };
    };

    const expectNotTheModel = async ({
      started,
      callbacks,
      manager,
    }: Awaited<ReturnType<typeof startIOS>>) => {
      await expect(started).rejects.toThrow(
        new NetworkError(l10n.en.errors.downloadNotTheModel),
      );
      expect(RNFS.unlink).toHaveBeenCalledWith(destination);
      expect(callbacks.onError).toHaveBeenCalledWith(
        'model-1',
        expect.any(NetworkError),
      );
      expect(callbacks.onComplete).not.toHaveBeenCalled();
      expect(manager.isDownloading('model-1')).toBe(false);
    };

    it('fails a finished file far smaller than the model', async () => {
      const download = await startIOS({...basicModel, size: 1270808032});
      download.begin({'Content-Type': 'application/octet-stream'});
      download.settle.resolve({statusCode: 200, bytesWritten: 4465});

      await expectNotTheModel(download);
    });

    it('accepts a file within 0.1% of a stale recorded size', async () => {
      (RNFS.read as jest.Mock).mockResolvedValueOnce(GGUF_HEAD);
      const download = await startIOS({...basicModel, size: 3041376384});
      download.begin({'Content-Type': 'application/octet-stream'});
      download.settle.resolve({statusCode: 200, bytesWritten: 3041378400});

      await download.started;

      expect(download.callbacks.onComplete).toHaveBeenCalledWith('model-1');
      expect(RNFS.unlink).not.toHaveBeenCalled();
    });

    it('accepts a GGUF file when the expected size is unknown', async () => {
      (RNFS.read as jest.Mock).mockResolvedValueOnce(GGUF_HEAD);
      const download = await startIOS({...basicModel, size: 0});
      download.begin({'Content-Type': 'application/octet-stream'});
      download.settle.resolve({statusCode: 200, bytesWritten: 4465});

      await download.started;

      expect(RNFS.read).toHaveBeenCalledWith(destination, 4, 0, 'base64');
      expect(download.callbacks.onComplete).toHaveBeenCalledWith('model-1');
      expect(RNFS.unlink).not.toHaveBeenCalled();
    });

    it.each([
      ['rejects with the abort', 'content-type', 'abort'],
      ['resolves anyway', 'Content-Type', 'resolve'],
    ])(
      'stops a web page and fails it when the download %s (%s)',
      async (_label, headerName, settlement) => {
        const download = await startIOS({...basicModel, size: 0});
        download.begin({[headerName]: 'text/html; charset=utf-8'});

        expect(RNFS.stopDownload).toHaveBeenCalledWith(42);
        if (settlement === 'abort') {
          download.settle.reject(new Error('Download has been aborted'));
        } else {
          download.settle.resolve({statusCode: 200, bytesWritten: 4465});
        }

        await expectNotTheModel(download);
      },
    );

    it('fails a non-GGUF body to a model file when the size is unknown', async () => {
      (RNFS.read as jest.Mock).mockResolvedValueOnce('eyJlcg==');
      const download = await startIOS({...basicModel, size: 0});
      download.begin({'Content-Type': 'application/json'});
      download.settle.resolve({statusCode: 200, bytesWritten: 120});

      await expectNotTheModel(download);
    });

    it('keeps a user cancel silent while the web-page stop is in flight', async () => {
      const download = await startIOS({...basicModel, size: 0});
      download.begin({'content-type': 'text/html'});

      await download.manager.cancelDownload('model-1');
      download.settle.reject(new Error('Download has been aborted'));

      await expect(download.started).rejects.toBeInstanceOf(
        DownloadCancelledError,
      );
      expect(download.callbacks.onError).not.toHaveBeenCalled();
    });

    it('checks the size against the Hugging Face file size first', async () => {
      const download = await startIOS({
        ...basicModel,
        size: 0,
        hfModelFile: {lfs: {size: 1270808032}},
      } as typeof basicModel);
      download.begin({'Content-Type': 'application/octet-stream'});
      download.settle.resolve({statusCode: 200, bytesWritten: 4465});

      await expectNotTheModel(download);
      expect(RNFS.read).not.toHaveBeenCalled();
    });

    it('fails a finished download that reports no size written', async () => {
      (RNFS.read as jest.Mock).mockResolvedValue(GGUF_HEAD);
      const download = await startIOS({...basicModel, size: 1270808032});
      download.begin({'Content-Type': 'application/octet-stream'});
      download.settle.resolve({statusCode: 200} as any);

      await expectNotTheModel(download);
    });

    it('fails a model file whose first bytes cannot be read', async () => {
      (RNFS.read as jest.Mock).mockRejectedValueOnce(new Error('ENOENT'));
      const download = await startIOS({...basicModel, size: 0});
      download.begin({'Content-Type': 'application/octet-stream'});
      download.settle.resolve({statusCode: 200, bytesWritten: 4465});

      await expectNotTheModel(download);
    });

    it('checks the magic for a model file name in upper case', async () => {
      const upper = '/path/to/Model.GGUF';
      const download = await startIOS({...basicModel, size: 0}, upper);
      download.begin({'Content-Type': 'application/json'});
      download.settle.resolve({statusCode: 200, bytesWritten: 120});

      await expect(download.started).rejects.toThrow(
        l10n.en.errors.downloadNotTheModel,
      );
      expect(RNFS.read).toHaveBeenCalledWith(upper, 4, 0, 'base64');
      expect(RNFS.unlink).toHaveBeenCalledWith(upper);
    });

    it('leaves a file that is not a model file unchecked for the magic', async () => {
      const download = await startIOS({...basicModel, size: 0}, '/a/b.bin');
      download.begin({'Content-Type': 'application/octet-stream'});
      download.settle.resolve({statusCode: 200, bytesWritten: 120});

      await download.started;

      expect(RNFS.read).not.toHaveBeenCalled();
      expect(RNFS.unlink).not.toHaveBeenCalled();
      expect(download.callbacks.onComplete).toHaveBeenCalledWith('model-1');
    });

    it('fails a web page to a file that is not a model file', async () => {
      const download = await startIOS({...basicModel, size: 0}, '/a/b.bin');
      download.begin({'Content-Type': 'text/html'});
      download.settle.resolve({statusCode: 200, bytesWritten: 4465});

      await expect(download.started).rejects.toThrow(
        l10n.en.errors.downloadNotTheModel,
      );
      expect(RNFS.unlink).toHaveBeenCalledWith('/a/b.bin');
      expect(download.callbacks.onComplete).not.toHaveBeenCalled();
    });

    it('keeps the status error for a web page that is not a 200', async () => {
      const download = await startIOS({...basicModel, size: 1270808032});
      const beginOptions = (RNFS.downloadFile as jest.Mock).mock.calls[0][0];
      beginOptions.begin({
        jobId: 42,
        statusCode: 404,
        contentLength: 4465,
        headers: {'Content-Type': 'text/html'},
      });
      download.settle.resolve({statusCode: 404, bytesWritten: 4465});

      await expect(download.started).rejects.toThrow(
        'Download failed with status: 404',
      );
      expect(RNFS.stopDownload).not.toHaveBeenCalled();
      expect(download.callbacks.onError.mock.calls[0][1]).not.toBeInstanceOf(
        NetworkError,
      );
    });
  });

  it('sends the attribution User-Agent on the iOS RNFS download', async () => {
    (Platform as any).OS = 'ios';

    const iosDownloadManager = new DownloadManager();
    iosDownloadManager.setCallbacks({
      onStart: jest.fn(),
      onProgress: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
    });

    (RNFS.downloadFile as jest.Mock).mockReturnValue({
      jobId: 999,
      promise: Promise.resolve({
        statusCode: 200,
        bytesWritten: basicModel.size,
      }),
    });

    await iosDownloadManager.startDownload(basicModel, '/path/to/model.bin');

    expect(RNFS.downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'PocketPal/1.0.0 (ai.pocketpal)',
        }),
      }),
    );
  });

  it('attaches the HF auth token only for a huggingface.co download URL (iOS)', async () => {
    (Platform as any).OS = 'ios';

    const iosDownloadManager = new DownloadManager();
    iosDownloadManager.setCallbacks({
      onStart: jest.fn(),
      onProgress: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
    });

    (RNFS.downloadFile as jest.Mock).mockReturnValue({
      jobId: 1001,
      promise: Promise.resolve({
        statusCode: 200,
        bytesWritten: basicModel.size,
      }),
    });

    await iosDownloadManager.startDownload(
      basicModel,
      '/path/to/model.bin',
      'secret-token',
    );

    expect(RNFS.downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-token',
        }),
      }),
    );
  });

  it('does not attach the HF auth token for a non-huggingface.co URL (iOS)', async () => {
    (Platform as any).OS = 'ios';

    const iosDownloadManager = new DownloadManager();
    iosDownloadManager.setCallbacks({
      onStart: jest.fn(),
      onProgress: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
    });

    (RNFS.downloadFile as jest.Mock).mockReturnValue({
      jobId: 1002,
      promise: Promise.resolve({
        statusCode: 200,
        bytesWritten: basicModel.size,
      }),
    });

    const offHostModel = {
      ...basicModel,
      id: 'off-host-model',
      downloadUrl: 'https://evil.example.com/test/test-model-1',
    };

    await iosDownloadManager.startDownload(
      offHostModel,
      '/path/to/model.bin',
      'secret-token',
    );

    const headers = (RNFS.downloadFile as jest.Mock).mock.calls[0][0].headers;
    expect(headers.Authorization).toBeUndefined();
  });

  it('does not forward the HF auth token to the native module for a non-HF URL (Android)', async () => {
    NativeModules.DownloadModule.startDownload.mockResolvedValue({
      downloadId: 'download-off-host',
    });

    const offHostModel = {
      ...basicModel,
      id: 'off-host-model',
      downloadUrl: 'https://evil.example.com/test/test-model-1',
    };

    await downloadManager.startDownload(
      offHostModel,
      '/path/to/model.bin',
      'secret-token',
    );

    const config = NativeModules.DownloadModule.startDownload.mock.calls[0][1];
    expect(config.authToken).toBeUndefined();
  });

  describe('iOS backup exclusion', () => {
    const modelsRoot = `${RNFS.DocumentDirectoryPath}/models`;
    const callbacks = {
      onStart: jest.fn(),
      onProgress: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
    };

    beforeEach(() => {
      (Platform as any).OS = 'ios';
      (RNFS.read as jest.Mock).mockResolvedValue('R0dVRg==');
      (RNFS.downloadFile as jest.Mock).mockReturnValue({
        jobId: 1,
        promise: Promise.resolve({
          statusCode: 200,
          bytesWritten: basicModel.size,
        }),
      });
      downloadManager.setCallbacks(callbacks);
    });

    const excludedFolders = () =>
      (RNFS.mkdir as jest.Mock).mock.calls
        .filter(([, opts]) => opts?.NSURLIsExcludedFromBackupKey === true)
        .map(([path]) => path as string);

    it.each([
      ['a Hugging Face model', `${modelsRoot}/hf/author/repo/model.gguf`],
      ['a preset model', `${modelsRoot}/preset/author/repo/model.gguf`],
    ])(
      'flags the folder holding %s before the download starts',
      async (_kind, destination) => {
        await downloadManager.startDownload(basicModel, destination);
        expect(callbacks.onComplete).toHaveBeenCalledWith(basicModel.id);

        const folder = destination.slice(0, destination.lastIndexOf('/'));
        const covering = excludedFolders().filter(
          path =>
            path.startsWith(modelsRoot) &&
            (folder === path || folder.startsWith(`${path}/`)),
        );
        expect(covering).not.toHaveLength(0);

        const lastFlag = Math.max(
          ...(RNFS.mkdir as jest.Mock).mock.invocationCallOrder,
        );
        const download = (RNFS.downloadFile as jest.Mock).mock
          .invocationCallOrder[0];
        expect(lastFlag).toBeLessThan(download);
      },
    );
  });
});
