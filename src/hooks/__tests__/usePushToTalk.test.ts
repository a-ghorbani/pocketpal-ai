import {renderHook, act, waitFor} from '@testing-library/react-native';
import {fromByteArray} from 'base64-js';

import AudioRecord from '@fugood/react-native-audio-pcm-stream';

import {usePushToTalk} from '../usePushToTalk';
import {asrStore} from '../../store';
import {whisperAsrEngine} from '../../services/asr';
import * as micPerm from '../../utils/asrMicPermission';

const mockEnsureMicPermission = jest.spyOn(micPerm, 'ensureMicPermission');
const mockTranscribe = jest.spyOn(whisperAsrEngine, 'transcribe');
const mockRelease = jest.spyOn(whisperAsrEngine, 'release');
const mockAudioInit = AudioRecord.init as jest.Mock;
const mockAudioStart = AudioRecord.start as jest.Mock;
const mockAudioStop = AudioRecord.stop as jest.Mock;
const mockAudioOn = AudioRecord.on as jest.Mock;

// Build a base64-encoded chunk of loud, long-enough 16-bit PCM so the
// energy-VAD gate passes (>= ~0.5 s of speech-level signal).
function loudPcmChunkBase64(): string {
  const samples = 16000; // 1 s @ 16 kHz
  const bytes = new Uint8Array(samples * 2);
  for (let i = 0; i < samples; i++) {
    const v = Math.round(Math.sin((i / 16) * Math.PI) * 0.3 * 0x7fff);
    bytes[i * 2] = v & 0xff; // eslint-disable-line no-bitwise
    bytes[i * 2 + 1] = (v >> 8) & 0xff; // eslint-disable-line no-bitwise
  }
  return fromByteArray(bytes);
}

describe('usePushToTalk', () => {
  let dataCallback: ((chunk: string) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    dataCallback = null;
    asrStore.userASROverride = true;
    asrStore.downloadStates.small = 'ready';
    asrStore.selectedTier = 'small';
    asrStore.captureState = 'idle';
    asrStore.lastError = null;
    mockEnsureMicPermission.mockResolvedValue('granted');
    mockTranscribe.mockResolvedValue('hello world');
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

  it('records, gates, transcribes, and appends (never sends)', async () => {
    const onTranscript = jest.fn();
    const {result} = renderHook(() => usePushToTalk({onTranscript}));

    await act(async () => {
      result.current.onPressIn();
    });
    await waitFor(() =>
      expect(asrStore.setCaptureState).toHaveBeenCalledWith('recording'),
    );

    act(() => {
      dataCallback?.(loudPcmChunkBase64());
    });

    await act(async () => {
      result.current.onPressOut();
    });

    await waitFor(() => expect(mockTranscribe).toHaveBeenCalled());
    expect(onTranscript).toHaveBeenCalledWith('hello world');
    // The whisper context is freed once transcription settles.
    await waitFor(() => expect(mockRelease).toHaveBeenCalled());
  });

  it('routes to error and never records when permission is denied', async () => {
    mockEnsureMicPermission.mockResolvedValue('denied');
    const onTranscript = jest.fn();
    const {result} = renderHook(() => usePushToTalk({onTranscript}));

    await act(async () => {
      result.current.onPressIn();
    });

    await waitFor(() =>
      expect(asrStore.setError).toHaveBeenCalledWith('permission_denied'),
    );
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('rejects a silent/too-short buffer without decoding (I-VAD)', async () => {
    const onTranscript = jest.fn();
    const {result} = renderHook(() => usePushToTalk({onTranscript}));

    await act(async () => {
      result.current.onPressIn();
    });
    // No audio frames pushed → empty buffer → below the VAD floor.
    await act(async () => {
      result.current.onPressOut();
    });

    await waitFor(() =>
      expect(asrStore.setError).toHaveBeenCalledWith('too_short'),
    );
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('does not start capture when the gate is closed', async () => {
    asrStore.userASROverride = false;
    const onTranscript = jest.fn();
    const {result} = renderHook(() => usePushToTalk({onTranscript}));

    await act(async () => {
      result.current.onPressIn();
    });

    expect(mockEnsureMicPermission).not.toHaveBeenCalled();
  });

  it('maps a blocked permission to permission_blocked', async () => {
    mockEnsureMicPermission.mockResolvedValue('blocked');
    const onTranscript = jest.fn();
    const {result} = renderHook(() => usePushToTalk({onTranscript}));

    await act(async () => {
      result.current.onPressIn();
    });

    await waitFor(() =>
      expect(asrStore.setError).toHaveBeenCalledWith('permission_blocked'),
    );
    expect(mockAudioStart).not.toHaveBeenCalled();
  });

  it('ignores a re-entrant press while a capture is starting', async () => {
    const onTranscript = jest.fn();
    const {result} = renderHook(() => usePushToTalk({onTranscript}));

    await act(async () => {
      result.current.onPressIn();
    });
    await waitFor(() =>
      expect(asrStore.setCaptureState).toHaveBeenCalledWith('recording'),
    );
    const startCalls = mockAudioStart.mock.calls.length;
    const onCalls = mockAudioOn.mock.calls.length;

    await act(async () => {
      result.current.onPressIn();
    });

    expect(mockAudioStart.mock.calls.length).toBe(startCalls);
    expect(mockAudioOn.mock.calls.length).toBe(onCalls);
  });

  it('re-arms and records on a press immediately after a capture error', async () => {
    const onTranscript = jest.fn();
    const {result} = renderHook(() => usePushToTalk({onTranscript}));

    // First press yields a too-short capture, leaving captureState 'error'.
    await act(async () => {
      result.current.onPressIn();
    });
    await act(async () => {
      result.current.onPressOut();
    });
    await waitFor(() =>
      expect(asrStore.setError).toHaveBeenCalledWith('too_short'),
    );
    expect(asrStore.captureState).toBe('error');

    // An immediate re-press must NOT silently no-op: it re-arms from 'error'.
    await act(async () => {
      result.current.onPressIn();
    });

    await waitFor(() =>
      expect(asrStore.setCaptureState).toHaveBeenCalledWith('requesting_perm'),
    );
    await waitFor(() =>
      expect(asrStore.setCaptureState).toHaveBeenCalledWith('recording'),
    );
    expect(mockAudioStart).toHaveBeenCalled();
  });

  it('does not start capture when released before permission resolves', async () => {
    let resolvePerm: ((r: 'granted') => void) | null = null;
    mockEnsureMicPermission.mockImplementation(
      () =>
        new Promise<'granted'>(resolve => {
          resolvePerm = resolve;
        }),
    );
    const onTranscript = jest.fn();
    const {result} = renderHook(() => usePushToTalk({onTranscript}));

    await act(async () => {
      result.current.onPressIn();
    });
    // Release while the (mocked) permission prompt is still pending.
    act(() => {
      result.current.onPressOut();
    });
    await act(async () => {
      resolvePerm?.('granted');
    });

    expect(mockAudioStart).not.toHaveBeenCalled();
    expect(asrStore.captureState).toBe('idle');
  });

  it('aborts cleanly when audio init rejects', async () => {
    mockAudioInit.mockRejectedValueOnce(new Error('init failed'));
    const onTranscript = jest.fn();
    const {result} = renderHook(() => usePushToTalk({onTranscript}));

    await act(async () => {
      result.current.onPressIn();
    });

    await waitFor(() =>
      expect(asrStore.setError).toHaveBeenCalledWith('transcribe_failed'),
    );
    expect(mockAudioStart).not.toHaveBeenCalled();
  });

  it('releases native capture on unmount', async () => {
    const onTranscript = jest.fn();
    const {result, unmount} = renderHook(() => usePushToTalk({onTranscript}));

    await act(async () => {
      result.current.onPressIn();
    });
    await waitFor(() =>
      expect(asrStore.setCaptureState).toHaveBeenCalledWith('recording'),
    );
    mockAudioStop.mockClear();

    unmount();
    expect(mockAudioStop).toHaveBeenCalled();
  });
});
