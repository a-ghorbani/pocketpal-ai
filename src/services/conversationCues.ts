import NativeSpeechRecognition from '../specs/NativeSpeechRecognition';

export type ConversationCue = 'narrationEnded' | 'listeningEnded';

export async function playConversationCue(cue: ConversationCue): Promise<void> {
  if (!NativeSpeechRecognition) {
    throw new Error('On-device conversation audio is unavailable');
  }
  await NativeSpeechRecognition.playTurnCue(cue);
}

export function cancelConversationCue(): void {
  NativeSpeechRecognition?.cancelTurnCue().catch(error => {
    console.warn('[conversationCues] cancel failed:', error);
  });
}
