import {
  ASR_MAX_SEGMENT_MS,
  ASR_MIN_SEGMENT_MS,
  ASR_MIN_SPEECH_MS,
  ASR_SAMPLE_RATE,
  ASR_SEGMENT_LEAD_IN_MS,
  ASR_SEGMENT_PAUSE_MS,
} from './constants';
import {SpeechDetector} from './speechDetector';

const BYTES_PER_MS = (ASR_SAMPLE_RATE * 2) / 1000;

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
 * lead-in, so long pauses are never buffered or decoded. A segment with less
 * than `ASR_MIN_SPEECH_MS` of speech is dropped, never handed over.
 *
 * Speech under `ASR_MIN_SPEECH_MS` before a pause restarts the speech count
 * but stays in the segment: short knocks never add up to a segment, and a
 * short first word is decoded with whatever is said after it. Held audio with
 * a frame at `ASR_SPEECH_CEILING_DBFS` or louder keeps its count.
 */
export class SpeechSegmenter {
  private chunks: Uint8Array[] = [];
  private bytes = 0;
  private heardSpeech = false;
  private silentBytes = 0;
  private voicedBytes = 0;
  private heldLoud = false;
  private readonly detector = new SpeechDetector();

  constructor(private readonly onSegment: (pcm: Uint8Array) => void) {}

  push(chunk: Uint8Array): void {
    this.chunks.push(chunk);
    this.bytes += chunk.length;

    const {speechBytes, aboveCeiling} = this.detector.push(chunk);
    this.heldLoud ||= aboveCeiling;
    if (speechBytes > 0) {
      this.heardSpeech = true;
      this.voicedBytes += speechBytes;
      this.silentBytes = 0;
    } else {
      this.silentBytes += chunk.length;
    }

    if (!this.heardSpeech) {
      this.trimLeadIn();
      return;
    }
    const paused = this.silentBytes >= ASR_SEGMENT_PAUSE_MS * BYTES_PER_MS;
    if (paused && !this.heldLoud && !this.hasSpeech()) {
      this.voicedBytes = 0;
    }
    const atPause = paused && this.bytes >= ASR_MIN_SEGMENT_MS * BYTES_PER_MS;
    if (atPause || this.bytes >= ASR_MAX_SEGMENT_MS * BYTES_PER_MS) {
      const pcm = this.flush();
      if (pcm) {
        this.onSegment(pcm);
      }
    }
  }

  /** The audio not yet emitted, or null when it holds too little speech. */
  flush(): Uint8Array | null {
    const hasSpeech = this.hasSpeech();
    const pcm = this.take();
    return hasSpeech ? pcm : null;
  }

  private hasSpeech(): boolean {
    return this.voicedBytes >= ASR_MIN_SPEECH_MS * BYTES_PER_MS;
  }

  private take(): Uint8Array {
    const pcm = concat(this.chunks);
    this.chunks = [];
    this.bytes = 0;
    this.heardSpeech = false;
    this.silentBytes = 0;
    this.voicedBytes = 0;
    this.heldLoud = false;
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
