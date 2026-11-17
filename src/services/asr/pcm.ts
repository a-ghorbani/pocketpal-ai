/**
 * Decode signed 16-bit little-endian PCM (the pcm-stream native format) into
 * normalized float32 samples in [-1, 1].
 */
export function int16PcmToFloat32(pcm: Uint8Array): Float32Array {
  const sampleCount = Math.floor(pcm.length / 2);
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const lo = pcm[i * 2]!;
    const hi = pcm[i * 2 + 1]!;
    let val = (hi << 8) | lo; // eslint-disable-line no-bitwise
    if (val >= 0x8000) {
      val -= 0x10000;
    }
    out[i] = val < 0 ? val / 0x8000 : val / 0x7fff;
  }
  return out;
}

const LEVEL_FLOOR_DB = -60;
const LEVEL_CEIL_DB = -10;

/**
 * Loudness of a captured chunk on a 0..1 scale for the recording waveform:
 * RMS in dBFS, mapped linearly from -60 dB (0) to -10 dB (1).
 */
export function inputLevel(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    sumSquares += s * s;
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  if (rms === 0) {
    return 0;
  }
  const db = 20 * Math.log10(rms);
  const level = (db - LEVEL_FLOOR_DB) / (LEVEL_CEIL_DB - LEVEL_FLOOR_DB);
  return Math.min(1, Math.max(0, level));
}
