import {
  ASR_MAX_SEGMENT_MS,
  ASR_MIN_SPEECH_MS,
  ASR_SAMPLE_RATE,
  ASR_SEGMENT_LEAD_IN_MS,
  ASR_VAD_RMS_FLOOR,
} from '../asr/constants';
import {int16PcmToFloat32} from '../asr/energyVad';

import {vtrace} from '../../utils/voiceTrace';

import {VOICE_ENDPOINT_HANG_MS} from './constants';

const BYTES_PER_MS = (ASR_SAMPLE_RATE * 2) / 1000;

const isVoiced = (chunk: Uint8Array): boolean => {
  const samples = int16PcmToFloat32(chunk);
  if (samples.length === 0) {
    return false;
  }
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i]! * samples[i]!;
  }
  return Math.sqrt(sumSquares / samples.length) >= ASR_VAD_RMS_FLOOR;
};

/**
 * Finds the end of one spoken utterance in a live 16-bit PCM stream: a
 * pause of `VOICE_ENDPOINT_HANG_MS` after at least `ASR_MIN_SPEECH_MS` of
 * voiced audio, or `ASR_MAX_SEGMENT_MS` of audio. Silence before speech is
 * trimmed to a short lead-in; voiced blips too short to be speech are
 * dropped once the silence after them reaches the hang.
 */
export class Endpointer {
  private chunks: Uint8Array[] = [];
  private bytes = 0;
  private voicedBytes = 0;
  private silentBytes = 0;

  /** True once enough voiced audio was heard to count as speech. */
  get hasSpeech(): boolean {
    return this.voicedBytes >= ASR_MIN_SPEECH_MS * BYTES_PER_MS;
  }

  get voicedMs(): number {
    return Math.round(this.voicedBytes / BYTES_PER_MS);
  }

  push(chunk: Uint8Array): 'none' | 'endpoint' {
    this.chunks.push(chunk);
    this.bytes += chunk.length;
    if (isVoiced(chunk)) {
      if (this.voicedBytes === 0) {
        vtrace('vad.start');
      }
      this.voicedBytes += chunk.length;
      this.silentBytes = 0;
    } else {
      this.silentBytes += chunk.length;
    }

    if (this.voicedBytes === 0) {
      this.trimLeadIn();
      return 'none';
    }
    const paused = this.silentBytes >= VOICE_ENDPOINT_HANG_MS * BYTES_PER_MS;
    if (paused && !this.hasSpeech) {
      vtrace('vad.drop', {voicedMs: this.voicedMs});
      this.voicedBytes = 0;
      this.trimLeadIn();
      return 'none';
    }
    if (paused || this.bytes >= ASR_MAX_SEGMENT_MS * BYTES_PER_MS) {
      vtrace('vad.end', {
        by: paused ? 'pause' : 'max',
        ms: Math.round(this.bytes / BYTES_PER_MS),
      });
      return 'endpoint';
    }
    return 'none';
  }

  /** A manual endpoint: true when there is speech to transcribe. */
  tap(): boolean {
    return this.hasSpeech;
  }

  /** The buffered utterance; the endpointer starts over. */
  take(): Uint8Array {
    const pcm = new Uint8Array(this.bytes);
    let offset = 0;
    for (const chunk of this.chunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    this.reset();
    return pcm;
  }

  reset(): void {
    this.chunks = [];
    this.bytes = 0;
    this.voicedBytes = 0;
    this.silentBytes = 0;
  }

  private trimLeadIn(): void {
    const keep = ASR_SEGMENT_LEAD_IN_MS * BYTES_PER_MS;
    while (
      this.chunks.length > 1 &&
      this.bytes - this.chunks[0]!.length >= keep
    ) {
      this.bytes -= this.chunks.shift()!.length;
    }
  }
}
