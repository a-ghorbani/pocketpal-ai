import * as React from 'react';
import {AppState} from 'react-native';

import {
  cancelConversationCue,
  playConversationCue,
} from '../services/conversationCues';
import {ttsStore} from '../store';
import {MessageType} from '../utils/types';
import {useSpeechRecognition} from './useSpeechRecognition';

type ConversationPhase =
  | 'off'
  | 'starting'
  | 'listening'
  | 'finishing'
  | 'responding';

interface UseVoiceConversationOptions {
  contextKey: string;
  recognitionEnabled: boolean;
  onSendTranscript: (message: MessageType.PartialText) => Promise<unknown>;
  onStopGeneration?: () => void;
  onOpenVoiceSetup: () => void;
}

const RETRY_DELAY_MS = 400;

async function playCue(cue: 'listeningEnded' | 'narrationEnded') {
  try {
    await playConversationCue(cue);
  } catch (error) {
    console.warn('[useVoiceConversation] turn cue failed:', error);
  }
}

export function useVoiceConversation({
  contextKey,
  recognitionEnabled,
  onSendTranscript,
  onStopGeneration,
  onOpenVoiceSetup,
}: UseVoiceConversationOptions) {
  const [active, setActive] = React.useState(false);
  const [phase, setPhase] = React.useState<ConversationPhase>('off');
  const activeRef = React.useRef(false);
  const epochRef = React.useRef(0);
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const activeContextRef = React.useRef<string | null>(null);
  const awaitingSessionCreationRef = React.useRef(false);
  const turnPendingRef = React.useRef(false);
  const turnInProgressRef = React.useRef(false);

  const clearRetry = React.useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const deactivate = React.useCallback(
    (cancelGeneration: boolean) => {
      epochRef.current += 1;
      activeRef.current = false;
      activeContextRef.current = null;
      awaitingSessionCreationRef.current = false;
      cancelConversationCue();
      clearRetry();
      setActive(false);
      setPhase('off');
      ttsStore.setConversationAutoSpeak(false);
      if (cancelGeneration && turnPendingRef.current) {
        onStopGeneration?.();
      }
      turnPendingRef.current = false;
      turnInProgressRef.current = false;
    },
    [clearRetry, onStopGeneration],
  );

  const recognitionRef = React.useRef<ReturnType<
    typeof useSpeechRecognition
  > | null>(null);

  const scheduleListening = React.useCallback(
    (epoch: number) => {
      clearRetry();
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        if (
          !activeRef.current ||
          epochRef.current !== epoch ||
          !ttsStore.conversationAutoSpeakEnabled
        ) {
          return;
        }
        setPhase('starting');
        recognitionRef.current?.start().catch(() => {});
      }, RETRY_DELAY_MS);
    },
    [clearRetry],
  );

  const handleFinalText = React.useCallback(
    async (text: string) => {
      const epoch = epochRef.current;
      if (!activeRef.current || !text.trim() || turnInProgressRef.current) {
        return;
      }
      turnInProgressRef.current = true;
      setPhase('responding');
      try {
        await playCue('listeningEnded');
        if (!activeRef.current || epochRef.current !== epoch) {
          return;
        }
        turnPendingRef.current = true;
        awaitingSessionCreationRef.current =
          contextKey.startsWith('__new_chat__:');
        const outcome = await onSendTranscript({
          type: 'text',
          text: text.trim(),
          metadata: {voiceConversation: true},
        });
        if (
          !activeRef.current ||
          epochRef.current !== epoch ||
          !ttsStore.conversationAutoSpeakEnabled
        ) {
          return;
        }
        turnPendingRef.current = false;
        if (outcome === false) {
          deactivate(false);
          return;
        }
        if (
          outcome !== null &&
          typeof outcome === 'object' &&
          'narration' in outcome &&
          outcome.narration === 'completed'
        ) {
          await playCue('narrationEnded');
        }
        if (activeRef.current && epochRef.current === epoch) {
          scheduleListening(epoch);
        }
      } catch (error) {
        if (activeRef.current && epochRef.current === epoch) {
          console.warn('[useVoiceConversation] spoken turn failed:', error);
          deactivate(false);
        }
      } finally {
        if (epochRef.current === epoch) {
          turnPendingRef.current = false;
          turnInProgressRef.current = false;
          awaitingSessionCreationRef.current = false;
        }
      }
    },
    [contextKey, deactivate, onSendTranscript, scheduleListening],
  );

  const handleSilence = React.useCallback(() => {
    if (activeRef.current) {
      scheduleListening(epochRef.current);
    }
  }, [scheduleListening]);

  const recognition = useSpeechRecognition({
    draft: '',
    contextKey,
    enabled: recognitionEnabled,
    playbackActive: ttsStore.playbackState.mode !== 'idle',
    onFinalText: handleFinalText,
    onSilence: handleSilence,
  });
  recognitionRef.current = recognition;

  React.useEffect(() => {
    if (!active) {
      return;
    }
    if (recognition.phase === 'listening') {
      setPhase('listening');
    } else if (recognition.phase === 'finishing') {
      setPhase('finishing');
    }
  }, [active, recognition.phase]);

  React.useEffect(() => {
    if (active && recognition.errorCode) {
      deactivate(false);
    }
  }, [active, deactivate, recognition.errorCode]);

  const conversationAutoSpeakEnabled = ttsStore.conversationAutoSpeakEnabled;
  React.useEffect(() => {
    if (active && !conversationAutoSpeakEnabled) {
      recognition.cancel();
      deactivate(false);
    }
  }, [active, conversationAutoSpeakEnabled, deactivate, recognition]);

  React.useEffect(() => {
    if (active && activeContextRef.current !== contextKey) {
      const previousContext = activeContextRef.current;
      const previousTail = previousContext?.slice(
        previousContext.indexOf(':') + 1,
      );
      const nextTail = contextKey.slice(contextKey.indexOf(':') + 1);
      if (
        awaitingSessionCreationRef.current &&
        previousContext?.startsWith('__new_chat__:') &&
        !contextKey.startsWith('__new_chat__:') &&
        previousTail === nextTail
      ) {
        activeContextRef.current = contextKey;
        awaitingSessionCreationRef.current = false;
        return;
      }
      recognition.cancel();
      deactivate(false);
    }
  }, [active, contextKey, deactivate, recognition]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active' && activeRef.current) {
        recognitionRef.current?.cancel();
        deactivate(false);
      }
    });
    return () => subscription.remove();
  }, [deactivate]);

  React.useEffect(
    () => () => {
      epochRef.current += 1;
      activeRef.current = false;
      cancelConversationCue();
      clearRetry();
      ttsStore.setConversationAutoSpeak(false);
    },
    [clearRetry],
  );

  const start = React.useCallback(() => {
    if (!ttsStore.isTTSAvailable || !ttsStore.currentVoice) {
      onOpenVoiceSetup();
      return false;
    }
    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    activeRef.current = true;
    activeContextRef.current = contextKey;
    awaitingSessionCreationRef.current = false;
    turnPendingRef.current = false;
    turnInProgressRef.current = false;
    ttsStore.setConversationAutoSpeak(true);
    setActive(true);
    setPhase('starting');
    recognition.start().catch(() => {});
    return true;
  }, [contextKey, onOpenVoiceSetup, recognition]);

  const stop = React.useCallback(
    (cancelGeneration = true) => {
      recognition.cancel().catch(() => {});
      ttsStore.stop().catch(() => {});
      deactivate(cancelGeneration);
    },
    [deactivate, recognition],
  );

  return {
    active,
    phase,
    recognition,
    start,
    stop,
  };
}
