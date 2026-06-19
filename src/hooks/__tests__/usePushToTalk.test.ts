import {renderHook, act, waitFor} from '@testing-library/react-native';
import {fromByteArray} from 'base64-js';

import AudioRecord from '@fugood/react-native-audio-pcm-stream';

import {usePushToTalk} from '../usePushToTalk';
import {asrStore} from '../../store';
import {whisperAsrEngine} from '../../services/asr';
import * as micPerm from '../../utils/asrMicPermission';

const mockEnsureMicPermission = jest.spyOn(micPerm, 'ensureMicPermission');
const mockTranscribe = jest.spyOn(whisperAsrEngine, 'transcribe');
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
    mockAudioStop.mockResolvedValue('');
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

  it('releases native capture on unmount (I-CAPTURE-RELEASE)', async () => {
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
