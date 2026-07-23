/**
 * Hermes provides `TextEncoder` but no `TextDecoder`, and React Native ships no
 * polyfill, so UTF-8 decoding is unavailable on device even though every
 * Node-hosted test has it. Imported for its side effect from `index.js`, ahead
 * of the app graph, so anything that decodes bytes finds a decoder.
 */

/* eslint-disable no-bitwise -- UTF-8 is defined in terms of bit operations. */

const UTF8_LABELS = new Set(['utf-8', 'utf8', 'unicode-1-1-utf-8']);
const REPLACEMENT = 0xfffd;
const BOM = 0xfeff;
const FLUSH_AT = 0x1000;
const EMPTY = new Uint8Array(0);

type DecoderInput = ArrayBuffer | ArrayBufferView;

interface DecoderOptions {
  fatal?: boolean;
  ignoreBOM?: boolean;
}

const asBytes = (input?: DecoderInput | null): Uint8Array => {
  if (!input) {
    return EMPTY;
  }
  return ArrayBuffer.isView(input)
    ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    : new Uint8Array(input);
};

const decodeUtf8 = (bytes: Uint8Array, fatal: boolean): string => {
  let out = '';
  const units: number[] = [];

  const flush = () => {
    out += String.fromCharCode(...units);
    units.length = 0;
  };

  const emit = (codePoint: number) => {
    if (codePoint > 0xffff) {
      const shifted = codePoint - 0x10000;
      units.push(0xd800 + (shifted >> 10), 0xdc00 + (shifted & 0x3ff));
    } else {
      units.push(codePoint);
    }
    if (units.length >= FLUSH_AT) {
      flush();
    }
  };

  const emitInvalid = () => {
    if (fatal) {
      throw new TypeError('The encoded data was not valid UTF-8');
    }
    emit(REPLACEMENT);
  };

  let i = 0;
  while (i < bytes.length) {
    const lead = bytes[i];
    let codePoint: number;
    let continuations: number;
    // Per-lead bounds on the FIRST continuation byte reject overlong forms,
    // surrogate halves (0xED) and code points past U+10FFFF (0xF4).
    let firstLow = 0x80;
    let firstHigh = 0xbf;

    if (lead <= 0x7f) {
      i++;
      emit(lead);
      continue;
    } else if (lead >= 0xc2 && lead <= 0xdf) {
      codePoint = lead & 0x1f;
      continuations = 1;
    } else if (lead >= 0xe0 && lead <= 0xef) {
      codePoint = lead & 0x0f;
      continuations = 2;
      if (lead === 0xe0) {
        firstLow = 0xa0;
      } else if (lead === 0xed) {
        firstHigh = 0x9f;
      }
    } else if (lead >= 0xf0 && lead <= 0xf4) {
      codePoint = lead & 0x07;
      continuations = 3;
      if (lead === 0xf0) {
        firstLow = 0x90;
      } else if (lead === 0xf4) {
        firstHigh = 0x8f;
      }
    } else {
      i++;
      emitInvalid();
      continue;
    }

    i++;
    let complete = true;
    for (let n = 0; n < continuations; n++) {
      const byte = bytes[i];
      const low = n === 0 ? firstLow : 0x80;
      const high = n === 0 ? firstHigh : 0xbf;
      if (byte === undefined || byte < low || byte > high) {
        complete = false;
        break;
      }
      codePoint = (codePoint << 6) | (byte & 0x3f);
      i++;
    }

    // `i` stops on the offending byte, which is re-read as a fresh lead.
    if (complete) {
      emit(codePoint);
    } else {
      emitInvalid();
    }
  }

  flush();
  return out;
};

export class Utf8TextDecoder {
  readonly encoding = 'utf-8';
  readonly fatal: boolean;
  readonly ignoreBOM: boolean;

  constructor(label: string = 'utf-8', options: DecoderOptions = {}) {
    if (!UTF8_LABELS.has(String(label).trim().toLowerCase())) {
      throw new RangeError(
        `TextDecoder polyfill supports UTF-8 only, received "${label}"`,
      );
    }
    this.fatal = options.fatal === true;
    this.ignoreBOM = options.ignoreBOM === true;
  }

  decode(input?: DecoderInput | null): string {
    const text = decodeUtf8(asBytes(input), this.fatal);
    return !this.ignoreBOM && text.charCodeAt(0) === BOM ? text.slice(1) : text;
  }
}

export const installTextDecoder = (): void => {
  const scope = globalThis as unknown as {TextDecoder?: unknown};
  if (typeof scope.TextDecoder === 'undefined') {
    scope.TextDecoder = Utf8TextDecoder;
  }
};

installTextDecoder();
