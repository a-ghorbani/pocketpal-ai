import Speech from '@pocketpalai/react-native-speech';

import {ttsRuntime} from '../runtime';
import type {Engine, EngineId} from '../types';

const makeEngine = (id: EngineId): Engine => {
  const engine: Engine = {
    id,
    isInstalled: jest.fn().mockResolvedValue(true),
    getVoices: jest.fn().mockResolvedValue([]),
    loadInto: jest.fn().mockResolvedValue(undefined),
    play: jest.fn().mockResolvedValue(undefined),
    playStreaming: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
  };
  return engine;
};

const releaseMock = (Speech.release as jest.Mock) ?? jest.fn();
const stopMock = (Speech.stop as jest.Mock) ?? jest.fn();

describe('ttsRuntime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ttsRuntime._resetForTests();
  });

  it('loads an engine on first acquire', async () => {
    const kokoro = makeEngine('kokoro');
    const work = jest.fn().mockResolvedValue('result');

    const out = await ttsRuntime.acquire(kokoro, work);

    expect(kokoro.loadInto).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledTimes(1);
    expect(out).toBe('result');
    expect(ttsRuntime.getActiveEngineId()).toBe('kokoro');
  });

  it('reuses the loaded engine on subsequent acquires (no re-init)', async () => {
    const kokoro = makeEngine('kokoro');
    await ttsRuntime.acquire(kokoro, async () => undefined);
    await ttsRuntime.acquire(kokoro, async () => undefined);
    expect(kokoro.loadInto).toHaveBeenCalledTimes(1);
  });

  it('releases the previous engine and loads the new one when ids differ', async () => {
    const kokoro = makeEngine('kokoro');
    const kitten = makeEngine('kitten');

    await ttsRuntime.acquire(kokoro, async () => undefined);
    await ttsRuntime.acquire(kitten, async () => undefined);

    expect(kokoro.loadInto).toHaveBeenCalledTimes(1);
    expect(kitten.loadInto).toHaveBeenCalledTimes(1);
    expect(releaseMock).toHaveBeenCalledTimes(1);
    expect(ttsRuntime.getActiveEngineId()).toBe('kitten');
  });

  it('A → B → A re-initializes A (closes the per-wrapper-flag bug)', async () => {
    const kokoro = makeEngine('kokoro');
    const kitten = makeEngine('kitten');

    await ttsRuntime.acquire(kokoro, async () => undefined);
    await ttsRuntime.acquire(kitten, async () => undefined);
    await ttsRuntime.acquire(kokoro, async () => undefined);

    // Kokoro must be loaded twice now — once originally, once after kitten
    // displaced it. The previous design short-circuited the second load.
    expect(kokoro.loadInto).toHaveBeenCalledTimes(2);
  });

  it('does not call Speech.release when releasing the system engine', async () => {
    const system = makeEngine('system');
    await ttsRuntime.acquire(system, async () => undefined);
    await ttsRuntime.release();
    // System loadInto IS called (the wrapper sets up OS_NATIVE) but we
    // never need to free neural resources for it.
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it('serializes concurrent acquires onto different engines', async () => {
    const kokoro = makeEngine('kokoro');
    const kitten = makeEngine('kitten');
    const order: string[] = [];

    (kokoro.loadInto as jest.Mock).mockImplementation(async () => {
      order.push('load:kokoro');
    });
    (kitten.loadInto as jest.Mock).mockImplementation(async () => {
      order.push('load:kitten');
    });
    const op1 = ttsRuntime.acquire(kokoro, async () => {
      order.push('work:kokoro');
    });
    const op2 = ttsRuntime.acquire(kitten, async () => {
      order.push('work:kitten');
    });

    await Promise.all([op1, op2]);

    // Strict serialization: kokoro must fully run before kitten begins.
    expect(order).toEqual([
      'load:kokoro',
      'work:kokoro',
      'load:kitten',
      'work:kitten',
    ]);
  });

  it('release after acquire clears the active engine and frees neural', async () => {
    const kokoro = makeEngine('kokoro');
    await ttsRuntime.acquire(kokoro, async () => undefined);

    await ttsRuntime.release();

    expect(releaseMock).toHaveBeenCalledTimes(1);
    expect(ttsRuntime.getActiveEngineId()).toBeNull();

    // Next acquire on kokoro should re-load.
    await ttsRuntime.acquire(kokoro, async () => undefined);
    expect(kokoro.loadInto).toHaveBeenCalledTimes(2);
  });

  describe('stop()', () => {
    it('is a no-op when no engine is active', async () => {
      await ttsRuntime.stop();
      expect(stopMock).not.toHaveBeenCalled();
    });

    it('calls Speech.stop when an engine is active', async () => {
      const kokoro = makeEngine('kokoro');
      await ttsRuntime.acquire(kokoro, async () => undefined);

      await ttsRuntime.stop();

      expect(stopMock).toHaveBeenCalledTimes(1);
      // Stop must NOT release — the engine stays loaded so the next play
      // starts immediately without paying re-init cost.
      expect(ttsRuntime.getActiveEngineId()).toBe('kokoro');
    });

    it('serializes a stop ordered before a new acquire on the same engine', async () => {
      // This is the B2 fix: when JS issues stop() then immediately starts
      // a new utterance, the FIFO mutex guarantees the native stop
      // completes before the new speak begins.
      const kokoro = makeEngine('kokoro');
      await ttsRuntime.acquire(kokoro, async () => undefined);

      const order: string[] = [];
      stopMock.mockImplementationOnce(async () => {
        order.push('native:stop');
      });
      const work = jest.fn().mockImplementation(async () => {
        order.push('native:speak');
      });

      const stopPromise = ttsRuntime.stop();
      const speakPromise = ttsRuntime.acquire(kokoro, work);

      await Promise.all([stopPromise, speakPromise]);

      expect(order).toEqual(['native:stop', 'native:speak']);
    });
  });

  describe('rejection chain health', () => {
    it('keeps the chain alive when loadInto rejects', async () => {
      const broken = makeEngine('kokoro');
      (broken.loadInto as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      await expect(
        ttsRuntime.acquire(broken, async () => 'ok'),
      ).rejects.toThrow('boom');
      // activeEngineId stays null — the failed load did not become active.
      expect(ttsRuntime.getActiveEngineId()).toBeNull();

      // The next acquire must still work.
      const kitten = makeEngine('kitten');
      const out = await ttsRuntime.acquire(kitten, async () => 'second');
      expect(out).toBe('second');
      expect(ttsRuntime.getActiveEngineId()).toBe('kitten');
    });

    it('keeps the chain alive when the work fn rejects', async () => {
      const kokoro = makeEngine('kokoro');
      await expect(
        ttsRuntime.acquire(kokoro, async () => {
          throw new Error('work-failed');
        }),
      ).rejects.toThrow('work-failed');
      // The engine is still loaded — only the work failed.
      expect(ttsRuntime.getActiveEngineId()).toBe('kokoro');

      // Next acquire on the same engine must still succeed without re-init.
      await ttsRuntime.acquire(kokoro, async () => undefined);
      expect(kokoro.loadInto).toHaveBeenCalledTimes(1);
    });
  });
});
