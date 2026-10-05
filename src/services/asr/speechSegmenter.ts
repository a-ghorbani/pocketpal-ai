import {
  ASR_MAX_SEGMENT_MS,
  ASR_MIN_SEGMENT_MS,
  ASR_SAMPLE_RATE,
  ASR_SEGMENT_LEAD_IN_MS,
  ASR_SEGMENT_PAUSE_MS,
  ASR_VAD_RMS_FLOOR,
} from './constants';
import {int16PcmToFloat32} from './energyVad';

const BYTES_PER_MS = (ASR_SAMPLE_RATE * 2) / 1000;

function chunkIsVoiced(chunk: Uint8Array): boolean {
  const samples = int16PcmToFloat32(chunk);
  if (samples.length === 0) {
    return false;
  }
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i]! * samples[i]!;
  }
  return Math.sqrt(sumSquares / samples.length) >= ASR_VAD_RMS_FLOOR;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) {
    total += c.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Splits a live 16-bit PCM stream into segments at pauses, so each can be
 * transcribed while the user keeps speaking. A segment of at least
 * `ASR_MIN_SEGMENT_MS` ends after `ASR_SEGMENT_PAUSE_MS` of silence that
 * follows speech; any segment ends at `ASR_MAX_SEGMENT_MS`. Silence before any speech is trimmed to a short
 * lead-in, so long pauses are never buffered or decoded.
 */
export class SpeechSegmenter {
  private chunks: Uint8Array[] = [];
  private bytes = 0;
  private heardSpeech = false;
  private silentBytes = 0;

  constructor(private readonly onSegment: (pcm: Uint8Array) => void) {}

  push(chunk: Uint8Array): void {
    this.chunks.push(chunk);
    this.bytes += chunk.length;

    if (chunkIsVoiced(chunk)) {
      this.heardSpeech = true;
      this.silentBytes = 0;
    } else {
      this.silentBytes += chunk.length;
    }

    if (!this.heardSpeech) {
      this.trimLeadIn();
      return;
    }
    const atPause =
      this.silentBytes >= ASR_SEGMENT_PAUSE_MS * BYTES_PER_MS &&
      this.bytes >= ASR_MIN_SEGMENT_MS * BYTES_PER_MS;
    if (atPause || this.bytes >= ASR_MAX_SEGMENT_MS * BYTES_PER_MS) {
      this.onSegment(this.take());
    }
  }

  /** The audio not yet emitted, or null when it holds no speech. */
  flush(): Uint8Array | null {
    const heardSpeech = this.heardSpeech;
    const pcm = this.take();
    return heardSpeech ? pcm : null;
  }

  private take(): Uint8Array {
    const pcm = concat(this.chunks);
    this.chunks = [];
    this.bytes = 0;
    this.heardSpeech = false;
    this.silentBytes = 0;
    return pcm;
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
