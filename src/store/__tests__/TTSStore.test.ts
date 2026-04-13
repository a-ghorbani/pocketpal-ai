import {AppState} from 'react-native';
import DeviceInfo from 'react-native-device-info';

// Mock persistence BEFORE importing the store
jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn().mockReturnValue(Promise.resolve()),
}));

// AppState.addEventListener spy — capture registered handler so we can invoke it
const mockAppStateRemove = jest.fn();
const appStateHandlers: Array<(s: string) => void> = [];
const mockAddEventListener = jest.fn((event: string, handler: any) => {
  if (event === 'change') {
    appStateHandlers.push(handler);
  }
  return {remove: mockAppStateRemove};
});
jest
  .spyOn(AppState, 'addEventListener')
  .mockImplementation(mockAddEventListener as any);

// Mock the TTS service — we want to observe engine calls without invoking the
// real SystemEngine (which imports @mhpdev/react-native-speech).
const mockSystemPlay = jest.fn().mockResolvedValue(undefined);
const mockSystemStop = jest.fn().mockResolvedValue(undefined);
const mockSupertonicPlay = jest
  .fn()
  .mockRejectedValue(new Error('Supertonic not installed (enabled in v1.2)'));
const mockSupertonicStop = jest.fn().mockResolvedValue(undefined);
const mockConfigureAudioSession = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/tts', () => {
  const actual = jest.requireActual('../../services/tts');
  return {
    ...actual,
    configureAudioSession: () => mockConfigureAudioSession(),
    getEngine: (id: 'system' | 'supertonic') => {
      if (id === 'system') {
        return {
          id: 'system',
          isInstalled: jest.fn().mockResolvedValue(true),
          getVoices: jest.fn().mockResolvedValue([]),
          play: mockSystemPlay,
          stop: mockSystemStop,
        };
      }
      return {
        id: 'supertonic',
        isInstalled: jest.fn().mockResolvedValue(false),
        getVoices: jest.fn().mockResolvedValue([]),
        play: mockSupertonicPlay,
        stop: mockSupertonicStop,
      };
    },
  };
});

// Import after mocks
import {TTSStore} from '../TTSStore';
import type {Voice} from '../../services/tts';
import {chatSessionStore} from '../ChatSessionStore';

const SYSTEM_VOICE: Voice = {
  id: 'com.apple.voice.Sarah',
  name: 'Sarah',
  engine: 'system',
  language: 'en-US',
};

const SUPERTONIC_VOICE: Voice = {
  id: 'F1',
  name: 'Sarah',
  engine: 'supertonic',
  language: 'en',
  gender: 'f',
};

const GIB = 1024 * 1024 * 1024;

describe('TTSStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appStateHandlers.length = 0;
  });

  describe('memory gate', () => {
    it('sets isTTSAvailable=false when total memory < 6 GiB and registers no listeners', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(4 * GIB);

      const store = new TTSStore();
      await store.init();

      expect(store.isTTSAvailable).toBe(false);
      expect(mockAddEventListener).not.toHaveBeenCalled();
      expect(mockConfigureAudioSession).not.toHaveBeenCalled();
    });

    it('sets isTTSAvailable=true when total memory >= 6 GiB and registers listeners', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(6 * GIB);

      const store = new TTSStore();
      await store.init();

      expect(store.isTTSAvailable).toBe(true);
      expect(mockConfigureAudioSession).toHaveBeenCalledTimes(1);
      expect(mockAddEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function),
      );
    });

    it('is idempotent: second init() does not re-run memory check or re-register listeners', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(8 * GIB);

      const store = new TTSStore();
      await store.init();
      await store.init();

      expect(DeviceInfo.getTotalMemory).toHaveBeenCalledTimes(1);
      expect(mockAddEventListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('play() state machine', () => {
    const makeStore = async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(8 * GIB);
      const store = new TTSStore();
      await store.init();
      return store;
    };

    it('resolves engine via currentVoice and invokes engine.play()', async () => {
      const store = await makeStore();
      store.setCurrentVoice(SYSTEM_VOICE);

      await store.play('msg-1', 'hello');

      expect(mockSystemPlay).toHaveBeenCalledWith('hello', SYSTEM_VOICE);
      expect(store.playbackState).toBe('playing');
      expect(store.currentMessageId).toBe('msg-1');
    });

    it('stops previous utterance before starting a new one (play(B) while A playing)', async () => {
      const store = await makeStore();
      store.setCurrentVoice(SYSTEM_VOICE);

      await store.play('msg-A', 'first');
      mockSystemStop.mockClear();
      mockSystemPlay.mockClear();

      await store.play('msg-B', 'second');

      // stop() was called before the new play
      expect(mockSystemStop).toHaveBeenCalledTimes(1);
      expect(mockSystemPlay).toHaveBeenCalledWith('second', SYSTEM_VOICE);
      expect(store.currentMessageId).toBe('msg-B');
      expect(store.playbackState).toBe('playing');
    });

    it('no-ops when isTTSAvailable is false', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(2 * GIB);
      const store = new TTSStore();
      await store.init();
      store.setCurrentVoice(SYSTEM_VOICE);

      await store.play('msg-1', 'hello');

      expect(mockSystemPlay).not.toHaveBeenCalled();
      expect(store.playbackState).toBe('idle');
    });

    it('no-ops when currentVoice is null and no override', async () => {
      const store = await makeStore();

      await store.play('msg-1', 'hello');

      expect(mockSystemPlay).not.toHaveBeenCalled();
      expect(store.playbackState).toBe('idle');
    });

    it('swallows Supertonic stub "not installed" error and returns to idle', async () => {
      const store = await makeStore();
      store.setCurrentVoice(SUPERTONIC_VOICE);

      await expect(store.play('msg-1', 'hello')).resolves.toBeUndefined();

      expect(mockSupertonicPlay).toHaveBeenCalled();
      expect(store.playbackState).toBe('idle');
      expect(store.currentMessageId).toBeNull();
    });

    it('uses voiceOverride when provided', async () => {
      const store = await makeStore();
      store.setCurrentVoice(null);

      await store.play('msg-1', 'hello', SYSTEM_VOICE);

      expect(mockSystemPlay).toHaveBeenCalledWith('hello', SYSTEM_VOICE);
    });
  });

  describe('stop()', () => {
    it('resets state to idle and stops engine when a voice is set', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(8 * GIB);
      const store = new TTSStore();
      await store.init();
      store.setCurrentVoice(SYSTEM_VOICE);
      await store.play('msg-1', 'hello');

      await store.stop();

      expect(store.playbackState).toBe('idle');
      expect(store.currentMessageId).toBeNull();
      expect(mockSystemStop).toHaveBeenCalled();
    });
  });

  describe('onAssistantMessageComplete()', () => {
    const setupEligible = async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(8 * GIB);
      const store = new TTSStore();
      await store.init();
      store.setCurrentVoice(SYSTEM_VOICE);
      store.setAutoSpeak(true);
      return store;
    };

    it('plays when autoSpeakEnabled=true and a voice is selected', async () => {
      const store = await setupEligible();

      store.onAssistantMessageComplete('msg-1', 'hello world');
      // play() is async/fire-and-forget; flush microtasks
      await new Promise(r => setImmediate(r));

      expect(mockSystemPlay).toHaveBeenCalledWith('hello world', SYSTEM_VOICE);
      expect(store.lastSpokenMessageId).toBe('msg-1');
    });

    it('does NOT play when autoSpeakEnabled=false', async () => {
      const store = await setupEligible();
      store.setAutoSpeak(false);

      store.onAssistantMessageComplete('msg-1', 'hello');
      await new Promise(r => setImmediate(r));

      expect(mockSystemPlay).not.toHaveBeenCalled();
    });

    it('does NOT play when currentVoice is null', async () => {
      const store = await setupEligible();
      store.setCurrentVoice(null);

      store.onAssistantMessageComplete('msg-1', 'hello');
      await new Promise(r => setImmediate(r));

      expect(mockSystemPlay).not.toHaveBeenCalled();
    });

    it('does NOT play when isTTSAvailable is false', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(2 * GIB);
      const store = new TTSStore();
      await store.init();
      store.setCurrentVoice(SYSTEM_VOICE);
      store.setAutoSpeak(true);

      store.onAssistantMessageComplete('msg-1', 'hello');
      await new Promise(r => setImmediate(r));

      expect(mockSystemPlay).not.toHaveBeenCalled();
    });

    it('plays only once when invoked twice with the same messageId (lastSpokenMessageId guard)', async () => {
      const store = await setupEligible();

      store.onAssistantMessageComplete('msg-1', 'hello');
      await new Promise(r => setImmediate(r));
      store.onAssistantMessageComplete('msg-1', 'hello');
      await new Promise(r => setImmediate(r));

      expect(mockSystemPlay).toHaveBeenCalledTimes(1);
    });

    it('plays again for a different messageId', async () => {
      const store = await setupEligible();

      store.onAssistantMessageComplete('msg-1', 'hello');
      await new Promise(r => setImmediate(r));
      store.onAssistantMessageComplete('msg-2', 'world');
      await new Promise(r => setImmediate(r));

      expect(mockSystemPlay).toHaveBeenCalledTimes(2);
    });
  });

  describe('AppState → background stops playback', () => {
    it('calls stop when AppState transitions to background', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(8 * GIB);
      const store = new TTSStore();
      await store.init();
      store.setCurrentVoice(SYSTEM_VOICE);
      await store.play('msg-1', 'hello');

      expect(appStateHandlers.length).toBeGreaterThan(0);
      const handler = appStateHandlers[appStateHandlers.length - 1];
      mockSystemStop.mockClear();

      handler('background');
      await new Promise(r => setImmediate(r));

      expect(mockSystemStop).toHaveBeenCalled();
      expect(store.playbackState).toBe('idle');
    });

    it('does NOT stop on active/foreground transitions', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(8 * GIB);
      const store = new TTSStore();
      await store.init();
      store.setCurrentVoice(SYSTEM_VOICE);
      await store.play('msg-1', 'hello');

      const handler = appStateHandlers[appStateHandlers.length - 1];
      mockSystemStop.mockClear();

      handler('active');
      await new Promise(r => setImmediate(r));

      expect(mockSystemStop).not.toHaveBeenCalled();
    });
  });

  describe('chat session change stops playback', () => {
    it('stops when chatSessionStore.activeSessionId changes', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(8 * GIB);
      const store = new TTSStore();
      await store.init();
      store.setCurrentVoice(SYSTEM_VOICE);
      await store.play('msg-1', 'hello');

      mockSystemStop.mockClear();

      // Mutate the active session id; the MobX reaction inside init() should fire
      (chatSessionStore as any).activeSessionId = 'session-new-id';
      await new Promise(r => setImmediate(r));

      expect(mockSystemStop).toHaveBeenCalled();
      expect(store.playbackState).toBe('idle');
    });
  });

  describe('setters', () => {
    it('setAutoSpeak toggles the observable', () => {
      const store = new TTSStore();
      store.setAutoSpeak(true);
      expect(store.autoSpeakEnabled).toBe(true);
      store.setAutoSpeak(false);
      expect(store.autoSpeakEnabled).toBe(false);
    });

    it('setCurrentVoice updates currentVoice', () => {
      const store = new TTSStore();
      store.setCurrentVoice(SYSTEM_VOICE);
      expect(store.currentVoice).toEqual(SYSTEM_VOICE);
      store.setCurrentVoice(null);
      expect(store.currentVoice).toBeNull();
    });

    it('openSetupSheet/closeSetupSheet toggle isSetupSheetOpen', () => {
      const store = new TTSStore();
      expect(store.isSetupSheetOpen).toBe(false);
      store.openSetupSheet();
      expect(store.isSetupSheetOpen).toBe(true);
      store.closeSetupSheet();
      expect(store.isSetupSheetOpen).toBe(false);
    });
  });
});
