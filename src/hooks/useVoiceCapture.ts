import {useCallback, useEffect, useRef} from 'react';
import {AppState, type AppStateStatus} from 'react-native';

import {fromByteArray, toByteArray} from 'base64-js';
import {when} from 'mobx';
import AudioRecord from '@fugood/react-native-audio-pcm-stream';

import {asrStore} from '../store';
import {
  ASR_BITS_PER_SAMPLE,
  ASR_CHANNELS,
  ASR_CHUNK_BYTES,
  ASR_LEVEL_CHUNKS,
  ASR_MAX_RECORD_MS,
  ASR_NO_AUDIO_MS,
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

/** Tap-to-start, tap-to-stop capture for the composer mic (see context/architecture/asr.md). */
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
  const chatWaitRef = useRef<(Promise<void> & {cancel(): void}) | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noAudioTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        if (session !== sessionRef.current) {
          return;
        }
        // Whisper hallucinates on silence — never decode a silent segment.
        if (!energyVad(int16PcmToFloat32(pcm)).passed) {
          return;
        }
        if (asrStore.chatBusyOnCpu) {
          asrStore.setWaitingForChat(true);
          const wait = when(() => !asrStore.chatBusyOnCpu);
          chatWaitRef.current = wait;
          try {
            await wait;
          } catch {
            return;
          } finally {
            chatWaitRef.current = null;
            if (session === sessionRef.current) {
              asrStore.setWaitingForChat(false);
            }
          }
          if (session !== sessionRef.current) {
            return;
          }
        }
        const prompt = textsRef.current.join(' ').slice(-ASR_PROMPT_CHARS);
        const fixedLanguage = asrStore.spokenLanguage;
        try {
          const {text, language} = await whisperAsrEngine.transcribe(
            fromByteArray(pcm),
            {
              tier: asrStore.selectedTier,
              language: fixedLanguage ?? undefined,
              prompt: prompt || undefined,
            },
          );
          if (session === sessionRef.current && text.length > 0) {
            textsRef.current.push(text);
            // Save only a detected language, so a reset during the decode holds.
            if (!fixedLanguage && !asrStore.spokenLanguage && language) {
              asrStore.setSpokenLanguage(language);
            }
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
    if (noAudioTimerRef.current) {
      clearTimeout(noAudioTimerRef.current);
      noAudioTimerRef.current = null;
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
      releaseEngine();
      const text = textsRef.current.join(' ');
      if (failedRef.current && text.length === 0) {
        asrStore.setError('transcribe_failed');
        return;
      }
      asrStore.resetCapture();
      if (text.length > 0) {
        onTranscriptRef.current(text);
      }
      if (failedRef.current) {
        asrStore.setError('transcript_partial');
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
      const fits = await asrStore.hasMemoryForCapture();
      if (session !== sessionRef.current) {
        return;
      }
      if (!fits) {
        asrStore.setError('insufficient_memory');
        return;
      }
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
      textsRef.current = [];
      failedRef.current = false;
      segmenterRef.current = new SpeechSegmenter(pcm =>
        transcribeSegment(pcm, session),
      );
      recordingRef.current = true;
      let chunkCount = 0;
      let peakLevel = 0;
      listenerRef.current = AudioRecord.on('data', (chunk: string) => {
        if (recordingRef.current) {
          const bytes = toByteArray(chunk);
          segmenterRef.current?.push(bytes);
          peakLevel = Math.max(peakLevel, inputLevel(int16PcmToFloat32(bytes)));
          if (++chunkCount % ASR_LEVEL_CHUNKS === 0) {
            asrStore.pushInputLevel(peakLevel);
            peakLevel = 0;
          }
        }
      });
      AudioRecord.start();
      asrStore.setCaptureState('recording');
      maxTimerRef.current = setTimeout(() => {
        // Reaching the cap ends capture as if the user tapped stop.
        finish(session).catch(() => {});
      }, ASR_MAX_RECORD_MS);
      noAudioTimerRef.current = setTimeout(() => {
        noAudioTimerRef.current = null;
        if (chunkCount === 0 && session === sessionRef.current) {
          teardownCapture();
          segmenterRef.current = null;
          asrStore.setError('mic_unavailable');
        }
      }, ASR_NO_AUDIO_MS);
    })();
  }, [finish, teardownCapture, transcribeSegment]);

  const stop = useCallback(() => {
    finish(sessionRef.current).catch(() => {});
  }, [finish]);

  const cancel = useCallback(() => {
    sessionRef.current++;
    if (recordingRef.current) {
      teardownCapture();
    }
    segmenterRef.current = null;
    chatWaitRef.current?.cancel();
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
        stop();
      }
    });
    return () => {
      sub.remove();
      if (recordingRef.current) {
        cancel();
      }
    };
  }, [cancel, stop]);

  return {start, stop, cancel};
}
