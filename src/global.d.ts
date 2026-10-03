declare module 'react-native/Libraries/Blob/Blob' {
  class Blob {
    constructor(parts: Array<Blob | string>);

    get size(): number;
  }

  export default Blob;
}

declare module '*.png' {
  const value: any;
  export default value;
}

declare module '*.svg' {
  import React from 'react';
  import {SvgProps} from 'react-native-svg';
  const content: React.FC<SvgProps>;
  export default content;
}

// whisper.rn's package `exports` map has no `"."` root entry, so the bare
// `whisper.rn` import doesn't resolve its bundled typings under the project's
// module resolution. Declare the surface the ASR engine uses.
declare module 'whisper.rn' {
  export interface TranscribeResult {
    result: string;
    language: string;
    isAborted: boolean;
  }
  export interface TranscribeOptions {
    language?: string;
  }
  export class WhisperContext {
    transcribe(
      filePathOrBase64: string | number,
      options?: TranscribeOptions,
    ): {stop: () => Promise<void>; promise: Promise<TranscribeResult>};
    transcribeData(
      data: string | ArrayBuffer,
      options?: TranscribeOptions,
    ): {stop: () => Promise<void>; promise: Promise<TranscribeResult>};
    release(): Promise<void>;
  }
  export interface ContextOptions {
    filePath: string | number;
    coreMLModelAsset?: {filename: string; assets: string[] | number[]};
    isBundleAsset?: boolean;
    useCoreMLIos?: boolean;
    useGpu?: boolean;
    useFlashAttn?: boolean;
  }
  export function initWhisper(options: ContextOptions): Promise<WhisperContext>;
  export function releaseAllWhisper(): Promise<void>;
}

// @fugood/react-native-audio-pcm-stream ships its typings under the legacy
// module name `react-native-live-audio-stream`; declare its real package name
// so imports are typed. Emits base64-encoded 16-bit PCM `data` events.
declare module '@fugood/react-native-audio-pcm-stream' {
  export interface PcmStreamOptions {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource?: number;
    bufferSize?: number;
    wavFile?: string;
  }
  export interface PcmAudioRecord {
    init: (options: PcmStreamOptions) => void;
    start: () => void;
    stop: () => Promise<string>;
    on: (
      event: 'data',
      callback: (data: string) => void,
    ) => {remove: () => void};
  }
  const AudioRecord: PcmAudioRecord;
  export default AudioRecord;
}
