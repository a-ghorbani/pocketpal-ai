import {
  buildMessageCopyText,
  fallbackTablesToCodeBlocks,
  isSafeLinkUrl,
  parseAssistantMessage,
  prepareMarkdownForRender,
} from '..';
import {goldenMessages} from '../__fixtures__/goldenMessages';

describe('message rendering parser', () => {
  it('splits code blocks without rendering markdown or math inside code', () => {
    const parsed = parseAssistantMessage(
      `Before\n\n${goldenMessages.pythonCode}\n\nAfter $x$`,
    );

    expect(parsed.segments.some(segment => segment.kind === 'code')).toBe(true);
    const code = parsed.segments.find(segment => segment.kind === 'code');
    expect(code?.language).toBe('python');
    expect(code?.content).toContain('print("$not math")');
  });

  it('keeps model tags literal inside fenced code when cleaning output', () => {
    const raw = [
      '```xml',
      '<think>literal</think>',
      '<|assistant|>',
      '```',
      'Final answer.',
    ].join('\n');

    const parsed = parseAssistantMessage(raw);

    expect(parsed.markdownText).toBe(raw);
    expect(buildMessageCopyText(raw, 'markdown')).toBe(raw);
    expect(buildMessageCopyText(raw, 'clean')).toContain(
      '<think>literal</think>',
    );
    expect(buildMessageCopyText(raw, 'clean')).toContain('<|assistant|>');
  });

  it('extracts thinking and excludes it from clean output', () => {
    const parsed = parseAssistantMessage(goldenMessages.think);

    expect(parsed.hasThinking).toBe(true);
    expect(
      parsed.segments.find(segment => segment.kind === 'thinking')?.content,
    ).toBe('Need a plan.');
    expect(parsed.cleanText).toBe('Final answer.');
  });

  it('keeps raw mode exact while clean mode strips service tokens', () => {
    expect(buildMessageCopyText(goldenMessages.chatML, 'raw')).toBe(
      goldenMessages.chatML,
    );
    expect(buildMessageCopyText(goldenMessages.chatML, 'clean')).toBe('Hello');
  });

  it('strips role-wrapped ChatML, Llama, and Gemma template tokens', () => {
    expect(
      buildMessageCopyText(goldenMessages.chatMLRoleWrapped, 'clean'),
    ).toBe('Hello');
    expect(
      buildMessageCopyText(goldenMessages.llamaHeaderTokens, 'clean'),
    ).toBe('Hello');
    expect(buildMessageCopyText(goldenMessages.gemmaTurnTokens, 'clean')).toBe(
      'Hello',
    );
  });

  it('handles unclosed thinking during streaming as a partial segment', () => {
    const parsed = parseAssistantMessage(goldenMessages.unclosedThink);

    expect(parsed.hasPartialSegment).toBe(true);
    expect(parsed.cleanText).toBe('');
  });

  it('classifies tables, JSON, and XML', () => {
    expect(parseAssistantMessage(goldenMessages.table).segments[0].kind).toBe(
      'table',
    );
    expect(parseAssistantMessage(goldenMessages.json).segments[0].kind).toBe(
      'json',
    );
    expect(parseAssistantMessage(goldenMessages.xml).segments[0].kind).toBe(
      'xml',
    );
  });

  it('marks malformed JSON without throwing', () => {
    const parsed = parseAssistantMessage('{"name":');

    expect(parsed.segments[0].kind).toBe('json');
    expect(parsed.segments[0].malformed).toBe(true);
  });

  it('preserves escaped dollars and renders supported math delimiters', () => {
    const prepared = prepareMarkdownForRender(
      `${goldenMessages.inlineLatex}\n\n${goldenMessages.blockLatex}\n\n${goldenMessages.escapedDollar}`,
    );

    expect(prepared).toContain('data-pp-math="inline"');
    expect(prepared).toContain('data-pp-math="block"');
    expect(prepared).toContain('\\$5');
  });

  it('does not inject math nodes inside code fences', () => {
    const prepared = prepareMarkdownForRender(goldenMessages.pythonCode);

    expect(prepared).not.toContain('data-pp-math');
    expect(prepared).toContain('print("$not math")');
  });

  it('escapes unsafe HTML before markdown render', () => {
    const prepared = prepareMarkdownForRender(goldenMessages.unsafeHtml);

    expect(prepared).toContain('&lt;script&gt;');
    expect(prepared).not.toContain('<script>');
  });

  it('supports custom thinking tags', () => {
    const parsed = parseAssistantMessage('<start>hidden</end>\nvisible', {
      thinkingStartTag: '<start>',
      thinkingEndTag: '</end>',
    });

    expect(parsed.cleanText).toBe('visible');
    expect(parsed.segments[0].kind).toBe('thinking');
  });

  it('supports Gemma-style thought tags', () => {
    const parsed = parseAssistantMessage(goldenMessages.gemmaThinking);

    expect(parsed.hasThinking).toBe(true);
    expect(parsed.cleanText).toBe('Final answer.');
    expect(getThinkingText(parsed)).toBe('private plan');
  });

  it('treats channel analysis as thinking and keeps final content clean', () => {
    const parsed = parseAssistantMessage(
      '<|channel>analysis\nprivate reasoning\n<|channel>final\nVisible',
    );

    expect(parsed.hasThinking).toBe(true);
    expect(parsed.cleanText).toBe('Visible');
    expect(getThinkingText(parsed)).toBe('private reasoning');
  });

  it('rejects unsafe link schemes', () => {
    expect(isSafeLinkUrl('https://example.com')).toBe(true);
    expect(isSafeLinkUrl('mailto:test@example.com')).toBe(true);
    expect(isSafeLinkUrl(`java${'script'}:alert(1)`)).toBe(false);
    expect(isSafeLinkUrl('data:text/html,hello')).toBe(false);
  });

  it('falls markdown tables back to code blocks when table rendering is off', () => {
    expect(fallbackTablesToCodeBlocks(goldenMessages.table)).toContain(
      '```text',
    );
  });

  it('handles large responses without dropping content', () => {
    const parsed = parseAssistantMessage(goldenMessages.hugeResponse);

    expect(parsed.cleanText).toContain('Section 399');
    expect(parsed.hash).toBeTruthy();
  });
});

function getThinkingText(parsed: ReturnType<typeof parseAssistantMessage>) {
  return parsed.segments
    .filter(segment => segment.kind === 'thinking')
    .map(segment => segment.content.trim())
    .join('\n\n');
}
