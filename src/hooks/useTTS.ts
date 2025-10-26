import {useEffect, useRef, useCallback} from 'react';
import Speech from '@mhpdev/react-native-speech';

export interface TTSOptions {
  enabled: boolean;
  rate?: number;
  pitch?: number;
  language?: string;
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
 * - Automatic cleanup on unmount
 */
export const useTTS = (options: TTSOptions) => {
  const {enabled, rate = 0.5, pitch = 1.0, language} = options;

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

    const initializeTTS = () => {
      try {
        // Initialize Speech with default settings
        const speechOptions: any = {};

        if (rate !== undefined) {
          speechOptions.rate = rate;
        }
        if (pitch !== undefined) {
          speechOptions.pitch = pitch;
        }
        if (language) {
          speechOptions.language = language;
        }

        Speech.initialize(speechOptions);

        stateRef.current.isInitialized = true;

        if (__DEV__) {
          console.log('[TTS] Initialized successfully');
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
  }, [rate, pitch, language]);

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

    // Speak the text
    try {
      await Speech.speak(textToSpeak);
    } catch (error) {
      console.error('[TTS] Failed to speak:', error);
    }
  }, [enabled]);

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

    // Stop TTS
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
