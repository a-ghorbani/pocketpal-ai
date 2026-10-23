import {AppState} from 'react-native';
import {renderHook, act, waitFor} from '@testing-library/react-native';
import {fromByteArray} from 'base64-js';

import AudioRecord from '@fugood/react-native-audio-pcm-stream';

import {useVoiceCapture} from '../useVoiceCapture';
import {asrStore, modelStore} from '../../store';
import {
  ASR_MIN_SEGMENT_MS,
  ASR_NO_AUDIO_MS,
  whisperAsrEngine,
} from '../../services/asr';
import * as micPerm from '../../utils/asrMicPermission';

const mockEnsureMicPermission = jest.spyOn(micPerm, 'ensureMicPermission');
const mockTranscribe = jest.spyOn(whisperAsrEngine, 'transcribe');
const mockCancelTranscription = jest.spyOn(
  whisperAsrEngine,
  'cancelTranscription',
);
const mockRelease = jest.spyOn(whisperAsrEngine, 'release');
const mockAudioInit = AudioRecord.init as jest.Mock;
const mockAudioStart = AudioRecord.start as jest.Mock;
const mockAudioStop = AudioRecord.stop as jest.Mock;
const mockAudioOn = AudioRecord.on as jest.Mock;

// Base64-encoded 16-bit PCM: `ms` of speech-level signal (passes the energy
// gate) or of silence.
function pcmChunkBase64(ms: number, amplitude: number): string {
  const samples = ms * 16; // 16 kHz
  const bytes = new Uint8Array(samples * 2);
  for (let i = 0; i < samples; i++) {
    const v = Math.round(Math.sin((i / 16) * Math.PI) * amplitude * 0x7fff);
    bytes[i * 2] = v & 0xff; // eslint-disable-line no-bitwise
    bytes[i * 2 + 1] = (v >> 8) & 0xff; // eslint-disable-line no-bitwise
  }
  return fromByteArray(bytes);
}

const loudPcmChunkBase64 = () => pcmChunkBase64(1000, 0.3);
const silentPcmChunkBase64 = () => pcmChunkBase64(1000, 0);
const longSpeechPcmBase64 = () => pcmChunkBase64(ASR_MIN_SEGMENT_MS, 0.3);
const said = (text: string, language = 'en') => ({text, language});

describe('useVoiceCapture', () => {
  let dataCallback: ((chunk: string) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    dataCallback = null;
    asrStore.userASROverride = true;
    asrStore.downloadStates.small = 'ready';
    asrStore.selectedTier = 'small';
    asrStore.captureState = 'idle';
    asrStore.lastError = null;
    asrStore.inputLevels = [];
    asrStore.spokenLanguage = 'en';
    asrStore.waitingForChat = false;
    modelStore.deviceTier = 'flagship';
    modelStore.inferencing = false;
    modelStore.context = undefined;
    (asrStore.hasMemoryForCapture as jest.Mock).mockResolvedValue(true);
    mockEnsureMicPermission.mockResolvedValue('granted');
    mockTranscribe.mockResolvedValue(said('hello world'));
    mockCancelTranscription.mockResolvedValue(undefined);
    mockRelease.mockResolvedValue(undefined);
    // Native init() returns void on the JS bridge (the .d.ts is wrong).
    mockAudioInit.mockReturnValue(undefined);
    // Native stop() returns undefined (void), not a Promise — the real contract.
    mockAudioStop.mockReturnValue(undefined);
    mockAudioOn.mockImplementation(
      (_event: string, cb: (c: string) => void) => {
        dataCallback = cb;
        return {remove: jest.fn()};
      },
    );
  });

  async function startRecording(onTranscript = jest.fn()) {
    const hook = renderHook(() => useVoiceCapture({onTranscript}));
    await act(async () => {
      hook.result.current.start();
    });
    await waitFor(() => expect(asrStore.captureState).toBe('recording'));
    return {...hook, onTranscript};
  }

  it('records, transcribes on stop, and appends (never sends)', async () => {
    const {result, onTranscript} = await startRecording();

    const chunk = loudPcmChunkBase64();
    act(() => {
      dataCallback?.(chunk);
    });
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() =>
      expect(onTranscript).toHaveBeenCalledWith('hello world'),
    );
    // whisper.rn's transcribeData decodes signed 16-bit PCM, so the captured
    // bytes go through unchanged.
    expect(mockTranscribe).toHaveBeenCalledWith(chunk, {
      tier: 'small',
      language: 'en',
    });
    expect(asrStore.captureState).toBe('idle');
    // The whisper context is freed once transcription settles.
    await waitFor(() => expect(mockRelease).toHaveBeenCalled());
  });

  it('refuses to record when whisper would not fit in memory', async () => {
    (asrStore.hasMemoryForCapture as jest.Mock).mockResolvedValue(false);
    const {result} = renderHook(() =>
      useVoiceCapture({onTranscript: jest.fn()}),
    );

    await act(async () => {
      result.current.start();
    });

    await waitFor(() =>
      expect(asrStore.setError).toHaveBeenCalledWith('insufficient_memory'),
    );
    expect(mockEnsureMicPermission).not.toHaveBeenCalled();
    expect(mockAudioStart).not.toHaveBeenCalled();
  });

  it('detects the spoken language once and reuses it', async () => {
    asrStore.spokenLanguage = null;
    mockTranscribe.mockResolvedValue(said('hallo', 'de'));
    const first = await startRecording();

    act(() => {
      dataCallback?.(loudPcmChunkBase64());
    });
    await act(async () => {
      first.result.current.stop();
    });
    await waitFor(() => expect(first.onTranscript).toHaveBeenCalled());
    expect(mockTranscribe.mock.calls[0][1]).toEqual({tier: 'small'});
    expect(asrStore.setSpokenLanguage).toHaveBeenCalledWith('de');
    first.unmount();

    const second = await startRecording();
    act(() => {
      dataCallback?.(loudPcmChunkBase64());
    });
    await act(async () => {
      second.result.current.stop();
    });
    await waitFor(() => expect(mockTranscribe).toHaveBeenCalledTimes(2));
    expect(mockTranscribe.mock.calls[1][1]).toEqual({
      tier: 'small',
      language: 'de',
    });
  });

  it('keeps a language reset made while a segment decodes', async () => {
    mockTranscribe.mockImplementation(async () => {
      asrStore.spokenLanguage = null;
      return said('hello world', 'en');
    });
    const {result, onTranscript} = await startRecording();

    act(() => {
      dataCallback?.(loudPcmChunkBase64());
    });
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() => expect(onTranscript).toHaveBeenCalled());
    expect(mockTranscribe.mock.calls[0][1]).toEqual({
      tier: 'small',
      language: 'en',
    });
    expect(asrStore.setSpokenLanguage).not.toHaveBeenCalled();
  });

  it('keeps detecting while transcripts come back empty', async () => {
    asrStore.spokenLanguage = null;
    mockTranscribe.mockResolvedValue(said('', 'ja'));
    const {result} = await startRecording();

    act(() => {
      dataCallback?.(loudPcmChunkBase64());
    });
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() => expect(mockRelease).toHaveBeenCalled());
    expect(asrStore.setSpokenLanguage).not.toHaveBeenCalled();
  });

  it('waits for a chat reply on the CPU before transcribing', async () => {
    modelStore.inferencing = true;
    modelStore.context = {gpu: false} as any;
    const {result, onTranscript} = await startRecording();

    act(() => {
      dataCallback?.(loudPcmChunkBase64());
    });
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() => expect(asrStore.waitingForChat).toBe(true));
    expect(asrStore.captureState).toBe('transcribing');
    expect(mockTranscribe).not.toHaveBeenCalled();

    act(() => {
      modelStore.inferencing = false;
    });

    await waitFor(() =>
      expect(onTranscript).toHaveBeenCalledWith('hello world'),
    );
    expect(asrStore.waitingForChat).toBe(false);
  });

  it('transcribes right away while a chat reply runs on the GPU', async () => {
    modelStore.inferencing = true;
    modelStore.context = {gpu: true} as any;
    const {result, onTranscript} = await startRecording();

    act(() => {
      dataCallback?.(loudPcmChunkBase64());
    });
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() =>
      expect(onTranscript).toHaveBeenCalledWith('hello world'),
    );
    expect(asrStore.setWaitingForChat).not.toHaveBeenCalled();
  });

  it('drops the capture on cancel while waiting for the chat reply', async () => {
    modelStore.inferencing = true;
    modelStore.context = {gpu: false} as any;
    const {result, onTranscript} = await startRecording();

    act(() => {
      dataCallback?.(loudPcmChunkBase64());
    });
    await act(async () => {
      result.current.stop();
    });
    await waitFor(() => expect(asrStore.waitingForChat).toBe(true));

    act(() => {
      result.current.cancel();
    });
    act(() => {
      modelStore.inferencing = false;
    });

    await waitFor(() => expect(mockRelease).toHaveBeenCalled());
    expect(asrStore.captureState).toBe('idle');
    expect(asrStore.waitingForChat).toBe(false);
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('transcribes at a pause while still recording, with earlier text as context', async () => {
    mockTranscribe
      .mockResolvedValueOnce(said('first part'))
      .mockResolvedValueOnce(said('second part'));
    const {result, onTranscript} = await startRecording();

    act(() => {
      dataCallback?.(longSpeechPcmBase64());
      dataCallback?.(silentPcmChunkBase64());
    });
    await waitFor(() => expect(mockTranscribe).toHaveBeenCalledTimes(1));
    expect(asrStore.captureState).toBe('recording');
    expect(mockTranscribe.mock.calls[0][1]).toEqual({
      tier: 'small',
      language: 'en',
      prompt: undefined,
    });

    act(() => {
      dataCallback?.(loudPcmChunkBase64());
    });
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() =>
      expect(onTranscript).toHaveBeenCalledWith('first part second part'),
    );
    expect(mockTranscribe).toHaveBeenCalledTimes(2);
    expect(mockTranscribe.mock.calls[1][1]).toEqual({
      tier: 'small',
      language: 'en',
      prompt: 'first part',
    });
    await waitFor(() => expect(mockRelease).toHaveBeenCalled());
  });

  it('keeps the segments that transcribed when one fails, with a notice', async () => {
    mockTranscribe.mockRejectedValueOnce(new Error('decode failed'));
    const {result, onTranscript} = await startRecording();

    act(() => {
      dataCallback?.(longSpeechPcmBase64());
      dataCallback?.(silentPcmChunkBase64());
    });
    await waitFor(() => expect(mockTranscribe).toHaveBeenCalledTimes(1));
    expect(asrStore.setError).not.toHaveBeenCalled();

    act(() => {
      dataCallback?.(loudPcmChunkBase64());
    });
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() =>
      expect(onTranscript).toHaveBeenCalledWith('hello world'),
    );
    expect(mockTranscribe).toHaveBeenCalledTimes(2);
    expect(asrStore.setError).toHaveBeenCalledWith('transcript_partial');
  });

  it('releases the model on cancel', async () => {
    const {result} = await startRecording();

    act(() => {
      result.current.cancel();
    });

    await waitFor(() => expect(mockRelease).toHaveBeenCalled());
  });

  it('publishes the peak loudness of every two captured chunks', async () => {
    await startRecording();

    act(() => {
      dataCallback?.(loudPcmChunkBase64());
    });
    expect(asrStore.pushInputLevel).not.toHaveBeenCalled();
    act(() => {
      dataCallback?.(silentPcmChunkBase64());
    });

    expect(asrStore.pushInputLevel).toHaveBeenCalledTimes(1);
    const level = (asrStore.pushInputLevel as jest.Mock).mock.calls[0][0];
    expect(level).toBeGreaterThan(0.5);
    expect(level).toBeLessThanOrEqual(1);
  });

  it('returns to idle without an error or decode on a silent capture', async () => {
    const {result, onTranscript} = await startRecording();

    // No audio chunks → nothing voiced.
    await act(async () => {
      result.current.stop();
    });

    expect(asrStore.captureState).toBe('idle');
    expect(asrStore.setError).not.toHaveBeenCalled();
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  describe('when the microphone delivers nothing', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('reports mic_unavailable and releases capture', async () => {
      await startRecording();

      act(() => {
        jest.advanceTimersByTime(ASR_NO_AUDIO_MS);
      });

      expect(asrStore.setError).toHaveBeenCalledWith('mic_unavailable');
      expect(mockAudioStop).toHaveBeenCalled();
    });

    it('stays quiet once silent audio arrives', async () => {
      await startRecording();

      act(() => {
        dataCallback?.(silentPcmChunkBase64());
        jest.advanceTimersByTime(ASR_NO_AUDIO_MS);
      });

      expect(asrStore.setError).not.toHaveBeenCalled();
      expect(asrStore.captureState).toBe('recording');
    });
  });

  it('returns to idle without an error on an empty transcript', async () => {
    mockTranscribe.mockResolvedValue(said(''));
    const {result, onTranscript} = await startRecording();

    act(() => {
      dataCallback?.(loudPcmChunkBase64());
    });
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() => expect(mockRelease).toHaveBeenCalled());
    expect(asrStore.captureState).toBe('idle');
    expect(asrStore.setError).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('discards the capture on cancel while recording', async () => {
    const {result, onTranscript} = await startRecording();

    act(() => {
      dataCallback?.(loudPcmChunkBase64());
    });
    mockAudioStop.mockClear();
    act(() => {
      result.current.cancel();
    });

    expect(mockAudioStop).toHaveBeenCalled();
    expect(asrStore.captureState).toBe('idle');
    // A stop after cancel finds no capture to transcribe.
    await act(async () => {
      result.current.stop();
    });
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('stops whisper and drops the transcript on cancel while transcribing', async () => {
    let resolveTranscribe:
      | ((transcript: ReturnType<typeof said>) => void)
      | null = null;
    mockTranscribe.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveTranscribe = resolve;
        }),
    );
    const {result, onTranscript} = await startRecording();

    act(() => {
      dataCallback?.(loudPcmChunkBase64());
    });
    await act(async () => {
      result.current.stop();
    });
    expect(asrStore.captureState).toBe('transcribing');

    act(() => {
      result.current.cancel();
    });
    expect(mockCancelTranscription).toHaveBeenCalled();
    expect(asrStore.captureState).toBe('idle');

    await act(async () => {
      resolveTranscribe?.(said('too late'));
    });
    expect(onTranscript).not.toHaveBeenCalled();
    expect(asrStore.captureState).toBe('idle');
  });

  it('does not record when cancelled while the permission prompt is open', async () => {
    let resolvePerm: ((r: 'granted') => void) | null = null;
    mockEnsureMicPermission.mockImplementation(
      () =>
        new Promise<'granted'>(resolve => {
          resolvePerm = resolve;
        }),
    );
    const {result} = renderHook(() =>
      useVoiceCapture({onTranscript: jest.fn()}),
    );

    await act(async () => {
      result.current.start();
    });
    act(() => {
      result.current.cancel();
    });
    await act(async () => {
      resolvePerm?.('granted');
    });

    expect(mockAudioStart).not.toHaveBeenCalled();
    expect(asrStore.captureState).toBe('idle');
  });

  it('routes to error and never records when permission is denied', async () => {
    mockEnsureMicPermission.mockResolvedValue('denied');
    const onTranscript = jest.fn();
    const {result} = renderHook(() => useVoiceCapture({onTranscript}));

    await act(async () => {
      result.current.start();
    });

    await waitFor(() =>
      expect(asrStore.setError).toHaveBeenCalledWith('permission_denied'),
    );
    expect(mockAudioStart).not.toHaveBeenCalled();
  });

  it('maps a blocked permission to permission_blocked', async () => {
    mockEnsureMicPermission.mockResolvedValue('blocked');
    const {result} = renderHook(() =>
      useVoiceCapture({onTranscript: jest.fn()}),
    );

    await act(async () => {
      result.current.start();
    });

    await waitFor(() =>
      expect(asrStore.setError).toHaveBeenCalledWith('permission_blocked'),
    );
    expect(mockAudioStart).not.toHaveBeenCalled();
  });

  it('does not start capture when the gate is closed', async () => {
    asrStore.userASROverride = false;
    const {result} = renderHook(() =>
      useVoiceCapture({onTranscript: jest.fn()}),
    );

    await act(async () => {
      result.current.start();
    });

    expect(mockEnsureMicPermission).not.toHaveBeenCalled();
  });

  it('ignores a re-entrant start while recording', async () => {
    const {result} = await startRecording();
    const startCalls = mockAudioStart.mock.calls.length;
    const onCalls = mockAudioOn.mock.calls.length;

    await act(async () => {
      result.current.start();
    });

    expect(mockAudioStart.mock.calls.length).toBe(startCalls);
    expect(mockAudioOn.mock.calls.length).toBe(onCalls);
  });

  it('re-arms and records on a start right after an error', async () => {
    mockEnsureMicPermission.mockResolvedValueOnce('denied');
    const {result} = renderHook(() =>
      useVoiceCapture({onTranscript: jest.fn()}),
    );

    await act(async () => {
      result.current.start();
    });
    await waitFor(() => expect(asrStore.captureState).toBe('error'));

    await act(async () => {
      result.current.start();
    });

    await waitFor(() => expect(asrStore.captureState).toBe('recording'));
    expect(mockAudioStart).toHaveBeenCalled();
  });

  it('aborts cleanly when audio init rejects', async () => {
    mockAudioInit.mockRejectedValueOnce(new Error('init failed'));
    const {result} = renderHook(() =>
      useVoiceCapture({onTranscript: jest.fn()}),
    );

    await act(async () => {
      result.current.start();
    });

    await waitFor(() =>
      expect(asrStore.setError).toHaveBeenCalledWith('transcribe_failed'),
    );
    expect(mockAudioStart).not.toHaveBeenCalled();
  });

  it('surfaces a transcription failure', async () => {
    mockTranscribe.mockRejectedValueOnce(new Error('decode failed'));
    const {result, onTranscript} = await startRecording();

    act(() => {
      dataCallback?.(loudPcmChunkBase64());
    });
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() =>
      expect(asrStore.setError).toHaveBeenCalledWith('transcribe_failed'),
    );
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('finishes the capture when the app goes to the background', async () => {
    let appStateHandler: ((s: string) => void) | null = null;
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementationOnce((_type, handler) => {
        appStateHandler = handler as (s: string) => void;
        return {remove: jest.fn()} as any;
      });
    const {onTranscript} = await startRecording();

    act(() => {
      dataCallback?.(loudPcmChunkBase64());
    });
    mockAudioStop.mockClear();
    act(() => {
      appStateHandler?.('background');
    });

    expect(mockAudioStop).toHaveBeenCalled();
    await waitFor(() =>
      expect(onTranscript).toHaveBeenCalledWith('hello world'),
    );
    expect(asrStore.captureState).toBe('idle');
  });

  it('releases native capture on unmount', async () => {
    const {unmount} = await startRecording();
    mockAudioStop.mockClear();

    unmount();
    expect(mockAudioStop).toHaveBeenCalled();
  });
});
