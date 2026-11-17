import {
  ASR_CHUNK_BYTES,
  ASR_DIGITAL_SILENCE_DBFS,
  ASR_NOISE_RANK,
  ASR_NOISE_WINDOW_MS,
  ASR_SAMPLE_RATE,
  ASR_SPEECH_CEILING_DBFS,
  ASR_SPEECH_FLOOR_DBFS,
  ASR_SPEECH_MARGIN_DB,
} from './constants';
import {int16PcmToFloat32} from './pcm';

const FRAME_MS = (ASR_CHUNK_BYTES / (ASR_SAMPLE_RATE * 2)) * 1000;
const WINDOW_FRAMES = Math.round(ASR_NOISE_WINDOW_MS / FRAME_MS);

export interface SpeechInChunk {
  /** Bytes of the chunk that are speech. */
  speechBytes: number;
  /** True when any frame of the chunk reaches `ASR_SPEECH_CEILING_DBFS`. */
  aboveCeiling: boolean;
}

function frameDb(frame: Uint8Array): number {
  const samples = int16PcmToFloat32(frame);
  if (samples.length === 0) {
    return -Infinity;
  }
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i]! * samples[i]!;
  }
  return 10 * Math.log10(sumSquares / samples.length);
}

/**
 * Judges a live 16-bit PCM stream, 50 ms frame by 50 ms frame, against the
 * room it was recorded in. A frame is speech when it stands
 * `ASR_SPEECH_MARGIN_DB` above the room level (the `ASR_NOISE_RANK`-quietest
 * frame of the last `ASR_NOISE_WINDOW_MS`), with that threshold held between
 * `ASR_SPEECH_FLOOR_DBFS` and `ASR_SPEECH_CEILING_DBFS`. Keep one detector per
 * stream: the room level is built from the frames it has seen.
 */
export class SpeechDetector {
  private levels: number[] = [];

  push(chunk: Uint8Array): SpeechInChunk {
    let speechBytes = 0;
    let aboveCeiling = false;
    for (let offset = 0; offset < chunk.length; offset += ASR_CHUNK_BYTES) {
      const frame = chunk.subarray(offset, offset + ASR_CHUNK_BYTES);
      const db = frameDb(frame);
      if (db < ASR_DIGITAL_SILENCE_DBFS) {
        continue;
      }
      if (frame.length === ASR_CHUNK_BYTES) {
        this.levels.push(db);
        if (this.levels.length > WINDOW_FRAMES) {
          this.levels.shift();
        }
      }
      if (db >= this.threshold()) {
        speechBytes += frame.length;
      }
      if (db >= ASR_SPEECH_CEILING_DBFS) {
        aboveCeiling = true;
      }
    }
    return {speechBytes, aboveCeiling};
  }

  private threshold(): number {
    if (this.levels.length === 0) {
      return ASR_SPEECH_CEILING_DBFS;
    }
    const sorted = [...this.levels].sort((a, b) => a - b);
    const room = sorted[Math.min(ASR_NOISE_RANK, sorted.length) - 1]!;
    return Math.min(
      ASR_SPEECH_CEILING_DBFS,
      Math.max(ASR_SPEECH_FLOOR_DBFS, room + ASR_SPEECH_MARGIN_DB),
    );
  }
}
