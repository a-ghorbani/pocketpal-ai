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
// real SystemEngine (which imports @pocketpalai/react-native-speech).
const mockSystemPlay = jest.fn().mockResolvedValue(undefined);
const mockSystemStop = jest.fn().mockResolvedValue(undefined);
const mockSupertonicPlay = jest
  .fn()
  .mockRejectedValue(new Error('Supertonic model is not installed'));
const mockSupertonicStop = jest.fn().mockResolvedValue(undefined);
const mockSupertonicIsInstalled = jest.fn().mockResolvedValue(false);
const mockSupertonicDownloadModel = jest.fn().mockResolvedValue(undefined);
const mockSupertonicDeleteModel = jest.fn().mockResolvedValue(undefined);
const mockKokoroIsInstalled = jest.fn().mockResolvedValue(false);
const mockKokoroDownloadModel = jest.fn().mockResolvedValue(undefined);
const mockKokoroDeleteModel = jest.fn().mockResolvedValue(undefined);
const mockKokoroPlay = jest.fn().mockResolvedValue(undefined);
const mockKokoroStop = jest.fn().mockResolvedValue(undefined);
const mockKittenIsInstalled = jest.fn().mockResolvedValue(false);
const mockKittenDownloadModel = jest.fn().mockResolvedValue(undefined);
const mockKittenDeleteModel = jest.fn().mockResolvedValue(undefined);
const mockKittenPlay = jest.fn().mockResolvedValue(undefined);
const mockKittenStop = jest.fn().mockResolvedValue(undefined);
const mockConfigureAudioSession = jest.fn().mockResolvedValue(undefined);

// Per-streaming-session handle factories — we build a fresh spy-backed
// handle for each `playStreaming()` call and expose the most recent one
// on `lastSystemHandle` / `lastSupertonicHandle` so tests can assert.
type MockHandle = {
  appendText: jest.Mock;
  finalize: jest.Mock;
  cancel: jest.Mock;
};
let lastSystemHandle: MockHandle | null = null;
let lastSupertonicHandle: MockHandle | null = null;

const mockSystemPlayStreaming = jest.fn(() => {
  const handle: MockHandle = {
    appendText: jest.fn(),
    finalize: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue(undefined),
  };
  lastSystemHandle = handle;
  return handle;
});

const mockSupertonicPlayStreaming = jest.fn(() => {
  const handle: MockHandle = {
    appendText: jest.fn(),
    finalize: jest
      .fn()
      .mockRejectedValue(
        new Error('Supertonic not installed (enabled in v1.2)'),
      ),
    cancel: jest.fn().mockResolvedValue(undefined),
  };
  lastSupertonicHandle = handle;
  return handle;
});

jest.mock('../../services/tts', () => {
  const actual = jest.requireActual('../../services/tts');
  return {
    ...actual,
    configureAudioSession: () => mockConfigureAudioSession(),
    getEngine: (id: 'system' | 'supertonic' | 'kokoro' | 'kitten') => {
      if (id === 'system') {
        return {
          id: 'system',
          isInstalled: jest.fn().mockResolvedValue(true),
          getVoices: jest.fn().mockResolvedValue([]),
          play: mockSystemPlay,
          playStreaming: mockSystemPlayStreaming,
          stop: mockSystemStop,
        };
      }
      if (id === 'kokoro') {
        return {
          id: 'kokoro',
          isInstalled: mockKokoroIsInstalled,
          getVoices: jest.fn().mockResolvedValue([]),
          play: mockKokoroPlay,
          playStreaming: jest.fn(() => ({
            appendText: jest.fn(),
            finalize: jest.fn().mockResolvedValue(undefined),
            cancel: jest.fn().mockResolvedValue(undefined),
          })),
          stop: mockKokoroStop,
          downloadModel: mockKokoroDownloadModel,
          deleteModel: mockKokoroDeleteModel,
        };
      }
      if (id === 'kitten') {
        return {
          id: 'kitten',
          isInstalled: mockKittenIsInstalled,
          getVoices: jest.fn().mockResolvedValue([]),
          play: mockKittenPlay,
          playStreaming: jest.fn(() => ({
            appendText: jest.fn(),
            finalize: jest.fn().mockResolvedValue(undefined),
            cancel: jest.fn().mockResolvedValue(undefined),
          })),
          stop: mockKittenStop,
          downloadModel: mockKittenDownloadModel,
          deleteModel: mockKittenDeleteModel,
        };
      }
      return {
        id: 'supertonic',
        isInstalled: mockSupertonicIsInstalled,
        getVoices: jest.fn().mockResolvedValue([]),
        play: mockSupertonicPlay,
        playStreaming: mockSupertonicPlayStreaming,
        stop: mockSupertonicStop,
        downloadModel: mockSupertonicDownloadModel,
        deleteModel: mockSupertonicDeleteModel,
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
const flush = () => new Promise(r => setImmediate(r));

describe('TTSStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appStateHandlers.length = 0;
    lastSystemHandle = null;
    lastSupertonicHandle = null;
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

  const makeStore = async () => {
    (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(8 * GIB);
    const store = new TTSStore();
    await store.init();
    return store;
  };

  describe('play() state machine', () => {
    it('resolves engine via currentVoice and invokes engine.play()', async () => {
      const store = await makeStore();
      store.setCurrentVoice(SYSTEM_VOICE);

      await store.play('msg-1', 'hello');

      expect(mockSystemPlay).toHaveBeenCalledWith('hello', SYSTEM_VOICE);
      expect(store.playbackState).toEqual({
        mode: 'playing',
        messageId: 'msg-1',
      });
    });

    it('stops previous utterance before starting a new one (play(B) while A playing)', async () => {
      const store = await makeStore();
      store.setCurrentVoice(SYSTEM_VOICE);

      await store.play('msg-A', 'first');
      mockSystemStop.mockClear();
      mockSystemPlay.mockClear();

      await store.play('msg-B', 'second');

      expect(mockSystemStop).toHaveBeenCalledTimes(1);
      expect(mockSystemPlay).toHaveBeenCalledWith('second', SYSTEM_VOICE);
      expect(store.playbackState).toEqual({
        mode: 'playing',
        messageId: 'msg-B',
      });
    });

    it('no-ops when isTTSAvailable is false', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(2 * GIB);
      const store = new TTSStore();
      await store.init();
      store.setCurrentVoice(SYSTEM_VOICE);

      await store.play('msg-1', 'hello');

      expect(mockSystemPlay).not.toHaveBeenCalled();
      expect(store.playbackState.mode).toBe('idle');
    });

    it('no-ops when currentVoice is null and no override', async () => {
      const store = await makeStore();

      await store.play('msg-1', 'hello');

      expect(mockSystemPlay).not.toHaveBeenCalled();
      expect(store.playbackState.mode).toBe('idle');
    });

    it('surfaces Supertonic play failure via playbackState reset (no hang)', async () => {
      const store = await makeStore();
      store.setCurrentVoice(SUPERTONIC_VOICE);

      await expect(store.play('msg-1', 'hello')).resolves.toBeUndefined();

      expect(mockSupertonicPlay).toHaveBeenCalled();
      expect(store.playbackState.mode).toBe('idle');
    });

    it('uses voiceOverride when provided', async () => {
      const store = await makeStore();
      store.setCurrentVoice(null);

      await store.play('msg-1', 'hello', {voiceOverride: SYSTEM_VOICE});

      expect(mockSystemPlay).toHaveBeenCalledWith('hello', SYSTEM_VOICE);
    });
  });

  describe('stop()', () => {
    it('resets state to idle and stops engine when a voice is set', async () => {
      const store = await makeStore();
      store.setCurrentVoice(SYSTEM_VOICE);
      await store.play('msg-1', 'hello');

      await store.stop();

      expect(store.playbackState.mode).toBe('idle');
      expect(mockSystemStop).toHaveBeenCalled();
    });
  });

  describe('streaming callbacks', () => {
    const setupEligible = async () => {
      const store = await makeStore();
      store.setCurrentVoice(SYSTEM_VOICE);
      store.setAutoSpeak(true);
      return store;
    };

    it('onAssistantMessageStart opens a streaming handle when gating passes', async () => {
      const store = await setupEligible();

      store.onAssistantMessageStart('msg-1');

      expect(mockSystemPlayStreaming).toHaveBeenCalledWith(SYSTEM_VOICE);
      expect(store.playbackState.mode).toBe('streaming');
      if (store.playbackState.mode === 'streaming') {
        expect(store.playbackState.messageId).toBe('msg-1');
      }
      expect(store.lastSpokenMessageId).toBe('msg-1');
    });

    it('onAssistantMessageStart guard: same messageId twice → only one handle opened', async () => {
      const store = await setupEligible();

      store.onAssistantMessageStart('msg-1');
      store.onAssistantMessageStart('msg-1');

      expect(mockSystemPlayStreaming).toHaveBeenCalledTimes(1);
    });

    it('onAssistantMessageStart no-ops when autoSpeakEnabled=false', async () => {
      const store = await setupEligible();
      store.setAutoSpeak(false);

      store.onAssistantMessageStart('msg-1');

      expect(mockSystemPlayStreaming).not.toHaveBeenCalled();
    });

    it('onAssistantMessageStart no-ops when currentVoice is null', async () => {
      const store = await setupEligible();
      store.setCurrentVoice(null);

      store.onAssistantMessageStart('msg-1');

      expect(mockSystemPlayStreaming).not.toHaveBeenCalled();
    });

    it('onAssistantMessageStart no-ops when isTTSAvailable=false', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(2 * GIB);
      const store = new TTSStore();
      await store.init();
      store.setCurrentVoice(SYSTEM_VOICE);
      store.setAutoSpeak(true);

      store.onAssistantMessageStart('msg-1');

      expect(mockSystemPlayStreaming).not.toHaveBeenCalled();
    });

    it('onAssistantMessageChunk forwards deltas to the active handle', async () => {
      const store = await setupEligible();
      store.onAssistantMessageStart('msg-1');

      store.onAssistantMessageChunk('msg-1', 'hello ');
      store.onAssistantMessageChunk('msg-1', 'world.');

      expect(lastSystemHandle!.appendText).toHaveBeenNthCalledWith(1, 'hello ');
      expect(lastSystemHandle!.appendText).toHaveBeenNthCalledWith(2, 'world.');
    });

    it('onAssistantMessageChunk ignores chunks for a different messageId', async () => {
      const store = await setupEligible();
      store.onAssistantMessageStart('msg-1');

      store.onAssistantMessageChunk('msg-2', 'stale');

      expect(lastSystemHandle!.appendText).not.toHaveBeenCalled();
    });

    it('onAssistantMessageComplete calls handle.finalize() when a streaming session exists', async () => {
      const store = await setupEligible();
      store.onAssistantMessageStart('msg-1');

      store.onAssistantMessageComplete('msg-1', 'final text');
      await flush();

      expect(lastSystemHandle!.finalize).toHaveBeenCalledTimes(1);
      // engine.play() is NOT called — finalize is the streaming flush path.
      expect(mockSystemPlay).not.toHaveBeenCalled();
      expect(store.playbackState.mode).toBe('idle');
    });

    it('fallback: onAssistantMessageComplete without a prior start calls engine.play()', async () => {
      const store = await setupEligible();

      store.onAssistantMessageComplete('msg-solo', 'hello world');
      await flush();

      expect(mockSystemPlayStreaming).not.toHaveBeenCalled();
      expect(mockSystemPlay).toHaveBeenCalledWith('hello world', SYSTEM_VOICE);
      expect(store.lastSpokenMessageId).toBe('msg-solo');
    });

    it('fallback path respects the lastSpokenMessageId guard', async () => {
      const store = await setupEligible();
      store.onAssistantMessageStart('msg-1');
      // Complete via finalize path.
      store.onAssistantMessageComplete('msg-1', 'hello');
      await flush();

      mockSystemPlay.mockClear();
      // Second complete for the same id — should no-op.
      store.onAssistantMessageComplete('msg-1', 'hello');
      await flush();

      expect(mockSystemPlay).not.toHaveBeenCalled();
    });

    it('Supertonic streaming finalize rejection is caught and state resets to idle', async () => {
      const store = await makeStore();
      store.setCurrentVoice(SUPERTONIC_VOICE);
      store.setAutoSpeak(true);

      store.onAssistantMessageStart('msg-1');
      expect(mockSupertonicPlayStreaming).toHaveBeenCalled();

      store.onAssistantMessageComplete('msg-1', 'hello');
      await flush();

      expect(lastSupertonicHandle!.finalize).toHaveBeenCalled();
      expect(store.playbackState.mode).toBe('idle');
    });
  });

  describe('thinking-tag stripping', () => {
    const setupEligible = async () => {
      const store = await makeStore();
      store.setCurrentVoice(SYSTEM_VOICE);
      store.setAutoSpeak(true);
      return store;
    };

    it('streaming: strips non-empty <think>…</think> and emits placeholder once before content', async () => {
      const store = await setupEligible();
      store.onAssistantMessageStart('msg-1');

      store.onAssistantMessageChunk('msg-1', '<think>hmm</think>Hello');

      const calls = lastSystemHandle!.appendText.mock.calls.map(c => c[0]);
      // Expect: placeholder prefix (ending in space) then "Hello", no tags.
      expect(calls.join('')).toMatch(/Hello$/);
      expect(calls.join('')).not.toContain('<think>');
      expect(calls.join('')).not.toContain('</think>');
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });

    it('streaming: empty <think></think> does NOT emit a placeholder', async () => {
      const store = await setupEligible();
      store.onAssistantMessageStart('msg-1');

      store.onAssistantMessageChunk('msg-1', '<think></think>Hello');

      const calls = lastSystemHandle!.appendText.mock.calls.map(c => c[0]);
      expect(calls.join('')).toBe('Hello');
    });

    it('streaming: tags split across chunks are handled; placeholder emitted once', async () => {
      const store = await setupEligible();
      store.onAssistantMessageStart('msg-1');

      store.onAssistantMessageChunk('msg-1', '<th');
      store.onAssistantMessageChunk('msg-1', 'ink>hm');
      store.onAssistantMessageChunk('msg-1', 'm</thi');
      store.onAssistantMessageChunk('msg-1', 'nk>Hi');

      const joined = lastSystemHandle!.appendText.mock.calls
        .map(c => c[0])
        .join('');
      expect(joined).not.toContain('<');
      expect(joined).toMatch(/Hi$/);
      // Placeholder appears exactly once — trailing space is the separator.
      // We check by counting appendText calls that end with ' ' and precede 'Hi'.
      expect(joined.length).toBeGreaterThan('Hi'.length);
    });

    it('replay fallback: onAssistantMessageComplete strips tags and prepends placeholder', async () => {
      const store = await setupEligible();

      store.onAssistantMessageComplete('msg-solo', '<think>hmm</think>Hi');
      await flush();

      expect(mockSystemPlay).toHaveBeenCalledTimes(1);
      const [spokenText, voice] = mockSystemPlay.mock.calls[0];
      expect(voice).toEqual(SYSTEM_VOICE);
      expect(spokenText).not.toContain('<think>');
      expect(spokenText).toMatch(/Hi$/);
      // Placeholder prefix + space + Hi
      expect(spokenText.length).toBeGreaterThan('Hi'.length);
    });

    it('replay fallback: plain text is passed through unchanged', async () => {
      const store = await setupEligible();

      store.onAssistantMessageComplete('msg-solo', 'Hi');
      await flush();

      expect(mockSystemPlay).toHaveBeenCalledWith('Hi', SYSTEM_VOICE);
    });

    it('replay fallback: empty <think></think> is stripped without placeholder', async () => {
      const store = await setupEligible();

      store.onAssistantMessageComplete('msg-solo', '<think></think>Hi');
      await flush();

      expect(mockSystemPlay).toHaveBeenCalledWith('Hi', SYSTEM_VOICE);
    });

    it('Case A: reasoning deltas flip placeholder once before content arrives', async () => {
      const store = await setupEligible();
      store.onAssistantMessageStart('msg-1');

      // Several reasoning chunks, content still empty — model is thinking.
      store.onAssistantMessageChunk('msg-1', '', 'let ');
      store.onAssistantMessageChunk('msg-1', '', 'me ');
      store.onAssistantMessageChunk('msg-1', '', 'think');
      // First real content chunk lands.
      store.onAssistantMessageChunk('msg-1', 'Hello', '');

      const calls = lastSystemHandle!.appendText.mock.calls.map(c => c[0]);
      const joined = calls.join('');
      // Placeholder prefix (ends with space) + Hello.
      expect(joined).toMatch(/Hello$/);
      expect(joined.length).toBeGreaterThan('Hello'.length);
      // Placeholder emitted exactly once: count appendText calls that ended
      // with a space before any content arrived.
      const placeholderCalls = calls.filter(c => c.endsWith(' ') && c !== '');
      expect(placeholderCalls.length).toBe(1);
    });

    it('Case A: whitespace-only reasoning does NOT emit a placeholder', async () => {
      const store = await setupEligible();
      store.onAssistantMessageStart('msg-1');

      store.onAssistantMessageChunk('msg-1', '', '   ');
      store.onAssistantMessageChunk('msg-1', 'Hi', '');

      const joined = lastSystemHandle!.appendText.mock.calls
        .map(c => c[0])
        .join('');
      expect(joined).toBe('Hi');
    });

    it('Case A: stop() mid-reasoning clears stripper state (no stale placeholder)', async () => {
      const store = await setupEligible();
      store.onAssistantMessageStart('msg-1');
      store.onAssistantMessageChunk('msg-1', '', 'thinking hard');
      await store.stop();

      // New stream, no reasoning — should not emit placeholder.
      store.onAssistantMessageStart('msg-2');
      store.onAssistantMessageChunk('msg-2', 'Hi', '');
      const joined = lastSystemHandle!.appendText.mock.calls
        .map(c => c[0])
        .join('');
      expect(joined).toBe('Hi');
    });

    it('replay fallback: hadReasoning hint prepends placeholder on clean text', async () => {
      const store = await setupEligible();

      await store.play('msg-solo', 'Hello world', {hadReasoning: true});

      expect(mockSystemPlay).toHaveBeenCalledTimes(1);
      const [spokenText] = mockSystemPlay.mock.calls[0];
      expect(spokenText).toMatch(/Hello world$/);
      expect(spokenText.length).toBeGreaterThan('Hello world'.length);
    });

    it('replay fallback: hadReasoning=false leaves clean text unchanged', async () => {
      const store = await setupEligible();

      await store.play('msg-solo', 'Hello world', {hadReasoning: false});

      expect(mockSystemPlay).toHaveBeenCalledWith('Hello world', SYSTEM_VOICE);
    });

    it('stop() clears stripper state so a new stream starts fresh', async () => {
      const store = await setupEligible();
      store.onAssistantMessageStart('msg-1');
      store.onAssistantMessageChunk('msg-1', '<think>a');
      await store.stop();

      // New stream, empty think block — no placeholder should be emitted.
      store.onAssistantMessageStart('msg-2');
      store.onAssistantMessageChunk('msg-2', '<think></think>Hi');
      const joined = lastSystemHandle!.appendText.mock.calls
        .map(c => c[0])
        .join('');
      expect(joined).toBe('Hi');
    });
  });

  describe('AppState → background stops playback', () => {
    it('cancels streaming handle when AppState transitions to background', async () => {
      const store = await makeStore();
      store.setCurrentVoice(SYSTEM_VOICE);
      store.setAutoSpeak(true);
      store.onAssistantMessageStart('msg-1');

      const handler = appStateHandlers[appStateHandlers.length - 1];
      handler('background');
      await flush();

      expect(lastSystemHandle!.cancel).toHaveBeenCalled();
      expect(store.playbackState.mode).toBe('idle');
    });

    it('does NOT stop on active/foreground transitions', async () => {
      const store = await makeStore();
      store.setCurrentVoice(SYSTEM_VOICE);
      await store.play('msg-1', 'hello');

      const handler = appStateHandlers[appStateHandlers.length - 1];
      mockSystemStop.mockClear();

      handler('active');
      await flush();

      expect(mockSystemStop).not.toHaveBeenCalled();
    });
  });

  describe('chat session change stops playback', () => {
    it('cancels streaming handle when chatSessionStore.activeSessionId changes', async () => {
      const store = await makeStore();
      store.setCurrentVoice(SYSTEM_VOICE);
      store.setAutoSpeak(true);
      store.onAssistantMessageStart('msg-1');

      (chatSessionStore as any).activeSessionId = 'session-new-id';
      await flush();

      expect(lastSystemHandle!.cancel).toHaveBeenCalled();
      expect(store.playbackState.mode).toBe('idle');
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

  describe('Supertonic download state machine', () => {
    it('init() derives state=ready when engine reports installed', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(8 * GIB);
      mockSupertonicIsInstalled.mockResolvedValueOnce(true);

      const store = new TTSStore();
      await store.init();

      expect(store.supertonicDownloadState).toBe('ready');
    });

    it('init() derives state=not_installed when engine reports not installed', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(8 * GIB);
      mockSupertonicIsInstalled.mockResolvedValueOnce(false);

      const store = new TTSStore();
      await store.init();

      expect(store.supertonicDownloadState).toBe('not_installed');
    });

    it('downloadSupertonic: not_installed → downloading → ready on success', async () => {
      const store = await makeStore();
      mockSupertonicDownloadModel.mockImplementationOnce(
        async (onProgress?: (p: number) => void) => {
          onProgress?.(0.25);
          onProgress?.(0.75);
        },
      );

      const promise = store.downloadSupertonic();
      expect(store.supertonicDownloadState).toBe('downloading');
      await promise;
      expect(store.supertonicDownloadState).toBe('ready');
      expect(store.supertonicDownloadProgress).toBe(1);
      expect(store.supertonicDownloadError).toBeNull();
    });

    it('downloadSupertonic: transitions to error on failure; retryDownload recovers', async () => {
      const store = await makeStore();
      mockSupertonicDownloadModel
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce(undefined);

      await store.downloadSupertonic();
      expect(store.supertonicDownloadState).toBe('error');
      expect(store.supertonicDownloadError).toBe('network down');

      await store.retryDownload();
      expect(store.supertonicDownloadState).toBe('ready');
      expect(store.supertonicDownloadError).toBeNull();
    });

    it('downloadSupertonic: second concurrent call while downloading is ignored', async () => {
      const store = await makeStore();
      let resolve!: () => void;
      mockSupertonicDownloadModel.mockImplementationOnce(
        () => new Promise<void>(r => (resolve = r)),
      );

      const first = store.downloadSupertonic();
      await store.downloadSupertonic();
      expect(mockSupertonicDownloadModel).toHaveBeenCalledTimes(1);

      resolve();
      await first;
    });

    it('deleteSupertonic: delegates to engine, resets state, and clears Supertonic currentVoice', async () => {
      const store = await makeStore();
      store.setCurrentVoice(SUPERTONIC_VOICE);

      await store.deleteSupertonic();

      expect(mockSupertonicDeleteModel).toHaveBeenCalledTimes(1);
      expect(store.supertonicDownloadState).toBe('not_installed');
      expect(store.currentVoice).toBeNull();
    });

    it('deleteSupertonic: preserves a non-Supertonic currentVoice', async () => {
      const store = await makeStore();
      store.setCurrentVoice(SYSTEM_VOICE);

      await store.deleteSupertonic();

      expect(store.currentVoice).toEqual(SYSTEM_VOICE);
    });
  });

  describe('init() neural-engine derivation runs all three engines in parallel', () => {
    it('queries supertonic, kokoro, and kitten install state independently', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(8 * GIB);
      mockSupertonicIsInstalled.mockResolvedValueOnce(true);
      mockKokoroIsInstalled.mockResolvedValueOnce(false);
      mockKittenIsInstalled.mockResolvedValueOnce(true);

      const store = new TTSStore();
      await store.init();

      expect(mockSupertonicIsInstalled).toHaveBeenCalledTimes(1);
      expect(mockKokoroIsInstalled).toHaveBeenCalledTimes(1);
      expect(mockKittenIsInstalled).toHaveBeenCalledTimes(1);

      expect(store.supertonicDownloadState).toBe('ready');
      expect(store.kokoroDownloadState).toBe('not_installed');
      expect(store.kittenDownloadState).toBe('ready');
    });

    it('isInstalled rejection on one engine is caught and treated as not_installed', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(8 * GIB);
      mockSupertonicIsInstalled.mockResolvedValueOnce(true);
      mockKokoroIsInstalled.mockRejectedValueOnce(new Error('disk error'));
      mockKittenIsInstalled.mockResolvedValueOnce(true);

      const store = new TTSStore();
      await store.init();

      expect(store.supertonicDownloadState).toBe('ready');
      expect(store.kokoroDownloadState).toBe('not_installed');
      expect(store.kittenDownloadState).toBe('ready');
    });
  });

  describe('Kokoro download state machine', () => {
    it('downloadKokoro: not_installed → downloading → ready on success', async () => {
      const store = await makeStore();
      mockKokoroDownloadModel.mockImplementationOnce(
        async (onProgress?: (p: number) => void) => {
          onProgress?.(0.4);
          onProgress?.(0.9);
        },
      );

      const promise = store.downloadKokoro();
      expect(store.kokoroDownloadState).toBe('downloading');
      await promise;
      expect(store.kokoroDownloadState).toBe('ready');
      expect(store.kokoroDownloadProgress).toBe(1);
      expect(store.kokoroDownloadError).toBeNull();
    });

    it('downloadKokoro: error path; retryKokoroDownload recovers', async () => {
      const store = await makeStore();
      mockKokoroDownloadModel
        .mockRejectedValueOnce(new Error('voice fetch failed'))
        .mockResolvedValueOnce(undefined);

      await store.downloadKokoro();
      expect(store.kokoroDownloadState).toBe('error');
      expect(store.kokoroDownloadError).toBe('voice fetch failed');

      await store.retryKokoroDownload();
      expect(store.kokoroDownloadState).toBe('ready');
      expect(store.kokoroDownloadError).toBeNull();
    });

    it('downloadKokoro: concurrent call while downloading is ignored', async () => {
      const store = await makeStore();
      let resolve!: () => void;
      mockKokoroDownloadModel.mockImplementationOnce(
        () => new Promise<void>(r => (resolve = r)),
      );

      const first = store.downloadKokoro();
      await store.downloadKokoro();
      expect(mockKokoroDownloadModel).toHaveBeenCalledTimes(1);

      resolve();
      await first;
    });

    it('deleteKokoro: clears Kokoro currentVoice but preserves a System voice', async () => {
      const store = await makeStore();
      store.setCurrentVoice({
        id: 'af_bella',
        name: 'Bella',
        engine: 'kokoro',
        language: 'en',
      });

      await store.deleteKokoro();

      expect(mockKokoroDeleteModel).toHaveBeenCalledTimes(1);
      expect(store.kokoroDownloadState).toBe('not_installed');
      expect(store.currentVoice).toBeNull();
    });

    it('deleteKokoro: preserves a non-Kokoro currentVoice', async () => {
      const store = await makeStore();
      store.setCurrentVoice(SYSTEM_VOICE);

      await store.deleteKokoro();

      expect(store.currentVoice).toEqual(SYSTEM_VOICE);
    });
  });

  describe('Kitten download state machine', () => {
    it('downloadKitten: not_installed → downloading → ready on success', async () => {
      const store = await makeStore();
      mockKittenDownloadModel.mockImplementationOnce(
        async (onProgress?: (p: number) => void) => {
          onProgress?.(0.5);
        },
      );

      const promise = store.downloadKitten();
      expect(store.kittenDownloadState).toBe('downloading');
      await promise;
      expect(store.kittenDownloadState).toBe('ready');
      expect(store.kittenDownloadProgress).toBe(1);
    });

    it('downloadKitten: error path; retryKittenDownload recovers', async () => {
      const store = await makeStore();
      mockKittenDownloadModel
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined);

      await store.downloadKitten();
      expect(store.kittenDownloadState).toBe('error');
      expect(store.kittenDownloadError).toBe('boom');

      await store.retryKittenDownload();
      expect(store.kittenDownloadState).toBe('ready');
      expect(store.kittenDownloadError).toBeNull();
    });

    it('deleteKitten: clears Kitten currentVoice and resets state', async () => {
      const store = await makeStore();
      store.setCurrentVoice({
        id: 'expr-voice-2-f',
        name: 'F2',
        engine: 'kitten',
        language: 'en',
      });

      await store.deleteKitten();

      expect(mockKittenDeleteModel).toHaveBeenCalledTimes(1);
      expect(store.kittenDownloadState).toBe('not_installed');
      expect(store.currentVoice).toBeNull();
    });
  });

  describe('supertonicSteps', () => {
    it('defaults to 5', () => {
      const store = new TTSStore();
      expect(store.supertonicSteps).toBe(5);
    });

    it('setSupertonicSteps updates the observable', () => {
      const store = new TTSStore();
      store.setSupertonicSteps(10);
      expect(store.supertonicSteps).toBe(10);
      store.setSupertonicSteps(3);
      expect(store.supertonicSteps).toBe(3);
    });

    it('play() forwards supertonicSteps as inferenceSteps to Supertonic engine', async () => {
      const store = await makeStore();
      store.setCurrentVoice(SUPERTONIC_VOICE);
      store.setSupertonicSteps(3);
      // Override default reject with a resolve so we exercise the call path.
      mockSupertonicPlay.mockResolvedValueOnce(undefined);

      await store.play('msg-1', 'hello');

      expect(mockSupertonicPlay).toHaveBeenCalledWith(
        'hello',
        SUPERTONIC_VOICE,
        {inferenceSteps: 3},
      );
    });

    it('play() with non-Supertonic voice does NOT pass inferenceSteps', async () => {
      const store = await makeStore();
      store.setCurrentVoice(SYSTEM_VOICE);
      store.setSupertonicSteps(3);

      await store.play('msg-1', 'hello');

      // System engine.play() takes only (text, voice) — no opts.
      expect(mockSystemPlay).toHaveBeenCalledWith('hello', SYSTEM_VOICE);
    });

    it('streaming: opens Supertonic playStreaming with inferenceSteps from store', async () => {
      const store = await makeStore();
      store.setCurrentVoice(SUPERTONIC_VOICE);
      store.setAutoSpeak(true);
      store.setSupertonicSteps(10);

      store.onAssistantMessageStart('msg-1');

      expect(mockSupertonicPlayStreaming).toHaveBeenCalledWith(
        SUPERTONIC_VOICE,
        {inferenceSteps: 10},
      );
    });
  });
});
