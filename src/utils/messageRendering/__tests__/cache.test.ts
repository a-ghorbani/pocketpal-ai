import {
  clearMessageRenderingCache,
  getMessageRenderingCacheStats,
  parseAssistantMessageCached,
} from '..';

describe('message rendering parser cache', () => {
  beforeEach(() => {
    clearMessageRenderingCache();
  });

  it('reuses parsed messages for the same content and parser options', () => {
    const raw = '# Title\n\nVisible answer';
    const first = parseAssistantMessageCached(raw, {
      hideServiceTokens: true,
    });
    const second = parseAssistantMessageCached(raw, {
      hideServiceTokens: true,
    });

    expect(second).toBe(first);
    expect(getMessageRenderingCacheStats()).toMatchObject({
      entries: 1,
      hits: 1,
      misses: 1,
    });
  });

  it('keeps parser options isolated', () => {
    const raw = '<think>hidden</think>\nVisible answer';
    const withoutThinking = parseAssistantMessageCached(raw, {
      includeThinkingInClean: false,
    });
    const withThinking = parseAssistantMessageCached(raw, {
      includeThinkingInClean: true,
    });

    expect(withThinking).not.toBe(withoutThinking);
    expect(withoutThinking.cleanText).toBe('Visible answer');
    expect(withThinking.cleanText).toContain('hidden');
    expect(getMessageRenderingCacheStats()).toMatchObject({
      entries: 2,
      hits: 0,
      misses: 2,
    });
  });

  it('does not retain very large streaming snapshots', () => {
    const raw = `${'large response\n'.repeat(10_000)}done`;
    const parsed = parseAssistantMessageCached(raw);

    expect(parsed.cleanText).toContain('done');
    expect(getMessageRenderingCacheStats()).toMatchObject({
      entries: 0,
      hits: 0,
      misses: 1,
    });
  });
});
