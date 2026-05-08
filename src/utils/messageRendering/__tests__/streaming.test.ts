import {
  getStreamingFallbackText,
  parseAssistantMessage,
  shouldUseStreamingFallback,
} from '..';
import {goldenMessages} from '../__fixtures__/goldenMessages';

describe('message rendering streaming fallback', () => {
  it('uses fallback rendering for partial code fences', () => {
    const parsed = parseAssistantMessage(goldenMessages.streamingPartials[1]);

    expect(shouldUseStreamingFallback(parsed)).toBe(true);
    expect(getStreamingFallbackText(parsed)).toContain('def test():');
  });

  it('uses fallback rendering for partial block math', () => {
    const parsed = parseAssistantMessage(goldenMessages.streamingPartials[0]);

    expect(shouldUseStreamingFallback(parsed)).toBe(true);
    expect(getStreamingFallbackText(parsed)).toContain('\\frac{1');
  });

  it('keeps partial thinking out of answer fallback text', () => {
    const parsed = parseAssistantMessage(goldenMessages.streamingPartials[2]);

    expect(shouldUseStreamingFallback(parsed)).toBe(true);
    expect(getStreamingFallbackText(parsed)).toBe('');
  });

  it('uses fallback rendering for incomplete JSON objects', () => {
    const parsed = parseAssistantMessage('{"name":');

    expect(shouldUseStreamingFallback(parsed)).toBe(true);
    expect(getStreamingFallbackText(parsed)).toContain('{"name":');
  });

  it('keeps complete messages on the rich render path', () => {
    const parsed = parseAssistantMessage(goldenMessages.simpleMarkdown);

    expect(shouldUseStreamingFallback(parsed)).toBe(false);
    expect(getStreamingFallbackText(parsed)).toContain('Title');
  });
});
