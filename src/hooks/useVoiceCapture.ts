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
  ASR_PROMPT_CHARS,
  ASR_SAMPLE_RATE,
  SpeechSegmenter,
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

/**
 * Tap-to-start, tap-to-stop capture lifecycle for the composer mic.
 *
 * start  → ensure mic permission → load the whisper model and start 16 kHz
 *          mono PCM capture, publishing each chunk's loudness to
 *          `asrStore.inputLevels` for the waveform. `SpeechSegmenter` cuts the
 *          stream at pauses and each segment is transcribed while the user
 *          keeps speaking, so stop only waits for the last one.
 * stop   → transcribe the remaining audio → join the segment texts →
 *          onTranscript append. Silent segments are never decoded.
 * cancel → discard the capture and any transcription in progress.
 *
 * All engine work runs through one serial queue, so a release never cuts
 * across a load or a transcription. Native capture is released on stop,
 * cancel, error, max-ms, AppState background, and unmount. All work is
 * on-device: the only network in the ASR subsystem is the model download.
 */
export function useVoiceCapture(
  options: UseVoiceCaptureOptions,
): UseVoiceCaptureReturn {
  const {onTranscript} = options;

  const recordingRef = useRef(false);
  // Bumped by start and cancel; work from an older session drops its result
  // instead of writing capture state.
  const sessionRef = useRef(0);
  const segmenterRef = useRef<SpeechSegmenter | null>(null);
  const engineQueueRef = useRef<Promise<void>>(Promise.resolve());
  const textsRef = useRef<string[]>([]);
  const failedRef = useRef(false);
  const listenerRef = useRef<{remove: () => void} | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const enqueueEngine = useCallback((work: () => Promise<void>) => {
    engineQueueRef.current = engineQueueRef.current.then(work).catch(err => {
      console.warn('[useVoiceCapture] engine work failed:', err);
    });
  }, []);

  const releaseEngine = useCallback(() => {
    enqueueEngine(() => whisperAsrEngine.release());
  }, [enqueueEngine]);

  const transcribeSegment = useCallback(
    (pcm: Uint8Array, session: number) => {
      enqueueEngine(async () => {
        if (session !== sessionRef.current || failedRef.current) {
          return;
        }
        // Whisper hallucinates on silence — never decode a silent segment.
        if (!energyVad(int16PcmToFloat32(pcm)).passed) {
          return;
        }
        const prompt = textsRef.current.join(' ').slice(-ASR_PROMPT_CHARS);
        try {
          const text = await whisperAsrEngine.transcribe(fromByteArray(pcm), {
            tier: asrStore.selectedTier,
            prompt: prompt || undefined,
          });
          if (session === sessionRef.current && text.length > 0) {
            textsRef.current.push(text);
          }
        } catch (err) {
          if (session === sessionRef.current) {
            console.warn('[useVoiceCapture] transcribe failed:', err);
            failedRef.current = true;
          }
        }
      });
    },
    [enqueueEngine],
  );

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
    // undefined return can't throw and abort teardown.
    Promise.resolve(AudioRecord.stop()).catch(() => {});
  }, []);

  const finish = useCallback(
    async (session: number) => {
      if (!recordingRef.current || session !== sessionRef.current) {
        return;
      }
      teardownCapture();
      const tail = segmenterRef.current?.flush();
      segmenterRef.current = null;
      if (tail) {
        transcribeSegment(tail, session);
      }

      asrStore.setCaptureState('transcribing');
      await engineQueueRef.current;
      if (session !== sessionRef.current) {
        return;
      }
      // Free the ~400 MB whisper context once idle; the next capture reloads it.
      releaseEngine();
      if (failedRef.current) {
        asrStore.setError('transcribe_failed');
        return;
      }
      asrStore.resetCapture();
      const text = textsRef.current.join(' ');
      if (text.length > 0) {
        onTranscriptRef.current(text);
      }
    },
    [releaseEngine, teardownCapture, transcribeSegment],
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
      const tier = asrStore.selectedTier;
      enqueueEngine(() => whisperAsrEngine.prepare(tier));
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
          releaseEngine();
          asrStore.setError('transcribe_failed');
        }
        return;
      }
      if (session !== sessionRef.current) {
        return;
      }
      textsRef.current = [];
      failedRef.current = false;
      segmenterRef.current = new SpeechSegmenter(pcm =>
        transcribeSegment(pcm, session),
      );
      recordingRef.current = true;
      listenerRef.current = AudioRecord.on('data', (chunk: string) => {
        if (recordingRef.current) {
          const bytes = toByteArray(chunk);
          segmenterRef.current?.push(bytes);
          asrStore.pushInputLevel(inputLevel(int16PcmToFloat32(bytes)));
        }
      });
      AudioRecord.start();
      asrStore.setCaptureState('recording');
      maxTimerRef.current = setTimeout(() => {
        // Reaching the cap ends capture as if the user tapped stop.
        finish(session).catch(() => {});
      }, ASR_MAX_RECORD_MS);
    })();
  }, [enqueueEngine, finish, releaseEngine, transcribeSegment]);

  const stop = useCallback(() => {
    finish(sessionRef.current).catch(() => {});
  }, [finish]);

  const cancel = useCallback(() => {
    sessionRef.current++;
    if (recordingRef.current) {
      teardownCapture();
    }
    segmenterRef.current = null;
    whisperAsrEngine.cancelTranscription().catch(err => {
      console.warn('[useVoiceCapture] cancel transcription failed:', err);
    });
    releaseEngine();
    asrStore.resetCapture();
  }, [releaseEngine, teardownCapture]);

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
