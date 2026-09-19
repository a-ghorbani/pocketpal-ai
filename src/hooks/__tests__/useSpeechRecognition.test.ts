import {act, renderHook, waitFor} from '@testing-library/react-native';
import {DeviceEventEmitter, PermissionsAndroid, Platform} from 'react-native';

import NativeSpeechRecognition from '../../specs/NativeSpeechRecognition';
import {ttsStore} from '../../store';
import {
  speechRecognitionTestUtils,
  useSpeechRecognition,
} from '../useSpeechRecognition';

jest.mock('../../specs/NativeSpeechRecognition', () => ({
  __esModule: true,
  default: {
    getCapability: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    cancel: jest.fn(),
    requestModelDownload: jest.fn(),
  },
}));

const native = NativeSpeechRecognition as jest.Mocked<
  NonNullable<typeof NativeSpeechRecognition>
>;

describe('useSpeechRecognition', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', {value: 'android'});
    native.getCapability.mockResolvedValue({
      available: true,
      sdkSupported: true,
      support: 'installed',
      locale: 'en-US',
    });
    native.start.mockResolvedValue(undefined);
    native.stop.mockResolvedValue(undefined);
    native.cancel.mockResolvedValue(undefined);
    native.requestModelDownload.mockResolvedValue('installed');
    jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    (ttsStore.stopForDictation as jest.Mock).mockClear();
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {value: originalOS});
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('keeps partial text ephemeral and appends one final transcript', async () => {
    const onFinalText = jest.fn();
    const {result} = renderHook(() =>
      useSpeechRecognition({
        draft: 'Existing',
        contextKey: 'chat-1',
        enabled: true,
        playbackActive: false,
        onFinalText,
      }),
    );

    await waitFor(() => expect(native.getCapability).toHaveBeenCalled());
    await act(async () => result.current.start());

    const requestId = native.start.mock.calls[0][0];
    act(() => {
      DeviceEventEmitter.emit('speechRecognitionEvent', {
        requestId,
        type: 'partial',
        text: 'temporary',
      });
    });
    expect(result.current.partialText).toBe('temporary');
    expect(onFinalText).not.toHaveBeenCalled();

    act(() => {
      DeviceEventEmitter.emit('speechRecognitionEvent', {
        requestId,
        type: 'final',
        text: 'transcript',
      });
      DeviceEventEmitter.emit('speechRecognitionEvent', {
        requestId,
        type: 'final',
        text: 'duplicate',
      });
    });

    expect(onFinalText).toHaveBeenCalledTimes(1);
    expect(onFinalText).toHaveBeenCalledWith('Existing transcript');
    expect(result.current.phase).toBe('idle');
    expect(ttsStore.stopForDictation).toHaveBeenCalledTimes(1);
  });

  it('does not start when microphone permission is denied', async () => {
    jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
    const {result} = renderHook(() =>
      useSpeechRecognition({
        draft: '',
        contextKey: 'chat-1',
        enabled: true,
        playbackActive: false,
        onFinalText: jest.fn(),
      }),
    );

    await waitFor(() => expect(native.getCapability).toHaveBeenCalled());
    await act(async () => result.current.start());

    expect(result.current.errorCode).toBe('PERMISSION_DENIED');
    expect(native.start).not.toHaveBeenCalled();
  });

  it('cancels and ignores late results after the chat changes', async () => {
    const onFinalText = jest.fn();
    const {result, rerender} = renderHook<
      ReturnType<typeof useSpeechRecognition>,
      {contextKey: string}
    >(
      ({contextKey}) =>
        useSpeechRecognition({
          draft: '',
          contextKey,
          enabled: true,
          playbackActive: false,
          onFinalText,
        }),
      {initialProps: {contextKey: 'chat-1'}},
    );

    await waitFor(() => expect(native.getCapability).toHaveBeenCalled());
    await act(async () => result.current.start());
    const requestId = native.start.mock.calls[0][0];

    rerender({contextKey: 'chat-2'});
    await waitFor(() => expect(native.cancel).toHaveBeenCalledWith(requestId));
    act(() => {
      DeviceEventEmitter.emit('speechRecognitionEvent', {
        requestId,
        type: 'final',
        text: 'stale',
      });
    });
    expect(onFinalText).not.toHaveBeenCalled();
  });

  it('cancels when PocketPal begins playback', async () => {
    const {result, rerender} = renderHook<
      ReturnType<typeof useSpeechRecognition>,
      {playbackActive: boolean}
    >(
      ({playbackActive}) =>
        useSpeechRecognition({
          draft: '',
          contextKey: 'chat-1',
          enabled: true,
          playbackActive,
          onFinalText: jest.fn(),
        }),
      {initialProps: {playbackActive: false}},
    );

    await waitFor(() => expect(native.getCapability).toHaveBeenCalled());
    await act(async () => result.current.start());
    const requestId = native.start.mock.calls[0][0];
    rerender({playbackActive: true});
    await waitFor(() => expect(native.cancel).toHaveBeenCalledWith(requestId));
  });

  it('preserves deliberate draft whitespace when appending', () => {
    expect(speechRecognitionTestUtils.appendTranscript('', 'hello')).toBe(
      'hello',
    );
    expect(speechRecognitionTestUtils.appendTranscript('line\n', 'hello')).toBe(
      'line\nhello',
    );
  });
});
