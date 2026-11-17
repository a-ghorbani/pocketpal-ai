import {ASR_CHUNK_BYTES} from '../../asr/constants';
import {Endpointer} from '../endpointer';

const CHUNK_MS = 50;

const chunk = (amplitude: number): Uint8Array => {
  const pcm = new Uint8Array(ASR_CHUNK_BYTES);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < ASR_CHUNK_BYTES / 2; i++) {
    view.setInt16(i * 2, (i % 2 ? 1 : -1) * amplitude * 0x7fff, true);
  }
  return pcm;
};
const voiced = () => chunk(0.1);
const silent = () => chunk(0);
const noise = () => chunk(0.005);

const pushFor = (
  endpointer: Endpointer,
  make: () => Uint8Array,
  ms: number,
): Array<'none' | 'endpoint'> =>
  Array.from({length: ms / CHUNK_MS}, () => endpointer.push(make()));

describe('Endpointer', () => {
  it('keeps only a short lead-in of silence before speech', () => {
    const endpointer = new Endpointer();
    pushFor(endpointer, silent, 2000);
    pushFor(endpointer, voiced, 500);
    endpointer.tap();

    const ms = (endpointer.take().length / ASR_CHUNK_BYTES) * CHUNK_MS;
    expect(ms).toBeLessThanOrEqual(850);
    expect(ms).toBeGreaterThanOrEqual(500);
  });

  it('endpoints after 600 ms of silence that follows speech', () => {
    const endpointer = new Endpointer();
    pushFor(endpointer, voiced, 500);
    const results = pushFor(endpointer, silent, 600);

    expect(results.slice(0, -1)).not.toContain('endpoint');
    expect(results[results.length - 1]).toBe('endpoint');
  });

  it('does not endpoint on a pause after less than the minimum speech', () => {
    const endpointer = new Endpointer();
    pushFor(endpointer, voiced, 150);
    const results = pushFor(endpointer, silent, 2000);

    expect(results).not.toContain('endpoint');
    expect(endpointer.hasSpeech).toBe(false);
  });

  it('endpoints at the 25 s cap while speech goes on', () => {
    const endpointer = new Endpointer();
    const results = pushFor(endpointer, voiced, 25_000);

    expect(results.indexOf('endpoint')).toBe(results.length - 1);
  });

  it('a tap ends the utterance only once speech was heard', () => {
    const endpointer = new Endpointer();
    pushFor(endpointer, silent, 1000);
    expect(endpointer.tap()).toBe(false);

    pushFor(endpointer, voiced, 400);
    expect(endpointer.tap()).toBe(true);
  });

  it('never endpoints on 30 s of noise below the floor', () => {
    const endpointer = new Endpointer();
    const results = pushFor(endpointer, noise, 30_000);

    expect(results).not.toContain('endpoint');
    expect(endpointer.take().length).toBeLessThanOrEqual(
      (400 / CHUNK_MS) * ASR_CHUNK_BYTES,
    );
  });

  it('starts over after take and reset', () => {
    const endpointer = new Endpointer();
    pushFor(endpointer, voiced, 500);
    endpointer.take();
    expect(endpointer.hasSpeech).toBe(false);

    pushFor(endpointer, voiced, 500);
    endpointer.reset();
    expect(endpointer.hasSpeech).toBe(false);
    expect(endpointer.take().length).toBe(0);
  });
});
