import {readFileSync} from 'fs';
import {join} from 'path';

import {
  ASR_CHUNK_BYTES,
  ASR_SAMPLE_RATE,
} from '../../src/services/asr/constants';

// 16 kHz mono signed 16-bit little-endian PCM, as the recorder delivers it.
const read = (name: string) =>
  new Uint8Array(readFileSync(join(__dirname, 'asr', name)));

/** "And so my fellow Americans": the first 2.2 s of whisper.cpp's samples/jfk.wav. */
export const speechPcm = () => read('speech-and-so-my-fellow-americans.pcm');

/**
 * 3 s of a quiet room, recorded on a Galaxy S23 (Android 16) through
 * AudioRecord with the VOICE_RECOGNITION source at 16 kHz mono, the
 * recorder's settings. A soft knock sits at 0.2–0.5 s.
 */
export const quietRoomPcm = () => read('quiet-room-galaxy-s23.pcm');

/** The same room through the DEFAULT source: steady, without the knock. */
export const steadyRoomPcm = () => read('steady-room-galaxy-s23.pcm');

/** Samples in [-1, 1] at 16 kHz, for building test audio. */
export type Signal = Float64Array;

const samplesIn = (ms: number) => Math.round((ms * ASR_SAMPLE_RATE) / 1000);

export function toSignal(pcm: Uint8Array): Signal {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  return Float64Array.from(
    {length: pcm.length / 2},
    (_, i) => view.getInt16(i * 2, true) / 0x8000,
  );
}

export function toPcm(signal: Signal): Uint8Array {
  const pcm = new Uint8Array(signal.length * 2);
  const view = new DataView(pcm.buffer);
  signal.forEach((s, i) => {
    const v = Math.round(s * 0x8000);
    view.setInt16(i * 2, Math.max(-0x8000, Math.min(0x7fff, v)), true);
  });
  return pcm;
}

/** The recorder's 50 ms chunks; a shorter tail is dropped. */
export function chunksOf(pcm: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let o = 0; o + ASR_CHUNK_BYTES <= pcm.length; o += ASR_CHUNK_BYTES) {
    out.push(pcm.subarray(o, o + ASR_CHUNK_BYTES));
  }
  return out;
}

const scaled = (signal: Signal, db: number) =>
  signal.map(s => s * 10 ** (db / 20));

function rmsDb(signal: Signal): number {
  const meanSquare = signal.reduce((a, s) => a + s * s, 0) / signal.length;
  return 10 * Math.log10(meanSquare);
}

// Active speech level: power over the 30 ms frames within 30 dB of the loudest.
function activeSpeechDb(signal: Signal): number {
  const frame = samplesIn(30);
  const powers: number[] = [];
  for (let s = 0; s + frame <= signal.length; s += frame) {
    const part = signal.subarray(s, s + frame);
    powers.push(part.reduce((a, v) => a + v * v, 0) / frame);
  }
  const loudest = Math.max(...powers);
  const active = powers.filter(p => p > loudest / 1000);
  return 10 * Math.log10(active.reduce((a, b) => a + b, 0) / active.length);
}

function looped(signal: Signal, ms: number): Signal {
  return Float64Array.from(
    {length: samplesIn(ms)},
    (_, i) => signal[i % signal.length]!,
  );
}

/** The 2.2 s phrase at an active speech level of `dbfs`. */
export function speechAt(dbfs: number): Signal {
  const speech = toSignal(speechPcm());
  return scaled(speech, dbfs - activeSpeechDb(speech));
}

/** A 200 ms stretch of the phrase, every 50 ms of it within 1 dB of `dbfs`. */
export function wordAt(dbfs: number): Signal {
  const word = toSignal(speechPcm()).slice(samplesIn(700), samplesIn(900));
  return scaled(word, dbfs - rmsDb(word));
}

/** The quiet room, as recorded, for `ms`. */
export function quietRoom(ms: number): Signal {
  return looped(toSignal(quietRoomPcm()), ms);
}

/** A room recording looped to `ms` and set to an RMS level of `dbfs`. */
export function roomAt(pcm: Uint8Array, dbfs: number, ms: number): Signal {
  const room = looped(toSignal(pcm), ms);
  return scaled(room, dbfs - rmsDb(room));
}

/** `signal` added onto `bed`, starting `atMs` in. */
export function mixed(bed: Signal, signal: Signal, atMs: number): Signal {
  const out = bed.slice();
  const start = samplesIn(atMs);
  signal.forEach((s, i) => {
    if (start + i < out.length) {
      out[start + i] += s;
    }
  });
  return out;
}

export function joined(...signals: Signal[]): Signal {
  const out = new Float64Array(signals.reduce((n, s) => n + s.length, 0));
  let offset = 0;
  for (const s of signals) {
    out.set(s, offset);
    offset += s.length;
  }
  return out;
}

/** `signal` at its own level over the quiet room. */
export function overQuietRoom(signal: Signal): Signal {
  return mixed(quietRoom((signal.length / ASR_SAMPLE_RATE) * 1000), signal, 0);
}
