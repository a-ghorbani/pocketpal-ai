import {runInAction} from 'mobx';
import * as RNFS from '@dr.pogodin/react-native-fs';
import Speech from '@pocketpalai/react-native-speech';

import {ttsRuntime} from '../../services/tts';
import {ttsStore} from '../../store/TTSStore';
import {runTtsCommand} from '../ttsAutomation';

import {
  __emitFinish,
  __emitStart,
  __finishListenerCount,
  __resetFinishListeners,
  __resetStartListeners,
  __startListenerCount,
} from '../../../__mocks__/external/@pocketpalai/react-native-speech';

const mockEngine = {
  id: 'phonon',
  getVoices: jest.fn().mockResolvedValue([{id: 'Zoey'}]),
  loadInto: jest.fn().mockResolvedValue(undefined),
  isInstalled: jest.fn().mockResolvedValue(false),
  play: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../store/TTSStore', () => ({
  ttsStore: require('../../../__mocks__/stores/ttsStore').mockTTSStore,
}));

jest.mock('../../services/tts', () => ({
  ...jest.requireActual('../../services/tts'),
  getEngine: () => mockEngine,
}));

/** Speak that plays one buffer: onStart after `startMs`, onFinish after `endMs`. */
const playsOneBuffer = (startMs: number, endMs: number, finish = true) =>
  new Promise<void>(resolve => {
    setTimeout(() => __emitStart(), startMs);
    setTimeout(() => {
      if (finish) {
        __emitFinish();
      }
      resolve();
    }, endMs);
  });

const lastStatus = () => {
  const calls = (RNFS.writeFile as jest.Mock).mock.calls;
  return JSON.parse(calls[calls.length - 1][1]);
};

const runTimed = async (cmd: string) => {
  const done = runTtsCommand(cmd);
  await jest.advanceTimersByTimeAsync(20_000);
  await done;
  return lastStatus();
};

describe('ttsAutomation time::<engine>', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    __resetFinishListeners();
    __resetStartListeners();
    ttsRuntime._resetForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports time to first audio and real-time factor from onStart and onFinish', async () => {
    (Speech.speak as jest.Mock).mockImplementation(() =>
      playsOneBuffer(300, 2300),
    );

    const status = await runTimed('time::phonon');

    expect(status.state).toBe('done');
    expect(status.detail.runs).toHaveLength(3);
    expect(status.detail.runs[0]).toEqual({
      ttfaMs: 300,
      audioMs: 2000,
      rtf: 0.15,
      starts: 1,
    });
    expect(status.detail.medianTtfaMs).toBe(300);
    expect(status.detail.medianRtf).toBe(0.15);
  });

  it('loads the engine once, untimed, before the timed runs', async () => {
    (Speech.speak as jest.Mock).mockImplementation(() =>
      playsOneBuffer(300, 2300),
    );

    await runTimed('time::phonon');

    expect(mockEngine.loadInto).toHaveBeenCalledTimes(1);
    expect(Speech.speak).toHaveBeenCalledTimes(3);
    expect(Speech.speak).toHaveBeenCalledWith(expect.any(String), 'Zoey');
  });

  it('reports the median of the three runs', async () => {
    (Speech.speak as jest.Mock)
      .mockImplementationOnce(() => playsOneBuffer(300, 2300))
      .mockImplementationOnce(() => playsOneBuffer(500, 2500))
      .mockImplementationOnce(() => playsOneBuffer(400, 2400));

    const status = await runTimed('time::kitten');

    expect(status.detail.medianTtfaMs).toBe(400);
    expect(status.detail.medianRtf).toBe(0.2);
  });

  it('measures audio up to speak resolving when no onFinish arrives', async () => {
    (Speech.speak as jest.Mock).mockImplementation(() =>
      playsOneBuffer(300, 1300, false),
    );

    const status = await runTimed('time::phonon');

    expect(status.detail.runs[0].audioMs).toBe(1000);
    expect(status.detail.runs[0].rtf).toBe(0.3);
  });

  it('counts every onStart so a multi-chunk run stands out', async () => {
    (Speech.speak as jest.Mock).mockImplementation(
      () =>
        new Promise<void>(resolve => {
          setTimeout(() => __emitStart(), 300);
          setTimeout(() => __emitStart(), 1300);
          setTimeout(() => {
            __emitFinish();
            resolve();
          }, 2300);
        }),
    );

    const status = await runTimed('time::phonon');

    expect(status.detail.runs[0].starts).toBe(2);
  });

  it('removes its listeners after every run, including a failed one', async () => {
    (Speech.speak as jest.Mock)
      .mockImplementationOnce(() => playsOneBuffer(300, 2300))
      .mockRejectedValueOnce(new Error('synth failed'));

    const status = await runTimed('time::phonon');

    expect(status.state).toBe('error');
    expect(status.detail).toBe('synth failed');
    expect(__startListenerCount()).toBe(0);
    expect(__finishListenerCount()).toBe(0);
  });

  it('fails when the engine never starts playing', async () => {
    (Speech.speak as jest.Mock).mockResolvedValue(undefined);

    const status = await runTimed('time::phonon');

    expect(status.state).toBe('error');
    expect(status.detail).toMatch(/no onStart/);
  });
});

describe('ttsAutomation download and synthesize for Phonon', () => {
  const downloadPhonon = ttsStore.downloadPhonon as jest.Mock;
  const downloadKitten = ttsStore.downloadKitten as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    downloadPhonon.mockImplementation(async () => {
      runInAction(() => {
        ttsStore.phononDownloadState = 'ready';
      });
    });
  });

  afterEach(() => {
    downloadPhonon.mockReset();
    runInAction(() => {
      ttsStore.phononDownloadState = 'not_installed';
    });
  });

  it('download::phonon installs Phonon, not another engine', async () => {
    await runTtsCommand('download::phonon');

    expect(lastStatus()).toEqual({cmd: 'download::phonon', state: 'done'});
    expect(downloadPhonon).toHaveBeenCalledTimes(1);
    expect(downloadKitten).not.toHaveBeenCalled();
  });

  it('download::phonon skips the download when Phonon is already installed', async () => {
    mockEngine.isInstalled
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    await runTtsCommand('download::phonon');

    expect(lastStatus().state).toBe('done');
    expect(downloadPhonon).not.toHaveBeenCalled();
  });

  it('download::phonon reports an error when the download leaves Phonon not ready', async () => {
    downloadPhonon.mockResolvedValueOnce(undefined);

    await runTtsCommand('download::phonon');

    expect(lastStatus()).toEqual({
      cmd: 'download::phonon',
      state: 'error',
      detail: 'download did not leave phonon ready',
    });
  });

  it('synthesize::phonon speaks the sample with the first voice', async () => {
    await runTtsCommand('synthesize::phonon');

    expect(lastStatus().state).toBe('done');
    expect(mockEngine.play).toHaveBeenCalledWith(expect.any(String), {
      id: 'Zoey',
    });
  });
});

describe('ttsAutomation download::<engine>', () => {
  const engines = [
    ['kitten', 'downloadKitten', 'kittenDownloadState'],
    ['kokoro', 'downloadKokoro', 'kokoroDownloadState'],
    ['supertonic', 'downloadSupertonic', 'supertonicDownloadState'],
    ['phonon', 'downloadPhonon', 'phononDownloadState'],
  ] as const;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(engines)(
    'download::%s calls only its own download and reads its own state',
    async (engine, download, state) => {
      const store = ttsStore as unknown as Record<string, unknown>;
      (store[download] as jest.Mock).mockImplementationOnce(async () => {
        runInAction(() => {
          store[state] = 'ready';
        });
      });

      await runTtsCommand(`download::${engine}`);

      expect(lastStatus()).toEqual({cmd: `download::${engine}`, state: 'done'});
      for (const [, other] of engines) {
        expect(store[other]).toHaveBeenCalledTimes(other === download ? 1 : 0);
      }
      runInAction(() => {
        store[state] = 'not_installed';
      });
    },
  );

  it('reports an unknown command as an error', async () => {
    await runTtsCommand('dance');

    expect(lastStatus()).toEqual({
      cmd: 'dance',
      state: 'error',
      detail: 'unknown tts cmd: dance',
    });
  });
});
