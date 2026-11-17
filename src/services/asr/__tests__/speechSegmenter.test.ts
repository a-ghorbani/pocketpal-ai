import {
  ASR_MAX_SEGMENT_MS,
  ASR_MIN_SEGMENT_MS,
  ASR_MIN_SPEECH_MS,
  ASR_SEGMENT_LEAD_IN_MS,
  ASR_SEGMENT_PAUSE_MS,
} from '../constants';
import {SpeechSegmenter} from '../speechSegmenter';
import {
  type Signal,
  chunksOf,
  joined,
  mixed,
  overQuietRoom,
  quietRoom,
  quietRoomPcm,
  roomAt,
  speechAt,
  steadyRoomPcm,
  toPcm,
  wordAt,
} from '../../../../jest/fixtures/asr';

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

    push(segmenter, speech, ASR_MIN_SEGMENT_MS);
    push(segmenter, silence, ASR_SEGMENT_PAUSE_MS - CHUNK_MS);
    expect(segments).toHaveLength(0);
    push(segmenter, silence, CHUNK_MS);
    expect(segments).toHaveLength(1);
    expect(segments[0].length).toBe(
      (ASR_MIN_SEGMENT_MS + ASR_SEGMENT_PAUSE_MS) * BYTES_PER_MS,
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

  it('does not cut a segment shorter than the minimum at a pause', () => {
    const segments: Uint8Array[] = [];
    const segmenter = new SpeechSegmenter(s => segments.push(s));

    push(segmenter, speech, 3000);
    push(segmenter, silence, 2000);
    push(segmenter, speech, 3000);

    expect(segments).toHaveLength(0);
    expect(segmenter.flush()?.length).toBe(8000 * BYTES_PER_MS);
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

  it('hands over nothing with less than the minimum of speech', () => {
    const segments: Uint8Array[] = [];
    const segmenter = new SpeechSegmenter(s => segments.push(s));

    push(segmenter, speech, ASR_MIN_SPEECH_MS - CHUNK_MS);
    push(segmenter, silence, ASR_MAX_SEGMENT_MS);

    expect(segments).toHaveLength(0);
    expect(segmenter.flush()).toBeNull();
  });

  it('cuts long speech without a pause at the segment cap', () => {
    const segments: Uint8Array[] = [];
    const segmenter = new SpeechSegmenter(s => segments.push(s));

    push(segmenter, speech, ASR_MAX_SEGMENT_MS + 1000);

    expect(segments).toHaveLength(1);
    expect(segments[0].length).toBe(ASR_MAX_SEGMENT_MS * BYTES_PER_MS);
    expect(segmenter.flush()?.length).toBe(1000 * BYTES_PER_MS);
  });

  describe('on recorded rooms', () => {
    function segmentsOf(signal: Signal): Uint8Array[] {
      const segments: Uint8Array[] = [];
      const segmenter = new SpeechSegmenter(s => segments.push(s));
      chunksOf(toPcm(signal)).forEach(c => segmenter.push(c));
      const tail = segmenter.flush();
      return tail ? [...segments, tail] : segments;
    }

    const msOf = (pcm: Uint8Array) => pcm.length / BYTES_PER_MS;

    it.each([-55, -50, -45])(
      'hands over nothing for a steady room at %d dBFS',
      dbfs => {
        expect(segmentsOf(roomAt(steadyRoomPcm(), dbfs, 10_000))).toHaveLength(
          0,
        );
      },
    );

    it.each([-55, -50])(
      'hands over nothing in a minute of a knocking room at %d dBFS',
      dbfs => {
        expect(segmentsOf(roomAt(quietRoomPcm(), dbfs, 60_000))).toHaveLength(
          0,
        );
      },
    );

    it.each([-55, -50, -45])(
      'hands over speech 15 dB above a room at %d dBFS',
      dbfs => {
        const room = roomAt(steadyRoomPcm(), dbfs, 6000);

        expect(segmentsOf(mixed(room, speechAt(dbfs + 15), 1000))).toHaveLength(
          1,
        );
      },
    );

    it('hands over nothing when one quiet frame comes before the room', () => {
      const signal = joined(
        roomAt(steadyRoomPcm(), -80, 50),
        roomAt(steadyRoomPcm(), -50, 10_000),
      );

      expect(segmentsOf(signal)).toHaveLength(0);
    });

    it('hands over one segment when the room gets louder', () => {
      const signal = joined(
        quietRoom(2000),
        roomAt(steadyRoomPcm(), -50, 20_000),
      );

      expect(segmentsOf(signal)).toHaveLength(1);
    });

    it('does not add up quiet knocks separated by pauses', () => {
      const knock = roomAt(steadyRoomPcm(), -50, 150);
      const signal = mixed(mixed(quietRoom(5000), knock, 1000), knock, 2150);

      expect(segmentsOf(signal)).toHaveLength(0);
    });

    it('does not add up quiet knocks after a loud segment was cut', () => {
      const sentence = overQuietRoom(speechAt(-30));
      const knock = roomAt(steadyRoomPcm(), -50, 150);
      const signal = joined(
        quietRoom(1000),
        ...Array.from(
          {length: Math.ceil(ASR_MIN_SEGMENT_MS / msOf(toPcm(sentence)))},
          () => sentence,
        ),
        mixed(mixed(quietRoom(5000), knock, 1000), knock, 2150),
      );

      expect(segmentsOf(signal)).toHaveLength(1);
    });

    it.each([-30, -48])(
      'keeps a short first word at %d dBFS with the sentence after its pause',
      dbfs => {
        const signal = joined(
          quietRoom(1000),
          overQuietRoom(wordAt(dbfs)),
          quietRoom(800),
          overQuietRoom(speechAt(dbfs)),
          quietRoom(1000),
        );

        const segments = segmentsOf(signal);
        expect(segments).toHaveLength(1);
        expect(msOf(segments[0])).toBe(
          msOf(toPcm(signal)) - 1000 + ASR_SEGMENT_LEAD_IN_MS,
        );
      },
    );

    it('adds up loud short words separated by pauses', () => {
      const word = overQuietRoom(wordAt(-30));
      const signal = joined(
        quietRoom(1000),
        word,
        quietRoom(1000),
        word,
        quietRoom(1000),
      );

      expect(segmentsOf(signal)).toHaveLength(1);
    });
  });
});
