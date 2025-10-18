import {NativeModules, Platform, NativeEventEmitter} from 'react-native';

import * as RNFS from '@dr.pogodin/react-native-fs';

import {basicModel} from '../../../../jest/fixtures/models';

import {DownloadManager} from '../DownloadManager';

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

  it('starts a download on iOS', async () => {
    (Platform as any).OS = 'ios';

    const mockDownloadResult = {
      jobId: 123,
      promise: Promise.resolve({statusCode: 200}),
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

    const mockDownloadResult = {
      jobId: 456,
      promise: Promise.resolve({statusCode: 200}),
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

    await jest.runAllTimersAsync();

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

    // Wait for the download promise to resolve
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
});
