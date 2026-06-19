import {useCallback, useEffect, useRef} from 'react';
import {AppState, type AppStateStatus} from 'react-native';

import {fromByteArray, toByteArray} from 'base64-js';
import AudioRecord from '@fugood/react-native-audio-pcm-stream';

import {asrStore} from '../store';
import {
  ASR_BITS_PER_SAMPLE,
  ASR_CHANNELS,
  ASR_MAX_RECORD_MS,
  ASR_SAMPLE_RATE,
  energyVad,
  int16PcmToFloat32,
  whisperAsrEngine,
} from '../services/asr';
import {ensureMicPermission} from '../utils/asrMicPermission';

interface UsePushToTalkOptions {
  /** Called with the final transcript; appended to the composer, never sent. */
  onTranscript: (text: string) => void;
}

interface UsePushToTalkReturn {
  onPressIn: () => void;
  onPressOut: () => void;
}

/** Concatenate accumulated 16-bit PCM byte chunks into one Uint8Array. */
function concatChunks(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) {
    total += c.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Base64-encode a Float32Array's raw little-endian bytes for whisper. */
function float32ToBase64(samples: Float32Array): string {
  const bytes = new Uint8Array(
    samples.buffer,
    samples.byteOffset,
    samples.byteLength,
  );
  return fromByteArray(bytes);
}

/**
 * Push-to-talk capture lifecycle for the composer mic button.
 *
 * onPressIn  → ensure mic permission → start 16 kHz mono PCM capture, buffer
 *              frames bounded by ASR_MAX_RECORD_MS.
 * onPressOut → stop capture → energy-VAD gate (sub-floor buffers are NOT
 *              decoded) → on-device whisper transcribe → onTranscript append.
 *
 * Native capture is released on press-out, error, max-ms, AppState background,
 * and unmount, so the mic is never leaked. All work is on-device: the only
 * network in the ASR subsystem is the model download (ASRStore.downloadModel).
 */
export function usePushToTalk(
  options: UsePushToTalkOptions,
): UsePushToTalkReturn {
  const {onTranscript} = options;

  const chunksRef = useRef<Uint8Array[]>([]);
  const recordingRef = useRef(false);
  const listenerRef = useRef<{remove: () => void} | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const teardownCapture = useCallback(() => {
    recordingRef.current = false;
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    listenerRef.current?.remove();
    listenerRef.current = null;
    AudioRecord.stop().catch(() => {});
  }, []);

  const discardCapture = useCallback(() => {
    chunksRef.current = [];
    teardownCapture();
  }, [teardownCapture]);

  const finishAndTranscribe = useCallback(async () => {
    if (!recordingRef.current) {
      return;
    }
    teardownCapture();

    const pcm = concatChunks(chunksRef.current);
    chunksRef.current = [];

    const samples = int16PcmToFloat32(pcm);
    const vad = energyVad(samples);
    if (!vad.passed) {
      // Whisper hallucinates on silence — never decode a sub-floor buffer.
      asrStore.setError('too_short');
      return;
    }

    asrStore.setCaptureState('transcribing');
    try {
      const text = await whisperAsrEngine.transcribe(float32ToBase64(samples), {
        tier: asrStore.selectedTier,
      });
      asrStore.setCaptureState('idle');
      if (text.length > 0) {
        onTranscriptRef.current(text);
      }
    } catch (err) {
      console.warn('[usePushToTalk] transcribe failed:', err);
      asrStore.setError('transcribe_failed');
    }
  }, [teardownCapture]);

  const onPressIn = useCallback(() => {
    if (!asrStore.asrAvailable || !asrStore.isSelectedTierReady) {
      return;
    }
    asrStore.setCaptureState('requesting_perm');
    ensureMicPermission()
      .then(result => {
        if (result !== 'granted') {
          asrStore.setError('permission_denied');
          return;
        }
        chunksRef.current = [];
        recordingRef.current = true;
        AudioRecord.init({
          sampleRate: ASR_SAMPLE_RATE,
          channels: ASR_CHANNELS,
          bitsPerSample: ASR_BITS_PER_SAMPLE,
          bufferSize: 4096,
          wavFile: '',
        });
        listenerRef.current = AudioRecord.on('data', (chunk: string) => {
          if (recordingRef.current) {
            chunksRef.current.push(toByteArray(chunk));
          }
        });
        AudioRecord.start();
        asrStore.setCaptureState('recording');
        maxTimerRef.current = setTimeout(() => {
          // Reaching the cap ends capture as if the user released.
          finishAndTranscribe().catch(() => {});
        }, ASR_MAX_RECORD_MS);
      })
      .catch(err => {
        console.warn('[usePushToTalk] permission check failed:', err);
        asrStore.setError('permission_denied');
      });
  }, [finishAndTranscribe]);

  const onPressOut = useCallback(() => {
    if (!recordingRef.current) {
      return;
    }
    finishAndTranscribe().catch(() => {});
  }, [finishAndTranscribe]);

  // Release capture on background and unmount (I-CAPTURE-RELEASE).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' && recordingRef.current) {
        discardCapture();
        asrStore.resetCapture();
      }
    });
    return () => {
      sub.remove();
      if (recordingRef.current) {
        discardCapture();
      }
    };
  }, [discardCapture]);

  return {onPressIn, onPressOut};
}
