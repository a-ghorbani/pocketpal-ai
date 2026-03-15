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
  debugStore.ensureLoaded();

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

type CompletionProbePayload = Record<string, unknown>;

export function buildCompletionParamProbe(params: Record<string, unknown>) {
  const prompt = typeof params.prompt === 'string' ? params.prompt : '';
  const stopWords = Array.isArray(params.stop)
    ? params.stop.filter(
        (word): word is string => typeof word === 'string' && word.length > 0,
      )
    : [];
  const mediaPaths = Array.isArray(params.media_paths)
    ? params.media_paths.filter(
        (path): path is string => typeof path === 'string' && path.length > 0,
      )
    : [];
  const preservedTokens = Array.isArray(params.preserved_tokens)
    ? params.preserved_tokens.filter(
        (token): token is string => typeof token === 'string' && token.length > 0,
      )
    : [];
  const grammarTriggers = Array.isArray(params.grammar_triggers)
    ? params.grammar_triggers
    : [];
  const chatParser =
    typeof params.chat_parser === 'string' ? params.chat_parser : '';
  const suspectFlags: string[] = [];

  if (mediaPaths.length > 0 && params.enable_thinking) {
    suspectFlags.push('multimodal+thinking');
  }
  if (mediaPaths.length > 0 && chatParser) {
    suspectFlags.push('multimodal+chat_parser');
  }
  if (mediaPaths.length > 0 && preservedTokens.length > 0) {
    suspectFlags.push('multimodal+preserved_tokens');
  }
  if (prompt.includes('<__media__>')) {
    suspectFlags.push('prompt-has-__media__-placeholder');
  }
  if (prompt.includes('<think>') && params.enable_thinking === false) {
    suspectFlags.push('think-tag-present-while-thinking-disabled');
  }

  return {
    paramKeys: Object.keys(params).sort(),
    hasPrompt: prompt.length > 0,
    hasMessages: Array.isArray(params.messages),
    hasMediaPaths: mediaPaths.length > 0,
    mediaPathCount: mediaPaths.length,
    mediaPathPreview: mediaPaths.map(path => previewText(path, 120)),
    enableThinking: params.enable_thinking ?? null,
    reasoningFormat: params.reasoning_format ?? null,
    hasChatParser: chatParser.length > 0,
    chatParserLength: chatParser.length,
    chatParserHash: getTextDiagnostics(chatParser).hash,
    preservedTokenCount: preservedTokens.length,
    preservedTokensPreview: preservedTokens.slice(0, 12),
    grammarTriggersCount: grammarTriggers.length,
    promptDiag: getTextDiagnostics(prompt),
    promptHasMediaPlaceholder: prompt.includes('<__media__>'),
    promptHasVisionTokens:
      prompt.includes('<|vision_start|>') || prompt.includes('<|image_pad|>'),
    promptHasThinkTag: prompt.includes('<think>'),
    stopCount: stopWords.length,
    stopPreview: stopWords.slice(0, 10),
    suspectFlags,
  };
}

export function scheduleVisionDebugHeartbeats(
  message: string,
  getPayload: () => CompletionProbePayload,
  intervalsMs: number[] = [250, 1000, 3000, 8000],
) {
  if (!debugStore.visionDebugEnabled) {
    return () => undefined;
  }

  let cancelled = false;
  const timers: Array<ReturnType<typeof setTimeout>> = [];

  intervalsMs.forEach(intervalMs => {
    timers.push(
      setTimeout(() => {
        if (cancelled) {
          return;
        }
        visionDebugLog(message, {
          elapsedMs: intervalMs,
          ...getPayload(),
        });
      }, intervalMs),
    );
  });

  return () => {
    cancelled = true;
    timers.forEach(clearTimeout);
  };
}
