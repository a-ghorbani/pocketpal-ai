import type {VoicePhase} from '../../store';

/** What the cloud shows: transcribing and thinking share one look. */
export type VoiceVisual = 'listening' | 'muted' | 'thinking' | 'speaking';

export const voiceVisual = (
  phase: VoicePhase,
  micMuted: boolean,
): VoiceVisual => {
  if (phase === 'speaking') {
    return 'speaking';
  }
  if (
    phase === 'starting' ||
    phase === 'transcribing' ||
    phase === 'thinking'
  ) {
    return 'thinking';
  }
  return micMuted ? 'muted' : 'listening';
};
