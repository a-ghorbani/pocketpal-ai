import {NativeEventEmitter} from 'react-native';

import NativeSpeechPlayback from '../../specs/NativeSpeechPlayback';
import type {SpeechPlaybackCopy} from '../../specs/NativeSpeechPlayback';

/**
 * Asks Android to keep PocketPal in the foreground while it speaks. A refused
 * or failed start is logged and never surfaces: speech goes on without it.
 */
export async function holdSpeechService(
  copy: SpeechPlaybackCopy,
): Promise<void> {
  if (!NativeSpeechPlayback) {
    return;
  }
  try {
    await NativeSpeechPlayback.start(copy);
  } catch (err) {
    console.warn('[tts] speech service start failed:', err);
  }
}

export function releaseSpeechService(): void {
  NativeSpeechPlayback?.stop();
}

/** The notification's Stop, or the task being removed while speaking. */
export function onSpeechServiceStop(listener: () => void): () => void {
  if (!NativeSpeechPlayback) {
    return () => {};
  }
  const subscription = new NativeEventEmitter(NativeSpeechPlayback).addListener(
    'speechPlaybackStop',
    listener,
  );
  return () => subscription.remove();
}
