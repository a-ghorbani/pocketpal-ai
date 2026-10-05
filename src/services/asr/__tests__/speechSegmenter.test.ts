import {
  ASR_MAX_SEGMENT_MS,
  ASR_SEGMENT_LEAD_IN_MS,
  ASR_SEGMENT_PAUSE_MS,
} from '../constants';
import {SpeechSegmenter} from '../speechSegmenter';

const CHUNK_MS = 50;
const BYTES_PER_MS = 32; // 16 kHz mono 16-bit

function chunk(amplitude: number): Uint8Array {
  const samples = (CHUNK_MS * BYTES_PER_MS) / 2;
  const bytes = new Uint8Array(samples * 2);
  for (let i = 0; i < samples; i++) {
    const v = Math.round(Math.sin((i / 16) * Math.PI) * amplitude * 0x7fff);
    bytes[i * 2] = v & 0xff; // eslint-disable-line no-bitwise
    bytes[i * 2 + 1] = (v >> 8) & 0xff; // eslint-disable-line no-bitwise
  }
  return bytes;
}

const speech = () => chunk(0.3);
const silence = () => chunk(0);

function push(segmenter: SpeechSegmenter, make: () => Uint8Array, ms: number) {
  for (let t = 0; t < ms; t += CHUNK_MS) {
    segmenter.push(make());
  }
}

describe('SpeechSegmenter', () => {
  it('cuts a segment at a pause after speech and keeps going', () => {
    const segments: Uint8Array[] = [];
    const segmenter = new SpeechSegmenter(s => segments.push(s));

    push(segmenter, speech, 1000);
    push(segmenter, silence, ASR_SEGMENT_PAUSE_MS - CHUNK_MS);
    expect(segments).toHaveLength(0);
    push(segmenter, silence, CHUNK_MS);
    expect(segments).toHaveLength(1);
    expect(segments[0].length).toBe(
      (1000 + ASR_SEGMENT_PAUSE_MS) * BYTES_PER_MS,
    );

    push(segmenter, speech, 500);
    const tail = segmenter.flush();
    expect(tail?.length).toBe(500 * BYTES_PER_MS);
    expect(segments).toHaveLength(1);
  });

  it('does not cut on a pause shorter than the threshold', () => {
    const segments: Uint8Array[] = [];
    const segmenter = new SpeechSegmenter(s => segments.push(s));

    push(segmenter, speech, 500);
    push(segmenter, silence, ASR_SEGMENT_PAUSE_MS - CHUNK_MS);
    push(segmenter, speech, 500);

    expect(segments).toHaveLength(0);
    expect(segmenter.flush()?.length).toBe(
      (1000 + ASR_SEGMENT_PAUSE_MS - CHUNK_MS) * BYTES_PER_MS,
    );
  });

  it('keeps only a short lead-in of silence before speech', () => {
    const segments: Uint8Array[] = [];
    const segmenter = new SpeechSegmenter(s => segments.push(s));

    push(segmenter, silence, 5000);
    expect(segmenter.flush()).toBeNull();

    push(segmenter, silence, 5000);
    push(segmenter, speech, 500);
    const tail = segmenter.flush();
    expect(segments).toHaveLength(0);
    expect(tail?.length).toBe((ASR_SEGMENT_LEAD_IN_MS + 500) * BYTES_PER_MS);
  });

  it('cuts long speech without a pause at the segment cap', () => {
    const segments: Uint8Array[] = [];
    const segmenter = new SpeechSegmenter(s => segments.push(s));

    push(segmenter, speech, ASR_MAX_SEGMENT_MS + 1000);

    expect(segments).toHaveLength(1);
    expect(segments[0].length).toBe(ASR_MAX_SEGMENT_MS * BYTES_PER_MS);
    expect(segmenter.flush()?.length).toBe(1000 * BYTES_PER_MS);
  });
});
