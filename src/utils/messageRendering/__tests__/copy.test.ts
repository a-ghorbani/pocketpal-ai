import {
  buildSegmentCopyText,
  buildMessageCopyTextFromMessage,
  buildMessageCopyText,
  prettyPrintJson,
  prettyPrintXml,
  tableMarkdownToPlainText,
} from '..';
import {goldenMessages} from '../__fixtures__/goldenMessages';

describe('message rendering copy helpers', () => {
  it('copies markdown without thinking and service tags', () => {
    const text = `${goldenMessages.chatML}\n${goldenMessages.think}`;

    expect(buildMessageCopyText(text, 'markdown')).toBe(
      'Hello\n\nFinal answer.',
    );
  });

  it('copies clean plain text from markdown', () => {
    expect(buildMessageCopyText(goldenMessages.simpleMarkdown, 'clean')).toBe(
      'Title\n\nHello world with inline code.',
    );
  });

  it('can copy clean text with thinking included', () => {
    expect(
      buildMessageCopyText(goldenMessages.think, 'cleanWithThinking'),
    ).toBe('Thinking\nNeed a plan.\n\nFinal answer.');
  });

  it('keeps raw text untouched', () => {
    expect(buildMessageCopyText(goldenMessages.llamaTokens, 'raw')).toBe(
      goldenMessages.llamaTokens,
    );
  });

  it('uses preserved raw completion metadata for message copy modes', () => {
    const message = {
      text: 'Visible',
      metadata: {
        completionResult: {
          raw_content: '<think>hidden</think>\n<|assistant|>\nVisible',
        },
      },
    };

    expect(buildMessageCopyTextFromMessage(message, 'raw')).toContain(
      '<think>hidden</think>',
    );
    expect(buildMessageCopyTextFromMessage(message, 'clean')).toBe('Visible');
  });

  it('pretty prints valid JSON and falls back for malformed JSON', () => {
    expect(prettyPrintJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyPrintJson('{"a":')).toBe('{"a":');
  });

  it('pretty prints balanced XML and falls back for malformed XML', () => {
    expect(prettyPrintXml('<response><answer>42</answer></response>')).toBe(
      '<response>\n  <answer>\n    42\n  </answer>\n</response>',
    );
    expect(prettyPrintXml('<response><answer>42</response>')).toBe(
      '<response><answer>42</response>',
    );
  });

  it('keeps unsafe HTML as copy-safe XML text', () => {
    expect(prettyPrintXml('<script>alert("no")</script>')).toBe(
      '<script>\n  alert("no")\n</script>',
    );
  });

  it('copies markdown table as tab-delimited plain text', () => {
    expect(tableMarkdownToPlainText('| A | B |\n|---|---|\n| 1 | 2 |')).toBe(
      'A\tB\n1\t2',
    );
  });

  it('copies table segments as markdown or plain text', () => {
    const table = {
      id: 'table',
      kind: 'table' as const,
      raw: '| A | B |\n|---|---|\n| 1 | 2 |',
      content: '| A | B |\n|---|---|\n| 1 | 2 |',
    };

    expect(buildSegmentCopyText(table, 'markdown')).toBe(table.raw);
    expect(buildSegmentCopyText(table, 'plain')).toBe('A\tB\n1\t2');
  });

  it('copies math segments as raw latex or inner expression', () => {
    const math = {
      id: 'math',
      kind: 'math' as const,
      raw: '$$E = mc^2$$',
      content: 'E = mc^2',
    };

    expect(buildSegmentCopyText(math, 'raw')).toBe('$$E = mc^2$$');
    expect(buildSegmentCopyText(math, 'plain')).toBe('E = mc^2');
  });
});
