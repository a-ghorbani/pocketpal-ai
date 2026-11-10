import {useEffect} from 'react';
import {AccessibilityInfo} from 'react-native';

import type {VoiceError, VoicePhase} from '../../store';
import {voiceVisual} from '../VoiceCloud';

type VoiceModeStrings = {
  startingTitle: string;
  startingHint: string;
  listeningTitle: string;
  listeningHint: string;
  thinkingTitle: string;
  thinkingHint: string;
  speakingTitle: string;
  speakingHint: string;
  mutedTitle: string;
  mutedHint: string;
  errorTranscribe: string;
  errorReply: string;
  errorSpeech: string;
};

/** The status title and subtitle for a cloud state; an error wins. */
export const voiceStatus = (
  phase: VoicePhase,
  micMuted: boolean,
  error: VoiceError | null,
  strings: VoiceModeStrings,
): {title: string; hint: string; isError: boolean} => {
  const key = phase === 'starting' ? 'starting' : voiceVisual(phase, micMuted);
  const title = strings[`${key}Title`];
  if (error === 'transcribe_failed') {
    return {title, hint: strings.errorTranscribe, isError: true};
  }
  if (error === 'reply_failed') {
    return {title, hint: strings.errorReply, isError: true};
  }
  if (error === 'speech_failed') {
    return {title, hint: strings.errorSpeech, isError: true};
  }
  return {title, hint: strings[`${key}Hint`], isError: false};
};

/** Speaks each new status, and any error, to a screen reader. */
export const useAnnounceVoiceStatus = (
  status: {title: string; hint: string; isError: boolean},
  active: boolean,
) => {
  const message = status.isError
    ? `${status.title}. ${status.hint}`
    : status.title;
  useEffect(() => {
    if (active) {
      AccessibilityInfo.announceForAccessibilityWithOptions(message, {
        queue: true,
      });
    }
  }, [active, message]);
};
