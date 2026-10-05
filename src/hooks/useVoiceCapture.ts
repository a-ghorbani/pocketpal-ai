import {useCallback, useEffect, useRef} from 'react';
import {AppState, type AppStateStatus} from 'react-native';

import {fromByteArray, toByteArray} from 'base64-js';
import AudioRecord from '@fugood/react-native-audio-pcm-stream';

import {asrStore} from '../store';
import {
  ASR_BITS_PER_SAMPLE,
  ASR_CHANNELS,
  ASR_CHUNK_BYTES,
  ASR_MAX_RECORD_MS,
  ASR_SAMPLE_RATE,
  energyVad,
  inputLevel,
  int16PcmToFloat32,
  whisperAsrEngine,
} from '../services/asr';
import {ensureMicPermission} from '../utils/asrMicPermission';

interface UseVoiceCaptureOptions {
  /** Called with the final transcript; appended to the composer, never sent. */
  onTranscript: (text: string) => void;
}

interface UseVoiceCaptureReturn {
  start: () => void;
  stop: () => void;
  cancel: () => void;
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

/**
 * Tap-to-start, tap-to-stop capture lifecycle for the composer mic.
 *
 * start  → ensure mic permission → start 16 kHz mono PCM capture, buffer
 *          chunks bounded by ASR_MAX_RECORD_MS, and publish each chunk's
 *          loudness to `asrStore.inputLevels` for the waveform.
 * stop   → stop capture → energy-VAD gate (a silent capture is dropped without
 *          decoding) → on-device whisper transcribe → onTranscript append.
 * cancel → discard the capture or abandon the in-flight transcription.
 *
 * Native capture is released on stop, cancel, error, max-ms, AppState
 * background, and unmount, so the mic is never leaked. All work is on-device:
 * the only network in the ASR subsystem is the model download.
 */
export function useVoiceCapture(
  options: UseVoiceCaptureOptions,
): UseVoiceCaptureReturn {
  const {onTranscript} = options;

  const chunksRef = useRef<Uint8Array[]>([]);
  const recordingRef = useRef(false);
  // Bumped by start and cancel; async work from an older session drops its
  // result instead of writing capture state.
  const sessionRef = useRef(0);
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
    // Native stop() returns the bare native value (effectively void on both
    // platforms; the .d.ts Promise<string> type is wrong). Wrap so a synchronous
    // undefined return can't throw and abort teardown/transcribe.
    Promise.resolve(AudioRecord.stop()).catch(() => {});
  }, []);

  const discardCapture = useCallback(() => {
    chunksRef.current = [];
    teardownCapture();
  }, [teardownCapture]);

  const finishAndTranscribe = useCallback(
    async (session: number) => {
      if (!recordingRef.current) {
        return;
      }
      teardownCapture();

      const pcm = concatChunks(chunksRef.current);
      chunksRef.current = [];

      // Whisper hallucinates on silence — never decode a capture without
      // speech. The flat waveform already told the user nothing was heard.
      if (!energyVad(int16PcmToFloat32(pcm)).passed) {
        asrStore.resetCapture();
        return;
      }

      asrStore.setCaptureState('transcribing');
      try {
        const text = await whisperAsrEngine.transcribe(fromByteArray(pcm), {
          tier: asrStore.selectedTier,
        });
        if (session !== sessionRef.current) {
          return;
        }
        asrStore.resetCapture();
        if (text.length > 0) {
          onTranscriptRef.current(text);
        }
      } catch (err) {
        if (session !== sessionRef.current) {
          return;
        }
        console.warn('[useVoiceCapture] transcribe failed:', err);
        asrStore.setError('transcribe_failed');
      } finally {
        // Free the ~400 MB whisper context once idle; re-init from the local
        // model on the next utterance is cheap. Best-effort — never block append.
        whisperAsrEngine.release().catch(err => {
          console.warn('[useVoiceCapture] context release failed:', err);
        });
      }
    },
    [teardownCapture],
  );

  const start = useCallback(() => {
    if (!asrStore.asrAvailable || !asrStore.isSelectedTierReady) {
      return;
    }
    // Ignore a re-entrant start while a capture is starting, live or being
    // transcribed — a second start would overwrite listenerRef/maxTimerRef and
    // leak them. 'error' is a resting state, so a retry right after one works.
    if (
      recordingRef.current ||
      (asrStore.captureState !== 'idle' && asrStore.captureState !== 'error')
    ) {
      return;
    }
    const session = ++sessionRef.current;
    asrStore.setCaptureState('requesting_perm');
    (async () => {
      let result;
      try {
        result = await ensureMicPermission();
      } catch (err) {
        console.warn('[useVoiceCapture] permission check failed:', err);
        result = 'denied' as const;
      }
      if (session !== sessionRef.current) {
        return;
      }
      if (result === 'blocked') {
        asrStore.setError('permission_blocked');
        return;
      }
      if (result !== 'granted') {
        asrStore.setError('permission_denied');
        return;
      }
      try {
        await AudioRecord.init({
          sampleRate: ASR_SAMPLE_RATE,
          channels: ASR_CHANNELS,
          bitsPerSample: ASR_BITS_PER_SAMPLE,
          bufferSize: ASR_CHUNK_BYTES,
          wavFile: '',
        });
      } catch (err) {
        console.warn('[useVoiceCapture] audio init failed:', err);
        if (session === sessionRef.current) {
          asrStore.setError('transcribe_failed');
        }
        return;
      }
      if (session !== sessionRef.current) {
        return;
      }
      chunksRef.current = [];
      recordingRef.current = true;
      listenerRef.current = AudioRecord.on('data', (chunk: string) => {
        if (recordingRef.current) {
          const bytes = toByteArray(chunk);
          chunksRef.current.push(bytes);
          asrStore.pushInputLevel(inputLevel(int16PcmToFloat32(bytes)));
        }
      });
      AudioRecord.start();
      asrStore.setCaptureState('recording');
      maxTimerRef.current = setTimeout(() => {
        // Reaching the cap ends capture as if the user tapped stop.
        finishAndTranscribe(session).catch(() => {});
      }, ASR_MAX_RECORD_MS);
    })();
  }, [finishAndTranscribe]);

  const stop = useCallback(() => {
    finishAndTranscribe(sessionRef.current).catch(() => {});
  }, [finishAndTranscribe]);

  const cancel = useCallback(() => {
    sessionRef.current++;
    if (recordingRef.current) {
      discardCapture();
    }
    if (asrStore.captureState === 'transcribing') {
      whisperAsrEngine.cancelTranscription().catch(err => {
        console.warn('[useVoiceCapture] cancel transcription failed:', err);
      });
    }
    asrStore.resetCapture();
  }, [discardCapture]);

  // Release capture on background and unmount so the mic is never leaked.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' && recordingRef.current) {
        cancel();
      }
    });
    return () => {
      sub.remove();
      if (recordingRef.current) {
        cancel();
      }
    };
  }, [cancel]);

  return {start, stop, cancel};
}
