import type {TurboModule} from 'react-native';
import {Platform, TurboModuleRegistry} from 'react-native';

export interface SpeechRecognitionCapability {
  available: boolean;
  sdkSupported: boolean;
  support: 'installed' | 'downloadable' | 'pending' | 'unsupported' | 'unknown';
  locale: string;
}

export interface Spec extends TurboModule {
  addListener(eventName: string): void;
  removeListeners(count: number): void;
  getCapability(locale: string): Promise<SpeechRecognitionCapability>;
  start(requestId: string, locale: string): Promise<void>;
  stop(requestId: string): Promise<void>;
  cancel(requestId: string): Promise<void>;
  requestModelDownload(locale: string): Promise<string>;
  playTurnCue(cue: 'narrationEnded' | 'listeningEnded'): Promise<boolean>;
  cancelTurnCue(): Promise<void>;
}

export default Platform.OS === 'android'
  ? TurboModuleRegistry.get<Spec>('SpeechRecognitionModule')
  : null;
