import {debugStore} from '../store/DebugStore';

let consoleCaptureInitialized = false;

export function previewText(value: unknown, maxLength: number = 500): string {
  if (value === undefined || value === null) {
    return '';
  }

  const text = String(value);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function simpleHash(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function getTextDiagnostics(value: unknown) {
  const text = String(value ?? '');
  const len = text.length;
  if (len === 0) {
    return {
      length: 0,
      hash: simpleHash(''),
      asciiRatio: 0,
      symbolRatio: 0,
      digitRatio: 0,
      whitespaceRatio: 0,
      repeatedCharMaxRun: 0,
      repeatedBigramTop: '',
      repeatedBigramCount: 0,
      preview: '',
    };
  }

  let ascii = 0;
  let symbol = 0;
  let digit = 0;
  let whitespace = 0;
  let maxRun = 1;
  let currentRun = 1;
  const bigramCounts = new Map<string, number>();

  for (let i = 0; i < len; i += 1) {
    const ch = text[i];
    const code = text.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      ascii += 1;
    }
    if (/\d/.test(ch)) {
      digit += 1;
    }
    if (/\s/.test(ch)) {
      whitespace += 1;
    }
    if (/[\[\]{}()<>\\\/|^*"'`~.,;:!?%$#@&_+=-]/.test(ch)) {
      symbol += 1;
    }
    if (i > 0 && text[i - 1] === ch) {
      currentRun += 1;
      if (currentRun > maxRun) {
        maxRun = currentRun;
      }
    } else {
      currentRun = 1;
    }
    if (i < len - 1) {
      const bigram = `${text[i]}${text[i + 1]}`;
      bigramCounts.set(bigram, (bigramCounts.get(bigram) || 0) + 1);
    }
  }

  let topBigram = '';
  let topBigramCount = 0;
  bigramCounts.forEach((count, bigram) => {
    if (count > topBigramCount) {
      topBigram = bigram;
      topBigramCount = count;
    }
  });

  return {
    length: len,
    hash: simpleHash(text),
    asciiRatio: Number((ascii / len).toFixed(3)),
    symbolRatio: Number((symbol / len).toFixed(3)),
    digitRatio: Number((digit / len).toFixed(3)),
    whitespaceRatio: Number((whitespace / len).toFixed(3)),
    repeatedCharMaxRun: maxRun,
    repeatedBigramTop: topBigram,
    repeatedBigramCount: topBigramCount,
    preview: previewText(text, 240),
  };
}

export function initializeConsoleCapture() {
  if (consoleCaptureInitialized) {
    return;
  }

  consoleCaptureInitialized = true;

  const originalLog = console.log.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    debugStore.addLog('log', args);
    originalLog(...args);
  };

  console.warn = (...args: unknown[]) => {
    debugStore.addLog('warn', args);
    originalWarn(...args);
  };

  console.error = (...args: unknown[]) => {
    debugStore.addLog('error', args);
    originalError(...args);
  };
}

export function visionDebugLog(message: string, payload?: unknown) {
  if (!debugStore.visionDebugEnabled) {
    return;
  }

  if (payload === undefined) {
    console.log('[VisionDebug]', message);
    return;
  }

  console.log('[VisionDebug]', message, payload);
}
