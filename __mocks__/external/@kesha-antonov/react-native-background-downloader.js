import {NativeModules} from 'react-native';

// states:
// 0 - Running
// 1 - Suspended / Paused
// 2 - Cancelled / Failed
// 3 - Completed (not necessarily successfully)

NativeModules.RNBackgroundDownloader = {
  addListener: jest.fn(),
  removeListeners: jest.fn(),
  download: jest.fn(),
  pauseTask: jest.fn(),
  resumeTask: jest.fn(),
  stopTask: jest.fn(),
  TaskRunning: 0,
  TaskSuspended: 1,
  TaskCanceling: 2,
  TaskCompleted: 3,
  checkForExistingDownloads: jest.fn().mockImplementation(() => {
    const foundDownloads = [
      {
        id: 'taskRunning',
        state: NativeModules.RNBackgroundDownloader.TaskRunning,
        bytesDownloaded: 50,
        bytesTotal: 100,
      },
      {
        id: 'taskPaused',
        state: NativeModules.RNBackgroundDownloader.TaskSuspended,
        bytesDownloaded: 70,
        bytesTotal: 100,
      },
      {
        id: 'taskCancelled',
        state: NativeModules.RNBackgroundDownloader.TaskCanceling,
        bytesDownloaded: 90,
        bytesTotal: 100,
      },
      {
        id: 'taskCompletedExplicit',
        state: NativeModules.RNBackgroundDownloader.TaskCompleted,
        bytesDownloaded: 100,
        bytesTotal: 100,
      },
      {
        id: 'taskCompletedImplicit',
        state: NativeModules.RNBackgroundDownloader.TaskCompleted,
        bytesDownloaded: 100,
        bytesTotal: 100,
      },
      {
        id: 'taskFailed',
        state: NativeModules.RNBackgroundDownloader.TaskCompleted,
        bytesDownloaded: 90,
        bytesTotal: 100,
      },
    ];
    return Promise.resolve(foundDownloads);
  }),
};
