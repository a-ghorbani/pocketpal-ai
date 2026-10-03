import {act, renderHook} from '@testing-library/react-native';

import {ttsStore} from '../../store';
import {
  cancelConversationCue,
  playConversationCue,
} from '../../services/conversationCues';
import {useSpeechRecognition} from '../useSpeechRecognition';
import {useVoiceConversation} from '../useVoiceConversation';

jest.mock('../useSpeechRecognition', () => ({
  useSpeechRecognition: jest.fn(),
}));
jest.mock('../../services/conversationCues', () => ({
  playConversationCue: jest.fn().mockResolvedValue(undefined),
  cancelConversationCue: jest.fn(),
}));

const mockUseSpeechRecognition = useSpeechRecognition as jest.Mock;
const mockPlayCue = playConversationCue as jest.Mock;
const mockCancelCue = cancelConversationCue as jest.Mock;

describe('useVoiceConversation', () => {
  const recognition = {
    phase: 'idle',
    partialText: '',
    errorCode: null,
    clearError: jest.fn(),
    capability: {
      available: true,
      sdkSupported: true,
      support: 'installed',
      locale: 'en-US',
    },
    locale: 'en-US',
    start: jest.fn().mockResolvedValue(undefined),
    finish: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue(undefined),
    requestModelDownload: jest.fn(),
    refreshCapability: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockPlayCue.mockResolvedValue(undefined);
    recognition.start.mockResolvedValue(undefined);
    recognition.cancel.mockResolvedValue(undefined);
    mockUseSpeechRecognition.mockReturnValue(recognition);
    (ttsStore as any).deviceMeetsMemory = true;
    (ttsStore as any).userTTSOverride = null;
    (ttsStore as any).currentVoice = {
      id: 'voice',
      name: 'Voice',
      engine: 'system',
    };
    (ttsStore as any).conversationAutoSpeakEnabled = false;
    (ttsStore.setConversationAutoSpeak as jest.Mock).mockImplementation(on => {
      (ttsStore as any).conversationAutoSpeakEnabled = on;
    });
  });

  it('auto-sends a final transcript and listens again after completion', async () => {
    const onSendTranscript = jest.fn().mockResolvedValue(true);
    const {result} = renderHook(() =>
      useVoiceConversation({
        contextKey: 'chat-1',
        recognitionEnabled: true,
        onSendTranscript,
        onStopGeneration: jest.fn(),
        onOpenVoiceSetup: jest.fn(),
      }),
    );

    act(() => {
      expect(result.current.start()).toBe(true);
    });
    expect(recognition.start).toHaveBeenCalledTimes(1);

    const options = mockUseSpeechRecognition.mock.calls.at(-1)[0];
    await act(async () => {
      options.onFinalText(' hello ');
      await Promise.resolve();
    });

    expect(mockPlayCue).toHaveBeenCalledWith('listeningEnded');
    expect(mockPlayCue).not.toHaveBeenCalledWith('narrationEnded');
    expect(onSendTranscript).toHaveBeenCalledWith({
      type: 'text',
      text: 'hello',
      metadata: {voiceConversation: true},
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(recognition.start).toHaveBeenCalledTimes(2);
  });

  it('keeps generation running when TTS is explicitly turned off', () => {
    const onStopGeneration = jest.fn();
    const {result, rerender} = renderHook(() =>
      useVoiceConversation({
        contextKey: 'chat-1',
        recognitionEnabled: true,
        onSendTranscript: jest.fn().mockResolvedValue(true),
        onStopGeneration,
        onOpenVoiceSetup: jest.fn(),
      }),
    );

    act(() => {
      result.current.start();
    });
    act(() => {
      (ttsStore as any).conversationAutoSpeakEnabled = false;
      rerender({});
    });

    expect(result.current.active).toBe(false);
    expect(onStopGeneration).not.toHaveBeenCalled();
  });

  it('microphone stop exits conversation and cancels generation', async () => {
    const onStopGeneration = jest.fn();
    const {result} = renderHook(() =>
      useVoiceConversation({
        contextKey: 'chat-1',
        recognitionEnabled: true,
        onSendTranscript: jest.fn(() => new Promise(() => {})),
        onStopGeneration,
        onOpenVoiceSetup: jest.fn(),
      }),
    );

    await act(async () => {
      result.current.start();
      const options = mockUseSpeechRecognition.mock.calls.at(-1)[0];
      options.onFinalText('cancel this turn');
      await Promise.resolve();
      await Promise.resolve();
      result.current.stop();
    });

    expect(recognition.cancel).toHaveBeenCalled();
    expect(ttsStore.stop).toHaveBeenCalled();
    expect(onStopGeneration).toHaveBeenCalledTimes(1);
    expect(mockCancelCue).toHaveBeenCalled();
  });

  it('retries ordinary silence without sending an empty message', () => {
    const onSendTranscript = jest.fn();
    const {result} = renderHook(() =>
      useVoiceConversation({
        contextKey: 'chat-1',
        recognitionEnabled: true,
        onSendTranscript,
        onStopGeneration: jest.fn(),
        onOpenVoiceSetup: jest.fn(),
      }),
    );

    act(() => {
      result.current.start();
    });
    const options = mockUseSpeechRecognition.mock.calls.at(-1)[0];
    act(() => {
      options.onSilence();
      jest.advanceTimersByTime(400);
    });

    expect(recognition.start).toHaveBeenCalledTimes(2);
    expect(onSendTranscript).not.toHaveBeenCalled();
    expect(mockPlayCue).not.toHaveBeenCalled();
  });

  it('keeps conversation active when the first spoken turn creates its session', async () => {
    let finishSend: (value: boolean) => void = () => {};
    const onSendTranscript = jest.fn(
      () =>
        new Promise<boolean>(resolve => {
          finishSend = resolve;
        }),
    );
    const {result, rerender} = renderHook(
      ({contextKey}: {contextKey: string}) =>
        useVoiceConversation({
          contextKey,
          recognitionEnabled: true,
          onSendTranscript,
          onStopGeneration: jest.fn(),
          onOpenVoiceSetup: jest.fn(),
        }),
      {initialProps: {contextKey: '__new_chat__:pal-1:'}},
    );

    act(() => {
      result.current.start();
    });
    const options = mockUseSpeechRecognition.mock.calls.at(-1)[0];
    await act(async () => {
      options.onFinalText('hello');
      await Promise.resolve();
      await Promise.resolve();
    });
    rerender({contextKey: 'session-1:pal-1:'});

    expect(result.current.active).toBe(true);
    await act(async () => {
      finishSend(true);
      await Promise.resolve();
    });
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(recognition.start).toHaveBeenCalledTimes(2);
  });

  it('waits for a captured-speech cue before sending and suppresses a stale send', async () => {
    let finishCue: () => void = () => {};
    mockPlayCue.mockImplementationOnce(
      () => new Promise<void>(resolve => (finishCue = resolve)),
    );
    const onSendTranscript = jest.fn().mockResolvedValue(true);
    const {result} = renderHook(() =>
      useVoiceConversation({
        contextKey: 'chat-1',
        recognitionEnabled: true,
        onSendTranscript,
        onOpenVoiceSetup: jest.fn(),
      }),
    );
    act(() => {
      result.current.start();
      mockUseSpeechRecognition.mock.calls.at(-1)[0].onFinalText('hello');
    });
    expect(onSendTranscript).not.toHaveBeenCalled();
    act(() => result.current.stop());
    await act(async () => finishCue());
    expect(onSendTranscript).not.toHaveBeenCalled();
    expect(mockPlayCue).toHaveBeenCalledTimes(1);
  });

  it('ignores duplicate finals while the listening cue is still playing', async () => {
    let finishCue: () => void = () => {};
    mockPlayCue.mockImplementationOnce(
      () => new Promise<void>(resolve => (finishCue = resolve)),
    );
    const onSendTranscript = jest.fn().mockResolvedValue(true);
    const {result} = renderHook(() =>
      useVoiceConversation({
        contextKey: 'chat-1',
        recognitionEnabled: true,
        onSendTranscript,
        onOpenVoiceSetup: jest.fn(),
      }),
    );
    act(() => {
      result.current.start();
      const options = mockUseSpeechRecognition.mock.calls.at(-1)[0];
      options.onFinalText('hello');
      options.onFinalText('hello again');
    });
    expect(mockPlayCue).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishCue();
      await Promise.resolve();
    });
    expect(onSendTranscript).toHaveBeenCalledTimes(1);
  });

  it('plays the narration cue only after completed playback and before listening again', async () => {
    let finishNarration: () => void = () => {};
    mockPlayCue.mockImplementationOnce(() => Promise.resolve());
    mockPlayCue.mockImplementationOnce(
      () => new Promise<void>(resolve => (finishNarration = resolve)),
    );
    const {result} = renderHook(() =>
      useVoiceConversation({
        contextKey: 'chat-1',
        recognitionEnabled: true,
        onSendTranscript: jest.fn().mockResolvedValue({narration: 'completed'}),
        onOpenVoiceSetup: jest.fn(),
      }),
    );
    act(() => {
      result.current.start();
      mockUseSpeechRecognition.mock.calls.at(-1)[0].onFinalText('hello');
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockPlayCue.mock.calls.map(call => call[0])).toEqual([
      'listeningEnded',
      'narrationEnded',
    ]);
    act(() => jest.advanceTimersByTime(400));
    expect(recognition.start).toHaveBeenCalledTimes(1);
    await act(async () => finishNarration());
    act(() => jest.advanceTimersByTime(400));
    expect(recognition.start).toHaveBeenCalledTimes(2);
  });

  it('stops a pending narration cue without reopening the microphone', async () => {
    let finishNarration: () => void = () => {};
    mockPlayCue.mockImplementationOnce(() => Promise.resolve());
    mockPlayCue.mockImplementationOnce(
      () => new Promise<void>(resolve => (finishNarration = resolve)),
    );
    const {result} = renderHook(() =>
      useVoiceConversation({
        contextKey: 'chat-1',
        recognitionEnabled: true,
        onSendTranscript: jest.fn().mockResolvedValue({narration: 'completed'}),
        onOpenVoiceSetup: jest.fn(),
      }),
    );
    act(() => {
      result.current.start();
      mockUseSpeechRecognition.mock.calls.at(-1)[0].onFinalText('hello');
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => result.current.stop());
    await act(async () => finishNarration());
    act(() => jest.advanceTimersByTime(400));
    expect(mockCancelCue).toHaveBeenCalled();
    expect(recognition.start).toHaveBeenCalledTimes(1);
  });

  it.each(['skipped', 'failed', 'none'])(
    'does not play a narration cue for %s playback',
    async narration => {
      const {result} = renderHook(() =>
        useVoiceConversation({
          contextKey: 'chat-1',
          recognitionEnabled: true,
          onSendTranscript: jest.fn().mockResolvedValue({narration}),
          onOpenVoiceSetup: jest.fn(),
        }),
      );
      act(() => {
        result.current.start();
        mockUseSpeechRecognition.mock.calls.at(-1)[0].onFinalText('hello');
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockPlayCue).toHaveBeenCalledTimes(1);
      expect(mockPlayCue).toHaveBeenCalledWith('listeningEnded');
      act(() => jest.advanceTimersByTime(400));
      expect(recognition.start).toHaveBeenCalledTimes(2);
    },
  );
});
