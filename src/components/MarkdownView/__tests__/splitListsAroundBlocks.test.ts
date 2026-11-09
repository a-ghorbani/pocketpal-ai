import {
  listInRootBlockquote,
  nestedListReplies,
  unaffectedReplies,
} from '../../../../jest/fixtures/nestedListReplies';
import {
  listItemsOf,
  loadMd4c,
  MdNode,
  nestedBlockCount,
  parseMarkdown,
  wordsOf,
} from '../../../../jest/md4c';

import {splitListsAroundBlocks} from '../splitListsAroundBlocks';

beforeAll(loadMd4c);

const numbersByItem = (markdown: string) =>
  listItemsOf(parseMarkdown(markdown))
    .map(item => `${item.text} = ${item.number}`)
    .sort();

const expectSameReading = (input: string, output: string) => {
  const before = parseMarkdown(input);
  const after = parseMarkdown(output);
  expect(wordsOf(after)).toEqual(wordsOf(before));
  expect(numbersByItem(output)).toEqual(numbersByItem(input));
};

const prefixes = (markdown: string) =>
  Array.from({length: markdown.length}, (_, n) => markdown.slice(0, n + 1));

describe('splitListsAroundBlocks', () => {
  describe.each(Object.entries(nestedListReplies))('%s', (_name, reply) => {
    it('has a block inside a list item before the split', () => {
      expect(nestedBlockCount(parseMarkdown(reply))).toBeGreaterThan(0);
    });

    it('moves every block to the root', () => {
      expect(
        nestedBlockCount(parseMarkdown(splitListsAroundBlocks(reply))),
      ).toBe(0);
    });

    it('keeps every word in order and every item number', () => {
      expectSameReading(reply, splitListsAroundBlocks(reply));
    });
  });

  it.each(Object.entries(unaffectedReplies))(
    'leaves %s unchanged',
    (_name, reply) => {
      expect(splitListsAroundBlocks(reply)).toBe(reply);
    },
  );

  it('leaves a list inside a root blockquote as it is', () => {
    expect(splitListsAroundBlocks(listInRootBlockquote)).toBe(
      listInRootBlockquote,
    );
  });

  it('closes the list around a code block and a table and resumes the numbering', () => {
    expect(
      splitListsAroundBlocks(nestedListReplies.numberedStepsWithTableAndCode),
    ).toBe(
      [
        "Here's how to choose:",
        '',
        '1. **Install** the CLI:',
        '',
        '```bash',
        'npm install -g foo',
        '```',
        '',
        '2. **Compare** the options:',
        '',
        '| Option | Speed | Cost |',
        '|--------|-------|------|',
        '| Alpha | Fast | Low |',
        '| Beta | Slow | High |',
        '',
        'Pick Alpha when speed matters.',
        '',
        '3. **Deploy** with `foo deploy`.',
        '',
        'That is all.',
      ].join('\n'),
    );
  });

  it('writes the rendered number into a resumed list and keeps its text column', () => {
    expect(splitListsAroundBlocks(nestedListReplies.startNumberAndWidth)).toBe(
      [
        '9. Ninth step',
        '',
        '| Option | Speed | Cost |',
        '|--------|-------|------|',
        '| Alpha | Fast | Low |',
        '| Beta | Slow | High |',
        '',
        'After the table.',
        '',
        '10. Tenth step',
        '    continuation of tenth',
        '11. Eleventh step',
      ].join('\n'),
    );
  });

  it('resumes a nested list at the root after the block', () => {
    expect(splitListsAroundBlocks(nestedListReplies.tableInNestedList)).toBe(
      [
        '1. Setup',
        '   - Hardware:',
        '',
        '| Option | Speed | Cost |',
        '|--------|-------|------|',
        '| Alpha | Fast | Low |',
        '| Beta | Slow | High |',
        '',
        '- Software: latest',
        '  - Driver: v2',
        '',
        '2. Run it',
        '3. Verify',
      ].join('\n'),
    );
  });

  it('fences indented code so it stays code at the root', () => {
    expect(splitListsAroundBlocks(nestedListReplies.indentedCodeInItem)).toBe(
      [
        '1. Run:',
        '',
        '```',
        'make all',
        'make test',
        '```',
        '',
        '2. Ship it',
      ].join('\n'),
    );
  });

  it('closes a fence that its list item ended', () => {
    const reply = '1. Run:\n\n   ```sh\n   make\n2. Next';

    const output = splitListsAroundBlocks(reply);
    expect(output).toBe('1. Run:\n\n```sh\nmake\n```\n\n2. Next');
    expectSameReading(reply, output);
  });

  it('takes a closing fence that leaves the list item as the closer, as md4c does', () => {
    const reply = '1. Run:\n\n   ```sh\n   make\n```\n2. Next';
    const output = splitListsAroundBlocks(reply);

    expect(output).toBe('1. Run:\n\n```sh\nmake\n```\n\n2. Next');
    expectSameReading(reply, output);
  });

  it('keeps as text a fence opener that leaves the list item, as md4c reads it', () => {
    const reply = '1. Run:\n\n   ```sh\n   make\n```py\nmore';
    const output = splitListsAroundBlocks(reply);

    expect(output).toBe('1. Run:\n\n```sh\nmake\n```\n\n\\```py\nmore');
    expect(nestedBlockCount(parseMarkdown(output))).toBe(0);
    expect(wordsOf(parseMarkdown(output)).join('')).toBe(
      wordsOf(parseMarkdown(reply)).join(''),
    );
  });

  describe('while the reply streams', () => {
    const streamed = Object.entries(nestedListReplies);

    it.each(streamed)(
      '%s: every prefix keeps its words and numbers and leaves no block nested',
      (_name, reply) => {
        for (const prefix of prefixes(reply)) {
          const output = splitListsAroundBlocks(prefix);
          expect(nestedBlockCount(parseMarkdown(output))).toBe(0);
          expectSameReading(prefix, output);
        }
      },
    );

    it.each(streamed)(
      '%s: every root block but the last stays as it was',
      (_name, reply) => {
        let previous: MdNode[] = [];
        for (const prefix of prefixes(reply)) {
          const blocks =
            parseMarkdown(splitListsAroundBlocks(prefix)).children ?? [];
          expect(blocks.slice(0, previous.length - 1)).toEqual(
            previous.slice(0, -1),
          );
          previous = blocks;
        }
      },
    );
  });
});
