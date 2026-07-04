import {
  WhisperSTTEngine,
  SystemSTTEngine,
  sttRuntime,
  getEngine,
  getAllEngines,
  resetSTTEngines,
  registerSTTEngines,
} from '../index';

// Mock react-native Platform
jest.mock('react-native', () => ({
  Platform: {OS: 'ios'},
  PermissionsAndroid: {
    PERMISSIONS: {RECORD_AUDIO: 'android.permission.RECORD_AUDIO'},
    RESULTS: {GRANTED: 'granted'},
    request: jest.fn().mockResolvedValue('granted'),
  },
}));

describe('STT Engine Registry', () => {
  beforeEach(() => {
    resetSTTEngines();
  });

  it('registers whisper and system engines', () => {
    registerSTTEngines();
    const engines = getAllEngines();
    expect(engines).toHaveLength(2);
    expect(engines.find(e => e.id === 'whisper')).toBeDefined();
    expect(engines.find(e => e.id === 'system')).toBeDefined();
  });

  it('getEngine returns correct engine by id', () => {
    registerSTTEngines();
    const whisper = getEngine('whisper');
    const system = getEngine('system');
    expect(whisper).toBeDefined();
    expect(whisper?.id).toBe('whisper');
    expect(system).toBeDefined();
    expect(system?.id).toBe('system');
  });

  it('getEngine returns undefined for unknown id', () => {
    registerSTTEngines();
    expect(getEngine('nonexistent' as any)).toBeUndefined();
  });

  it('is idempotent', () => {
    registerSTTEngines();
    registerSTTEngines();
    expect(getAllEngines()).toHaveLength(2);
  });
});

describe('WhisperSTTEngine', () => {
  const engine = new WhisperSTTEngine();

  it('exposes id "whisper"', () => {
    expect(engine.id).toBe('whisper');
  });

  it('requires a model', () => {
    expect(engine.requiresModel()).toBe(true);
  });

  it('is not available without a loaded model', async () => {
    const available = await engine.isAvailable();
    expect(available).toBe(false);
  });

  it('throws when starting without a model', async () => {
    const callbacks = {};
    await expect(engine.start(callbacks)).rejects.toThrow(/model not loaded/);
  });

  it('becomes available after loading a model', async () => {
    await engine.loadModel('/path/to/whisper-tiny.gguf');
    expect(engine.isModelLoaded()).toBe(true);
    const available = await engine.isAvailable();
    expect(available).toBe(true);
  });

  it('can start after model is loaded', async () => {
    await engine.loadModel('/path/to/model.gguf');
    let started = false;
    await engine.start({
      onStart: () => {
        started = true;
      },
    });
    expect(started).toBe(true);
    await engine.cancel();
  });

  it('throws when starting while already active', async () => {
    await engine.loadModel('/path/to/model.gguf');
    await engine.start({});
    await expect(engine.start({})).rejects.toThrow(/already listening/);
    await engine.cancel();
  });

  it('stop delivers result', async () => {
    await engine.loadModel('/path/to/model.gguf');
    let result: any = null;
    await engine.start({
      onResult: r => {
        result = r;
      },
    });
    await engine.stop();
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('text');
  });

  it('cancel clears state', async () => {
    await engine.loadModel('/path/to/model.gguf');
    let ended = false;
    await engine.start({
      onEnd: () => {
        ended = true;
      },
    });
    await engine.cancel();
    expect(ended).toBe(true);
  });

  it('unloadModel makes engine unavailable', async () => {
    await engine.loadModel('/path/to/model.gguf');
    await engine.unloadModel();
    expect(engine.isModelLoaded()).toBe(false);
    const available = await engine.isAvailable();
    expect(available).toBe(false);
  });

  it('isPlatformSupported returns true on ios/android', () => {
    expect(WhisperSTTEngine.isPlatformSupported()).toBe(true);
  });
});

describe('SystemSTTEngine', () => {
  const engine = new SystemSTTEngine();

  it('exposes id "system"', () => {
    expect(engine.id).toBe('system');
  });

  it('does not require a model', () => {
    expect(engine.requiresModel()).toBe(false);
  });

  it('is available on ios/android', async () => {
    const available = await engine.isAvailable();
    expect(available).toBe(true);
  });

  it('can start and stop', async () => {
    let started = false;
    let result: any = null;
    let ended = false;

    await engine.start({
      onStart: () => {
        started = true;
      },
      onResult: r => {
        result = r;
      },
      onEnd: () => {
        ended = true;
      },
    });

    expect(started).toBe(true);

    await engine.stop();

    expect(result).not.toBeNull();
    expect(result).toHaveProperty('text');
    expect(ended).toBe(true);
  });

  it('throws when starting while already active', async () => {
    await engine.start({});
    await expect(engine.start({})).rejects.toThrow(/already listening/);
    await engine.cancel();
  });

  it('cancel clears state', async () => {
    let ended = false;
    await engine.start({
      onEnd: () => {
        ended = true;
      },
    });
    await engine.cancel();
    expect(ended).toBe(true);
  });

  it('isSystemSupported returns true on ios/android', async () => {
    const supported = await SystemSTTEngine.isSystemSupported();
    expect(supported).toBe(true);
  });
});

describe('STTRuntime', () => {
  beforeEach(() => {
    // Reset runtime state
    sttRuntime.cancel();
  });

  it('starts with system engine when whisper is not available', async () => {
    let started = false;
    await sttRuntime.start({
      onStart: () => {
        started = true;
      },
    });

    expect(started).toBe(true);
    expect(sttRuntime.getIsActive()).toBe(true);

    const active = sttRuntime.getActiveEngine();
    expect(active).toBeDefined();
    expect(active?.id).toBe('system');

    await sttRuntime.stop();
  });

  it('prefers whisper when available', async () => {
    // Make whisper available
    const whisper = getEngine('whisper') as WhisperSTTEngine;
    if (whisper) {
      await whisper.loadModel('/path/to/model.gguf');
    }

    await sttRuntime.start({});

    const active = sttRuntime.getActiveEngine();
    expect(active?.id).toBe('whisper');

    await sttRuntime.stop();

    if (whisper) {
      await whisper.unloadModel();
    }
  });

  it('throws when already listening', async () => {
    await sttRuntime.start({});
    await expect(sttRuntime.start({})).rejects.toThrow(/already listening/);
    await sttRuntime.stop();
  });

  it('cancel stops and clears state', async () => {
    await sttRuntime.start({});
    expect(sttRuntime.getIsActive()).toBe(true);

    await sttRuntime.cancel();
    expect(sttRuntime.getIsActive()).toBe(false);
    expect(sttRuntime.getActiveEngine()).toBeNull();
  });

  it('stop delivers result and clears state', async () => {
    let gotResult = false;
    await sttRuntime.start({
      onResult: () => {
        gotResult = true;
      },
    });

    await sttRuntime.stop();

    expect(gotResult).toBe(true);
    expect(sttRuntime.getIsActive()).toBe(false);
  });
});
