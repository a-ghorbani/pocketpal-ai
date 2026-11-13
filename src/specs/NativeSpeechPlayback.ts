import type {TurboModule} from 'react-native';
import {Platform, TurboModuleRegistry} from 'react-native';

export interface SpeechPlaybackCopy {
  title: string;
  stopLabel: string;
  channelName: string;
}

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;

  start(copy: SpeechPlaybackCopy): Promise<void>;
  stop(): void;
}

const NativeSpeechPlayback: Spec | null =
  Platform.OS === 'android'
    ? TurboModuleRegistry.getEnforcing<Spec>('SpeechPlaybackModule')
    : null;

export default NativeSpeechPlayback;
