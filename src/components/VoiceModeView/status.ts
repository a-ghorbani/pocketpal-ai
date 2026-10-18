import type {VoiceError} from '../../store';
import type {VoiceVisual} from '../VoiceCloud';

type VoiceModeStrings = {
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
  visual: VoiceVisual,
  error: VoiceError | null,
  strings: VoiceModeStrings,
): {title: string; hint: string} => {
  const title = strings[`${visual}Title`];
  if (error === 'transcribe_failed') {
    return {title, hint: strings.errorTranscribe};
  }
  if (error === 'reply_failed') {
    return {title, hint: strings.errorReply};
  }
  if (error === 'speech_failed') {
    return {title, hint: strings.errorSpeech};
  }
  return {title, hint: strings[`${visual}Hint`]};
};
