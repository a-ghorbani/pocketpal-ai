import {
  ASR_MIN_SPEECH_MS,
  ASR_SAMPLE_RATE,
  ASR_VAD_FRAME_MS,
  ASR_VAD_RMS_FLOOR,
} from './constants';
import type {VadResult} from './types';

/**
 * Energy-based voice-activity gate. Runs on the captured 16 kHz mono buffer
 * BEFORE the decoder, because Whisper is autoregressive and hallucinates text
 * on silence. The buffer is split into `ASR_VAD_FRAME_MS` frames; a frame is
 * voiced when its RMS reaches `ASR_VAD_RMS_FLOOR`. A buffer with less than
 * `ASR_MIN_SPEECH_MS` of voiced frames is rejected and never transcribed.
 * Gating per frame keeps the silence before and after speech in a long hold
 * from diluting quiet but clear speech below the floor.
 *
 * This is deliberately NOT whisper.rn's `initWhisperVad()` (issue #308 crash);
 * the energy threshold is the v1 endpoint/gate.
 *
 * @param samples normalized float32 PCM samples in [-1, 1]
 */
export function energyVad(samples: Float32Array): VadResult {
  const durationMs = (samples.length / ASR_SAMPLE_RATE) * 1000;

  if (samples.length === 0) {
    return {passed: false, rms: 0, voicedMs: 0, durationMs: 0};
  }

  const frameSize = Math.round((ASR_SAMPLE_RATE * ASR_VAD_FRAME_MS) / 1000);
  let sumSquares = 0;
  let voicedFrames = 0;
  for (let start = 0; start < samples.length; start += frameSize) {
    const end = Math.min(start + frameSize, samples.length);
    let frameSquares = 0;
    for (let i = start; i < end; i++) {
      const s = samples[i]!;
      frameSquares += s * s;
    }
    sumSquares += frameSquares;
    if (
      end - start === frameSize &&
      Math.sqrt(frameSquares / frameSize) >= ASR_VAD_RMS_FLOOR
    ) {
      voicedFrames++;
    }
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  const voicedMs = voicedFrames * ASR_VAD_FRAME_MS;

  return {passed: voicedMs >= ASR_MIN_SPEECH_MS, rms, voicedMs, durationMs};
}

/**
 * Decode signed 16-bit little-endian PCM (the pcm-stream native format) into
 * normalized float32 samples in [-1, 1] for the energy gate.
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
