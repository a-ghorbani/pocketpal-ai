import {useEffect, useRef, useCallback} from 'react';
import Speech from '@mhpdev/react-native-speech';
import {ttsStore} from '../store/TTSStore';

export interface TTSOptions {
  enabled: boolean;
  rate?: number;
  pitch?: number;
  language?: string;
  voice?: string;
  engineType?: 'platform' | 'neural';
  speed?: number;
  volume?: number;
}

interface TTSState {
  isSpeaking: boolean;
  isPaused: boolean;
  isInitialized: boolean;
}

/**
 * Hook to manage Text-to-Speech functionality for LLM-generated text
 *
 * This hook provides:
 * - Initialization and cleanup of TTS engine
 * - Speaking text in chunks as they arrive from the LLM
 * - Pause/resume/stop controls
 * - Support for both platform and neural TTS engines (Kokoro, Piper, etc.)
 * - Automatic cleanup on unmount
 */
export const useTTS = (options: TTSOptions) => {
  // Get settings from store or use provided options
  const activeConfig = ttsStore.activeVoiceConfig;

  const {
    enabled,
    rate = activeConfig.engineType === 'platform' ? activeConfig.rate : 1.0,
    pitch = activeConfig.engineType === 'platform' ? activeConfig.pitch : 1.0,
    language = activeConfig.engineType === 'platform'
      ? activeConfig.language
      : undefined,
    voice = activeConfig.engineType === 'platform'
      ? activeConfig.voice
      : undefined,
    engineType = activeConfig.engineType,
    speed = activeConfig.engineType === 'neural' ? activeConfig.speed : 1.0,
    volume = activeConfig.volume,
  } = options;

  // Get neural voice ID if using neural engine
  const neuralVoiceId =
    engineType === 'neural' && activeConfig.engineType === 'neural'
      ? activeConfig.voiceId
      : undefined;

  const stateRef = useRef<TTSState>({
    isSpeaking: false,
    isPaused: false,
    isInitialized: false,
  });

  // Buffer to accumulate text before speaking
  const textBufferRef = useRef<string>('');
  const speakTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Initialize TTS engine
  useEffect(() => {
    isMountedRef.current = true;

    const initializeTTS = async () => {
      try {
        // Engine should already be initialized via TTSStore
        // Just verify it's ready
        const isReady = await Speech.isReady();
        if (!isReady) {
          console.warn('[TTS] Speech engine not ready');
          stateRef.current.isInitialized = false;
          return;
        }

        stateRef.current.isInitialized = true;

        if (__DEV__) {
          console.log('[TTS] Initialized successfully', {
            engineType,
            voice: engineType === 'platform' ? voice : neuralVoiceId,
            rate,
            pitch,
            speed,
          });
        }
      } catch (error) {
        console.error('[TTS] Initialization failed:', error);
        stateRef.current.isInitialized = false;
      }
    };

    initializeTTS();

    // Set up event callbacks
    const startSubscription = Speech.onStart(() => {
      if (isMountedRef.current) {
        stateRef.current.isSpeaking = true;
        stateRef.current.isPaused = false;
      }
    });

    const finishSubscription = Speech.onFinish(() => {
      if (isMountedRef.current) {
        stateRef.current.isSpeaking = false;
        stateRef.current.isPaused = false;
      }
    });

    const stoppedSubscription = Speech.onStopped(() => {
      if (isMountedRef.current) {
        stateRef.current.isSpeaking = false;
        stateRef.current.isPaused = false;
      }
    });

    const pauseSubscription = Speech.onPause(() => {
      if (isMountedRef.current) {
        stateRef.current.isPaused = true;
      }
    });

    const resumeSubscription = Speech.onResume(() => {
      if (isMountedRef.current) {
        stateRef.current.isPaused = false;
      }
    });

    const errorSubscription = Speech.onError((error: any) => {
      console.error('[TTS] Error:', error);
      if (isMountedRef.current) {
        stateRef.current.isSpeaking = false;
        stateRef.current.isPaused = false;
      }
    });

    // Cleanup
    return () => {
      isMountedRef.current = false;

      // Remove event subscriptions
      startSubscription.remove();
      finishSubscription.remove();
      stoppedSubscription.remove();
      pauseSubscription.remove();
      resumeSubscription.remove();
      errorSubscription.remove();

      // Clear any pending speak timer
      if (speakTimerRef.current) {
        clearTimeout(speakTimerRef.current);
        speakTimerRef.current = null;
      }

      // Stop any ongoing speech
      Speech.stop();

      // Clear buffer
      textBufferRef.current = '';
    };
  }, [rate, pitch, language, voice, engineType, speed, volume, neuralVoiceId]);

  /**
   * Speak accumulated text from buffer
   */
  const speakBuffer = useCallback(async () => {
    if (!enabled || !stateRef.current.isInitialized) {
      return;
    }

    const textToSpeak = textBufferRef.current.trim();
    if (textToSpeak.length === 0) {
      return;
    }

    // Clear the buffer
    textBufferRef.current = '';

    // Speak the text using unified Speech API
    try {
      if (engineType === 'platform') {
        // Use platform TTS (Speech is already initialized with OS_NATIVE)
        await Speech.speak(textToSpeak);
      } else if (engineType === 'neural') {
        // Use neural TTS (Speech is already initialized with KOKORO/SUPERTONIC)
        if (!neuralVoiceId) {
          console.error('[TTS] Neural voice not configured');
          return;
        }

        await Speech.speak(textToSpeak, neuralVoiceId, {
          speed,
          volume,
        });
      }
    } catch (error) {
      console.error('[TTS] Failed to speak:', error);
    }
  }, [enabled, engineType, neuralVoiceId, speed, volume]);

  /**
   * Add text to the buffer and schedule speaking
   * This is called for each token/chunk from the LLM
   */
  const addText = useCallback(
    (text: string) => {
      if (!enabled || !stateRef.current.isInitialized) {
        return;
      }

      // Add text to buffer
      textBufferRef.current += text;

      // Clear existing timer
      if (speakTimerRef.current) {
        clearTimeout(speakTimerRef.current);
      }

      // Schedule speaking after a short delay to accumulate more text
      // This prevents speaking every single token and creates more natural speech
      speakTimerRef.current = setTimeout(() => {
        speakBuffer();
      }, 500); // Wait 500ms for more text to accumulate
    },
    [enabled, speakBuffer],
  );

  /**
   * Flush any remaining text in the buffer immediately
   * Called when the LLM finishes generating
   */
  const flush = useCallback(() => {
    if (speakTimerRef.current) {
      clearTimeout(speakTimerRef.current);
      speakTimerRef.current = null;
    }
    speakBuffer();
  }, [speakBuffer]);

  /**
   * Stop speaking and clear the queue
   */
  const stop = useCallback(async () => {
    // Clear buffer
    textBufferRef.current = '';

    // Clear timer
    if (speakTimerRef.current) {
      clearTimeout(speakTimerRef.current);
      speakTimerRef.current = null;
    }

    // Stop TTS using unified Speech API
    try {
      await Speech.stop();
      stateRef.current.isSpeaking = false;
      stateRef.current.isPaused = false;
    } catch (error) {
      console.error('[TTS] Failed to stop:', error);
    }
  }, []);

  /**
   * Pause speaking
   */
  const pause = useCallback(async () => {
    try {
      await Speech.pause();
      stateRef.current.isPaused = true;
    } catch (error) {
      console.error('[TTS] Failed to pause:', error);
    }
  }, []);

  /**
   * Resume speaking
   */
  const resume = useCallback(async () => {
    try {
      await Speech.resume();
      stateRef.current.isPaused = false;
    } catch (error) {
      console.error('[TTS] Failed to resume:', error);
    }
  }, []);

  return {
    addText,
    flush,
    stop,
    pause,
    resume,
    isSpeaking: stateRef.current.isSpeaking,
    isPaused: stateRef.current.isPaused,
    isInitialized: stateRef.current.isInitialized,
  };
};
