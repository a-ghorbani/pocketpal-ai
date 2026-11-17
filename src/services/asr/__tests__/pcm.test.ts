import {inputLevel, int16PcmToFloat32} from '../pcm';

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

describe('inputLevel', () => {
  it('is 0 for silence and an empty chunk', () => {
    expect(inputLevel(new Float32Array(0))).toBe(0);
    expect(inputLevel(new Float32Array(800))).toBe(0);
  });

  it('maps -60 dBFS to 0, -10 dBFS to 1, and clamps beyond', () => {
    expect(inputLevel(new Float32Array(800).fill(0.001))).toBeCloseTo(0, 5);
    expect(
      inputLevel(new Float32Array(800).fill(10 ** (-35 / 20))),
    ).toBeCloseTo(0.5, 5);
    expect(
      inputLevel(new Float32Array(800).fill(10 ** (-10 / 20))),
    ).toBeCloseTo(1, 5);
    expect(inputLevel(new Float32Array(800).fill(0.9))).toBe(1);
    expect(inputLevel(new Float32Array(800).fill(0.0001))).toBe(0);
  });
});
