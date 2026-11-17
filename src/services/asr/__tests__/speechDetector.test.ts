import {ASR_CHUNK_BYTES} from '../constants';
import {SpeechDetector} from '../speechDetector';

const FRAME_MS = 50;

function frame(dbfs: number, bytes = ASR_CHUNK_BYTES): Uint8Array {
  const value = dbfs === -Infinity ? 0 : Math.round(10 ** (dbfs / 20) * 0x7fff);
  const pcm = new Uint8Array(bytes);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i + 1 < bytes; i += 2) {
    view.setInt16(i, value, true);
  }
  return pcm;
}

function speechMs(detector: SpeechDetector, dbfs: number, ms: number) {
  let bytes = 0;
  for (let t = 0; t < ms; t += FRAME_MS) {
    bytes += detector.push(frame(dbfs)).speechBytes;
  }
  return (bytes / ASR_CHUNK_BYTES) * FRAME_MS;
}

describe('SpeechDetector', () => {
  it('counts speech that stands well above a quiet room', () => {
    const detector = new SpeechDetector();
    speechMs(detector, -70, 1000);

    expect(speechMs(detector, -52, 300)).toBe(300);
  });

  it('treats a steady sound below the ceiling as room', () => {
    const detector = new SpeechDetector();

    expect(speechMs(detector, -50, 10_000)).toBe(0);
  });

  it('never counts a frame below the floor, however quiet the room', () => {
    const detector = new SpeechDetector();
    speechMs(detector, -80, 1000);

    expect(speechMs(detector, -58, 50)).toBe(0);
    expect(speechMs(detector, -54, 50)).toBe(50);
  });

  it('counts a frame at the ceiling as speech whatever the room', () => {
    const detector = new SpeechDetector();
    speechMs(detector, -20, 1500);

    expect(speechMs(detector, -38, 50)).toBe(50);
  });

  it('does not let one quiet frame set the room level', () => {
    const detector = new SpeechDetector();
    speechMs(detector, -80, 50);

    expect(speechMs(detector, -50, 10_000)).toBe(0);
  });

  it('skips digital silence: it is neither speech nor room', () => {
    const detector = new SpeechDetector();
    speechMs(detector, -50, 1500);

    expect(speechMs(detector, -Infinity, 100)).toBe(0);
    expect(speechMs(detector, -50, 1000)).toBe(0);
  });

  it('judges every 50 ms frame of a longer chunk', () => {
    const detector = new SpeechDetector();
    speechMs(detector, -70, 1000);
    const chunk = new Uint8Array(ASR_CHUNK_BYTES * 3);
    chunk.set(frame(-70), 0);
    chunk.set(frame(-50), ASR_CHUNK_BYTES);
    chunk.set(frame(-30), ASR_CHUNK_BYTES * 2);

    expect(detector.push(chunk)).toEqual({
      speechBytes: ASR_CHUNK_BYTES * 2,
      aboveCeiling: true,
    });
  });

  it('judges a short chunk but leaves it out of the room level', () => {
    const detector = new SpeechDetector();
    speechMs(detector, -70, 1000);
    const short = frame(-50, ASR_CHUNK_BYTES / 2);

    for (let i = 0; i < 60; i++) {
      expect(detector.push(short)).toEqual({
        speechBytes: ASR_CHUNK_BYTES / 2,
        aboveCeiling: false,
      });
    }
  });

  it('counts a louder room as speech for under 1.5 s, then as room', () => {
    const detector = new SpeechDetector();
    speechMs(detector, -70, 1500);

    expect(speechMs(detector, -50, 1400)).toBe(1400);
    expect(speechMs(detector, -50, 10_000)).toBe(0);
  });

  it('counts a short first chunk at the ceiling as speech', () => {
    expect(
      new SpeechDetector().push(frame(-38, ASR_CHUNK_BYTES / 2)).speechBytes,
    ).toBe(ASR_CHUNK_BYTES / 2);
  });

  it('does not count a short first chunk below the ceiling as speech', () => {
    expect(
      new SpeechDetector().push(frame(-45, ASR_CHUNK_BYTES / 2)).speechBytes,
    ).toBe(0);
  });

  it('takes the first frame for room unless it reaches the ceiling', () => {
    expect(new SpeechDetector().push(frame(-45)).speechBytes).toBe(0);
    expect(new SpeechDetector().push(frame(-40)).speechBytes).toBe(
      ASR_CHUNK_BYTES,
    );
  });
});
