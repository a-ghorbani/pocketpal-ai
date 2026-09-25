import {ParsedAssistantMessage} from './types';

export function shouldUseStreamingFallback(
  parsed: ParsedAssistantMessage,
): boolean {
  return parsed.hasPartialSegment;
}

export function getStreamingFallbackText(
  parsed: ParsedAssistantMessage,
): string {
  return parsed.plainText || parsed.cleanText;
}
