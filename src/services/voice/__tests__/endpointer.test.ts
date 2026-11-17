import {
  ASR_CHUNK_BYTES,
  ASR_MAX_SEGMENT_MS,
  ASR_SAMPLE_RATE,
  ASR_SEGMENT_LEAD_IN_MS,
} from '../../asr/constants';
import {Endpointer} from '../endpointer';
import {
  type Signal,
  chunksOf,
  joined,
  mixed,
  overQuietRoom,
  quietRoom,
  roomAt,
  speechAt,
  steadyRoomPcm,
  toPcm,
} from '../../../../jest/fixtures/asr';

const CHUNK_MS = 50;

const chunk = (amplitude: number, bytes = ASR_CHUNK_BYTES): Uint8Array => {
  const pcm = new Uint8Array(bytes);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < bytes / 2; i++) {
    view.setInt16(i * 2, (i % 2 ? 1 : -1) * amplitude * 0x7fff, true);
  }
  return pcm;
};
const voiced = () => chunk(0.1);
const silent = () => chunk(0);
const noise = () => chunk(0.005);
const quiet = () => chunk(0.0003);

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

  it('never endpoints on 30 s of steady noise', () => {
    const endpointer = new Endpointer();
    const results = pushFor(endpointer, noise, 30_000);

    expect(results).not.toContain('endpoint');
    expect(endpointer.take().length).toBeLessThanOrEqual(
      (400 / CHUNK_MS) * ASR_CHUNK_BYTES,
    );
  });

  it('drops the audio at the cap when it holds too little speech', () => {
    const endpointer = new Endpointer();
    const click = () => chunk(0.1, 32);
    const results: Array<'none' | 'endpoint'> = [];
    for (let t = 0; t < ASR_MAX_SEGMENT_MS; t += 500) {
      results.push(
        endpointer.push(click()),
        ...pushFor(endpointer, noise, 500),
      );
    }

    expect(results).not.toContain('endpoint');
    expect(endpointer.hasSpeech).toBe(false);
    expect(endpointer.take().length).toBeLessThanOrEqual(
      ((ASR_SEGMENT_LEAD_IN_MS + CHUNK_MS) / CHUNK_MS) * ASR_CHUNK_BYTES,
    );
  });

  it('counts only the speech frames of a longer chunk', () => {
    const endpointer = new Endpointer();
    pushFor(endpointer, quiet, 1000);
    const long = new Uint8Array(ASR_CHUNK_BYTES * 3);
    long.set(quiet(), 0);
    long.set(voiced(), ASR_CHUNK_BYTES);
    long.set(quiet(), ASR_CHUNK_BYTES * 2);
    endpointer.push(long);

    expect(endpointer.voicedMs).toBe(CHUNK_MS);
  });

  it('judges the room afresh after a reset', () => {
    const endpointer = new Endpointer();
    pushFor(endpointer, quiet, 1500);
    endpointer.reset();
    pushFor(endpointer, noise, 1000);

    expect(endpointer.hasSpeech).toBe(false);
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

  describe('on recorded rooms', () => {
    const msOf = (signal: Signal) => (signal.length / ASR_SAMPLE_RATE) * 1000;

    function endpointsOf(signal: Signal): number[] {
      const endpointer = new Endpointer();
      const at: number[] = [];
      chunksOf(toPcm(signal)).forEach((c, i) => {
        if (endpointer.push(c) === 'endpoint') {
          at.push((i + 1) * CHUNK_MS);
          endpointer.take();
        }
      });
      return at;
    }

    it.each([-55, -50, -45])(
      'never endpoints on a steady room at %d dBFS',
      dbfs => {
        expect(endpointsOf(roomAt(steadyRoomPcm(), dbfs, 10_000))).toEqual([]);
      },
    );

    it.each([-55, -50, -45])(
      'endpoints within 0.5 s after speech 15 dB above a room at %d dBFS',
      dbfs => {
        const speech = speechAt(dbfs + 15);
        const room = roomAt(steadyRoomPcm(), dbfs, 6000);
        const ends = endpointsOf(mixed(room, speech, 1000));

        expect(ends).toHaveLength(1);
        expect(ends[0] - (1000 + msOf(speech))).toBeLessThanOrEqual(500);
      },
    );

    it('endpoints after quiet speech at -46 dBFS', () => {
      const speech = overQuietRoom(speechAt(-46));
      const signal = joined(quietRoom(1000), speech, quietRoom(1000));

      expect(endpointsOf(signal)).toEqual([1000 + msOf(speech) + 400]);
    });

    it('never endpoints when one quiet frame comes before the room', () => {
      const signal = joined(
        roomAt(steadyRoomPcm(), -80, 50),
        roomAt(steadyRoomPcm(), -50, 10_000),
      );

      expect(endpointsOf(signal)).toEqual([]);
    });

    it('endpoints once when the room gets louder, then never again', () => {
      const signal = joined(
        quietRoom(2000),
        roomAt(steadyRoomPcm(), -50, 20_000),
      );

      expect(endpointsOf(signal)).toHaveLength(1);
    });
  });
});
