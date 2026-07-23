import {Utf8TextDecoder, installTextDecoder} from '../textDecoder';

// Node supplies a spec-compliant TextDecoder, so every expectation below is
// checked against it rather than against hand-written literals.
const reference = new TextDecoder();
const encode = (text: string) => new TextEncoder().encode(text);

describe('Utf8TextDecoder', () => {
  const decoder = new Utf8TextDecoder();

  describe('matches the platform decoder', () => {
    const strings: Array<[string, string]> = [
      ['ASCII', 'hello world'],
      ['2-byte sequences', 'héllo Ünicode ß'],
      ['2-byte Cyrillic', 'Привет мир'],
      ['3-byte CJK', '你好世界 モデル 한국어'],
      ['4-byte sequences as surrogate pairs', '🚀 rocket 🇺🇸 flag 𝕄𝕋ℙ'],
      ['mixed widths in one string', 'Qwen3.5-0.8B — «модель» 日本語 🚀'],
      ['a string longer than the internal flush chunk', 'αβγ🚀'.repeat(2000)],
    ];

    it.each(strings)('decodes %s', (_label, text) => {
      expect(decoder.decode(encode(text))).toBe(text);
    });

    const malformed: Array<[string, number[]]> = [
      ['a truncated 3-byte sequence', [0xe4, 0xbd]],
      ['a truncated 4-byte sequence', [0xf0, 0x9f, 0x9a]],
      ['a lone continuation byte', [0x41, 0x80, 0x42]],
      ['an overlong 2-byte encoding', [0xc0, 0x80, 0x41]],
      ['an overlong 3-byte encoding', [0xe0, 0x80, 0x80]],
      ['a surrogate half encoded as UTF-8', [0xed, 0xa0, 0x80, 0x41]],
      ['a lead byte past U+10FFFF', [0xf5, 0x41]],
      ['an F4 sequence past U+10FFFF', [0xf4, 0x90, 0x80, 0x80]],
      ['a valid sequence following an invalid byte', [0xff, 0xe4, 0xbd, 0xa0]],
    ];

    it.each(malformed)(
      'replaces %s exactly where the platform does',
      (_label, bytes) => {
        const input = new Uint8Array(bytes);
        expect(decoder.decode(input)).toBe(reference.decode(input));
      },
    );
  });

  describe('input shapes', () => {
    it('accepts an ArrayBuffer, the shape the GGUF reader passes', () => {
      const bytes = encode('nextn_predict_layers');
      expect(decoder.decode(bytes.buffer.slice(0, bytes.length))).toBe(
        'nextn_predict_layers',
      );
    });

    it('honours byteOffset and byteLength of a subarray view', () => {
      const padded = new Uint8Array(32);
      const bytes = encode('модель 🚀');
      padded.set(bytes, 5);
      const view = padded.subarray(5, 5 + bytes.length);

      expect(view.byteOffset).toBe(5);
      expect(decoder.decode(view)).toBe('модель 🚀');
    });

    it('decodes an empty buffer to an empty string', () => {
      expect(decoder.decode(new Uint8Array(0))).toBe('');
    });

    it('decodes a missing argument to an empty string', () => {
      expect(decoder.decode()).toBe('');
    });
  });

  describe('constructor options', () => {
    it('strips a leading BOM by default', () => {
      expect(decoder.decode(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe(
        'A',
      );
    });

    it('keeps the BOM when ignoreBOM is set', () => {
      expect(
        new Utf8TextDecoder('utf-8', {ignoreBOM: true}).decode(
          new Uint8Array([0xef, 0xbb, 0xbf, 0x41]),
        ),
      ).toBe('﻿A');
    });

    it('throws on malformed input when fatal is set', () => {
      expect(() =>
        new Utf8TextDecoder('utf-8', {fatal: true}).decode(
          new Uint8Array([0xff]),
        ),
      ).toThrow(TypeError);
    });

    it('accepts the utf-8 aliases case-insensitively', () => {
      expect(new Utf8TextDecoder('UTF-8').encoding).toBe('utf-8');
      expect(new Utf8TextDecoder('utf8').encoding).toBe('utf-8');
    });

    it('rejects an encoding it cannot honour instead of mis-decoding', () => {
      expect(() => new Utf8TextDecoder('shift_jis')).toThrow(RangeError);
    });
  });

  describe('installTextDecoder', () => {
    const original = globalThis.TextDecoder;

    afterEach(() => {
      globalThis.TextDecoder = original;
    });

    it('installs the polyfill on a runtime without TextDecoder (Hermes)', () => {
      // @ts-expect-error deleting a global to simulate the Hermes runtime
      delete globalThis.TextDecoder;

      installTextDecoder();

      expect(globalThis.TextDecoder).toBe(Utf8TextDecoder);
      expect(new TextDecoder().decode(encode('🚀 модель'))).toBe('🚀 модель');
    });

    it('leaves a native TextDecoder in place', () => {
      installTextDecoder();

      expect(globalThis.TextDecoder).toBe(original);
    });
  });
});
