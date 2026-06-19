import {ASR_SAMPLE_RATE} from '../constants';
import {energyVad, int16PcmToFloat32} from '../energyVad';

const SECONDS = (n: number) => Math.floor(ASR_SAMPLE_RATE * n);

describe('energyVad', () => {
  it('rejects an empty buffer', () => {
    const result = energyVad(new Float32Array(0));
    expect(result.passed).toBe(false);
    expect(result.rms).toBe(0);
    expect(result.durationMs).toBe(0);
  });

  it('rejects silence (sub-floor RMS) even when long enough', () => {
    const samples = new Float32Array(SECONDS(2));
    samples.fill(0.0005); // well below the RMS floor
    const result = energyVad(samples);
    expect(result.passed).toBe(false);
    expect(result.durationMs).toBeGreaterThan(300);
  });

  it('rejects a loud but too-short buffer', () => {
    const samples = new Float32Array(SECONDS(0.05)); // 50 ms
    samples.fill(0.5);
    const result = energyVad(samples);
    expect(result.passed).toBe(false);
    expect(result.rms).toBeGreaterThan(0.01);
  });

  it('passes a buffer with speech-level energy and sufficient duration', () => {
    const samples = new Float32Array(SECONDS(1));
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((i / 16) * Math.PI) * 0.3;
    }
    const result = energyVad(samples);
    expect(result.passed).toBe(true);
    expect(result.rms).toBeGreaterThan(0.01);
    expect(result.durationMs).toBeGreaterThanOrEqual(300);
  });
});

describe('int16PcmToFloat32', () => {
  it('decodes little-endian signed 16-bit PCM into [-1, 1] floats', () => {
    // 0x0000 = 0, 0x7FFF = +max, 0x8000 = -max, 0xFFFF = -1
    const bytes = new Uint8Array([
      0x00, 0x00, 0xff, 0x7f, 0x00, 0x80, 0xff, 0xff,
    ]);
    const out = int16PcmToFloat32(bytes);
    expect(out.length).toBe(4);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(1, 4);
    expect(out[2]).toBeCloseTo(-1, 4);
    expect(out[3]).toBeCloseTo(-1 / 0x8000, 5);
  });

  it('drops a trailing odd byte', () => {
    const bytes = new Uint8Array([0x00, 0x00, 0x11]);
    expect(int16PcmToFloat32(bytes).length).toBe(1);
  });
});
