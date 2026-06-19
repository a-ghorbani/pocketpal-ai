import {
  ASR_MIN_SPEECH_MS,
  ASR_SAMPLE_RATE,
  ASR_VAD_RMS_FLOOR,
} from './constants';
import type {VadResult} from './types';

/**
 * Energy-based voice-activity gate. Runs on the captured 16 kHz mono buffer
 * BEFORE the decoder, because Whisper is autoregressive and hallucinates text
 * on silence. A buffer whose RMS amplitude is below `ASR_VAD_RMS_FLOOR`, or
 * shorter than `ASR_MIN_SPEECH_MS`, is rejected and never transcribed.
 *
 * This is deliberately NOT whisper.rn's `initWhisperVad()` (issue #308 crash);
 * the energy threshold is the v1 endpoint/gate.
 *
 * @param samples normalized float32 PCM samples in [-1, 1]
 */
export function energyVad(samples: Float32Array): VadResult {
  const durationMs = (samples.length / ASR_SAMPLE_RATE) * 1000;

  if (samples.length === 0) {
    return {passed: false, rms: 0, durationMs: 0};
  }

  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    sumSquares += s * s;
  }
  const rms = Math.sqrt(sumSquares / samples.length);

  const passed = rms >= ASR_VAD_RMS_FLOOR && durationMs >= ASR_MIN_SPEECH_MS;
  return {passed, rms, durationMs};
}

/**
 * Decode signed 16-bit little-endian PCM (the pcm-stream native format) into
 * normalized float32 samples in [-1, 1]. Whisper consumes float32 PCM.
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
