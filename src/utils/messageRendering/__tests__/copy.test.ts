import {
  buildMessageCopyTextFromMessage,
  buildMessageCopyText,
  prettyPrintJson,
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

  it('copies markdown table as tab-delimited plain text', () => {
    expect(tableMarkdownToPlainText('| A | B |\n|---|---|\n| 1 | 2 |')).toBe(
      'A\tB\n1\t2',
    );
  });
});
