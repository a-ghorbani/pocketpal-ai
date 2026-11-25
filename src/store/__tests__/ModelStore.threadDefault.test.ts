jest.unmock('../../store');

import {runInAction} from 'mobx';
import {Platform} from 'react-native';

import {modelStore} from '..';
import NativeHardwareInfo from '../../specs/NativeHardwareInfo';

jest.mock('../../services/downloads', () => ({
  DownloadCancelledError: class extends Error {},
  downloadManager: {
    isDownloading: jest.fn().mockReturnValue(false),
    startDownload: jest.fn(),
    cancelDownload: jest.fn(),
    setCallbacks: jest.fn(),
    syncWithActiveDownloads: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../services/deviceRules/rules', () => ({
  fetchRules: jest.fn().mockResolvedValue(null),
}));

const repeat = (value: number, count: number) =>
  Array.from({length: count}, () => value);

const PIXEL_9 = {
  cores: 8,
  cpuMaxFreqsKhz: [...repeat(1950000, 4), ...repeat(2600000, 3), 3105000],
  cpuCapacities: [...repeat(191, 4), ...repeat(741, 3), 1024],
};

const getCPUInfo = NativeHardwareInfo.getCPUInfo as jest.Mock;

const initializeThreadCount = (): Promise<void> =>
  (modelStore as any).initializeThreadCount();

const givenStore = ({
  version,
  threadDefaultVersion,
  n_threads,
}: {
  version: number | undefined;
  threadDefaultVersion: number | undefined;
  n_threads: number;
}) => {
  runInAction(() => {
    modelStore.version = version;
    modelStore.threadDefaultVersion = threadDefaultVersion;
    modelStore.contextInitParams = {...modelStore.contextInitParams, n_threads};
  });
};

describe('ModelStore.initializeThreadCount', () => {
  const savedOS = Platform.OS;

  beforeEach(() => {
    Platform.OS = 'android';
    getCPUInfo.mockReset();
    getCPUInfo.mockResolvedValue(PIXEL_9);
  });

  afterAll(() => {
    Platform.OS = savedOS;
  });

  it('fresh install stores the fast-core default and the marker', async () => {
    givenStore({
      version: undefined,
      threadDefaultVersion: undefined,
      n_threads: 6,
    });

    await initializeThreadCount();

    expect(modelStore.contextInitParams.n_threads).toBe(4);
    expect(modelStore.threadDefaultVersion).toBe(2);
    expect(modelStore.max_threads).toBe(8);
  });

  it('keeps the value once the marker is set, even while presets never resolved', async () => {
    givenStore({version: undefined, threadDefaultVersion: 2, n_threads: 5});

    await initializeThreadCount();

    expect(modelStore.contextInitParams.n_threads).toBe(5);
  });

  it('moves an install still on the old default once, then keeps a hand-set value', async () => {
    givenStore({version: 15, threadDefaultVersion: undefined, n_threads: 6});

    await initializeThreadCount();

    expect(modelStore.contextInitParams.n_threads).toBe(4);
    expect(modelStore.threadDefaultVersion).toBe(2);

    modelStore.setNThreads(6);
    await initializeThreadCount();

    expect(modelStore.contextInitParams.n_threads).toBe(6);
  });

  it.each([5, 3, 8])(
    'keeps a user-chosen %i and sets the marker',
    async n_threads => {
      givenStore({version: 15, threadDefaultVersion: undefined, n_threads});

      await initializeThreadCount();

      expect(modelStore.contextInitParams.n_threads).toBe(n_threads);
      expect(modelStore.threadDefaultVersion).toBe(2);
    },
  );

  it('changes nothing and retries later when the CPU read fails', async () => {
    givenStore({version: 15, threadDefaultVersion: undefined, n_threads: 6});
    getCPUInfo.mockRejectedValueOnce(new Error('unavailable'));

    await initializeThreadCount();

    expect(modelStore.contextInitParams.n_threads).toBe(6);
    expect(modelStore.threadDefaultVersion).toBeUndefined();
    expect(modelStore.max_threads).toBe(4);
  });

  it('leaves the marker unset on an unsettled read and moves on the next settled one', async () => {
    givenStore({version: 15, threadDefaultVersion: undefined, n_threads: 6});
    getCPUInfo.mockResolvedValueOnce({
      ...PIXEL_9,
      cpuMaxFreqsKhz: [0, ...PIXEL_9.cpuMaxFreqsKhz.slice(1)],
    });

    await initializeThreadCount();

    expect(modelStore.contextInitParams.n_threads).toBe(6);
    expect(modelStore.threadDefaultVersion).toBeUndefined();

    await initializeThreadCount();

    expect(modelStore.contextInitParams.n_threads).toBe(4);
    expect(modelStore.threadDefaultVersion).toBe(2);
  });

  it('leaves iOS values unchanged', async () => {
    Platform.OS = 'ios';
    getCPUInfo.mockResolvedValue({cores: 6});
    givenStore({version: 15, threadDefaultVersion: undefined, n_threads: 4});

    await initializeThreadCount();

    expect(modelStore.contextInitParams.n_threads).toBe(4);
    expect(modelStore.threadDefaultVersion).toBe(2);
    expect(modelStore.max_threads).toBe(6);
  });

  it('keeps a slider move made while the CPU read is pending', async () => {
    givenStore({version: 15, threadDefaultVersion: undefined, n_threads: 6});
    let resolveCpu!: (info: typeof PIXEL_9) => void;
    getCPUInfo.mockReturnValueOnce(
      new Promise(resolve => {
        resolveCpu = resolve;
      }),
    );

    const pending = initializeThreadCount();
    modelStore.setNThreads(5);
    resolveCpu(PIXEL_9);
    await pending;

    expect(modelStore.contextInitParams.n_threads).toBe(5);
    expect(modelStore.threadDefaultVersion).toBe(2);
  });
});
