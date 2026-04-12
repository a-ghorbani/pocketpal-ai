/**
 * Minimal ambient module declaration for `@mhpdev/react-native-speech`.
 *
 * The package ships as untranspiled source on GitHub (no prebuilt `lib/`),
 * and `bob build --target typescript` fails against RN 0.82 types. Rather
 * than compile the whole package source, we declare the subset we call.
 * Remove this shim when the published package ships real typings.
 */
declare module '@mhpdev/react-native-speech' {
  export interface VoiceProps {
    name: string;
    quality: number;
    language: string;
    identifier: string;
  }

  export default class Speech {
    static speak(text: string, voiceId?: string): Promise<void>;
    static stop(): Promise<void>;
    static getAvailableVoices(language?: string): Promise<VoiceProps[]>;
  }
}
