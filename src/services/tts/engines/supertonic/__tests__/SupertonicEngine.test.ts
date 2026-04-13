import {SupertonicEngine} from '..';
import {SUPERTONIC_VOICES} from '../voices';

describe('SupertonicEngine (v1.0 stub)', () => {
  const engine = new SupertonicEngine();
  const anyVoice = SUPERTONIC_VOICES[0];

  it('isInstalled() returns false', async () => {
    await expect(engine.isInstalled()).resolves.toBe(false);
  });

  it('getVoices() returns the 10-voice catalog', async () => {
    const voices = await engine.getVoices();
    expect(voices).toHaveLength(10);
    expect(voices.every(v => v.engine === 'supertonic')).toBe(true);
  });

  it('play() throws a clear "not installed" error', async () => {
    await expect(engine.play('hello', anyVoice)).rejects.toThrow(
      /not installed/i,
    );
  });

  it('stop() is a safe no-op', async () => {
    await expect(engine.stop()).resolves.toBeUndefined();
  });

  it('downloadModel() throws "not implemented in v1.0"', async () => {
    await expect(engine.downloadModel()).rejects.toThrow(/not implemented/i);
  });

  it('deleteModel() throws "not implemented in v1.0"', async () => {
    await expect(engine.deleteModel()).rejects.toThrow(/not implemented/i);
  });

  it('getModelPath() throws "not implemented in v1.0"', () => {
    expect(() => engine.getModelPath()).toThrow(/not implemented/i);
  });

  describe('playStreaming stub', () => {
    it('appendText silently accepts and finalize rejects with "not installed"', async () => {
      const handle = engine.playStreaming(anyVoice);
      expect(() => handle.appendText('hello ')).not.toThrow();
      expect(() => handle.appendText('world.')).not.toThrow();
      await expect(handle.finalize()).rejects.toThrow(
        /not installed \(enabled in v1\.2\)/i,
      );
    });

    it('cancel() is a safe no-op even before finalize', async () => {
      const handle = engine.playStreaming(anyVoice);
      handle.appendText('discarded');
      await expect(handle.cancel()).resolves.toBeUndefined();
    });

    it('finalize after cancel is a no-op (idempotent)', async () => {
      const handle = engine.playStreaming(anyVoice);
      await handle.cancel();
      await expect(handle.finalize()).resolves.toBeUndefined();
    });
  });
});
