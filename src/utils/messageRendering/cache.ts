import {parseAssistantMessage} from './parser';
import {
  MessageParserOptions,
  ParsedAssistantMessage,
  MessageRenderingCacheStats,
} from './types';

const MAX_CACHE_ENTRIES = 80;
const MAX_CACHE_CHARS = 600_000;
const MAX_CACHEABLE_CHARS = 120_000;

interface CacheEntry {
  raw: string;
  optionsKey: string;
  parsed: ParsedAssistantMessage;
  size: number;
}

const parseCache = new Map<string, CacheEntry>();
let cachedChars = 0;
let hits = 0;
let misses = 0;

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 2147483647;
  }
  return Math.abs(hash).toString(36);
}

function optionsKey(options: MessageParserOptions): string {
  return JSON.stringify({
    thinkingStartTag: options.thinkingStartTag || '',
    thinkingEndTag: options.thinkingEndTag || '',
    includeThinkingInClean: !!options.includeThinkingInClean,
    hideServiceTokens: options.hideServiceTokens ?? true,
  });
}

function cacheKey(raw: string, key: string): string {
  return `${raw.length}:${hashText(raw)}:${key}`;
}

function touchEntry(key: string, entry: CacheEntry) {
  parseCache.delete(key);
  parseCache.set(key, entry);
}

function evictOverflow() {
  while (parseCache.size > MAX_CACHE_ENTRIES || cachedChars > MAX_CACHE_CHARS) {
    const oldestKey = parseCache.keys().next().value;
    if (!oldestKey) {
      return;
    }
    const oldestEntry = parseCache.get(oldestKey);
    parseCache.delete(oldestKey);
    cachedChars -= oldestEntry?.size || 0;
  }
}

export function parseAssistantMessageCached(
  raw: string,
  options: MessageParserOptions = {},
): ParsedAssistantMessage {
  const key = optionsKey(options);
  const id = cacheKey(raw, key);
  const existing = parseCache.get(id);

  if (existing?.raw === raw && existing.optionsKey === key) {
    hits += 1;
    touchEntry(id, existing);
    return existing.parsed;
  }

  misses += 1;
  const parsed = parseAssistantMessage(raw, options);

  if (raw.length <= MAX_CACHEABLE_CHARS) {
    const replaced = parseCache.get(id);
    if (replaced) {
      cachedChars -= replaced.size;
    }

    const entry = {
      raw,
      optionsKey: key,
      parsed,
      size: raw.length,
    };
    parseCache.set(id, entry);
    cachedChars += entry.size;
    evictOverflow();
  }

  return parsed;
}

export function clearMessageRenderingCache() {
  parseCache.clear();
  cachedChars = 0;
  hits = 0;
  misses = 0;
}

export function getMessageRenderingCacheStats(): MessageRenderingCacheStats {
  return {
    entries: parseCache.size,
    cachedChars,
    hits,
    misses,
  };
}
