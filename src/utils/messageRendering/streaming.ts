import {ParsedAssistantMessage} from './types';

export function shouldUseStreamingFallback(
  parsed: ParsedAssistantMessage,
): boolean {
  return (
    parsed.hasPartialSegment ||
    parsed.segments.some(
      segment =>
        segment.malformed &&
        (segment.kind === 'json' ||
          segment.kind === 'math' ||
          segment.kind === 'tool'),
    )
  );
}

export function getStreamingFallbackText(
  parsed: ParsedAssistantMessage,
): string {
  return parsed.plainText || parsed.cleanText;
}
