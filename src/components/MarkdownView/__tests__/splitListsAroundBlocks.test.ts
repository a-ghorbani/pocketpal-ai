import {
  listInRootBlockquote,
  nestedListReplies,
  unaffectedReplies,
} from '../../../../jest/fixtures/nestedListReplies';
import {
  blockProblems,
  listItemsOf,
  loadMd4c,
  nestedBlockCount,
  parseMarkdown,
  rootBlocks,
  rootBlockTypes,
  settledRootBlocks,
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
  expect(blockProblems(before, after)).toEqual([]);
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

    it('leaves its own output unchanged', () => {
      const output = splitListsAroundBlocks(reply);
      expect(splitListsAroundBlocks(output)).toBe(output);
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

  it('lengthens a moved fence that a code line would close at the root', () => {
    expect(
      splitListsAroundBlocks(nestedListReplies.overIndentedBareFence),
    ).toBe(
      [
        '- Example:',
        '',
        '````md',
        'text',
        ' ```',
        'more',
        '````',
        '',
        '- Next',
      ].join('\n'),
    );
  });

  it('keeps a root table out of a sub-list that the split moved to the root', () => {
    expect(
      splitListsAroundBlocks(nestedListReplies.rootTableAfterSubList),
    ).toBe(
      [
        '1. Install:',
        '',
        '```sh',
        'npm i',
        '```',
        '',
        '- needs Node 18',
        '',
        ' | Option | Speed | Cost |',
        '  |--------|-------|------|',
        '  | Alpha | Fast | Low |',
        '  | Beta | Slow | High |',
        '',
        '2. Run it',
      ].join('\n'),
    );
  });

  it('keeps a root list out of a sub-list that the split moved to the root', () => {
    expect(splitListsAroundBlocks(nestedListReplies.rootListAfterSubList)).toBe(
      [
        '1. Install:',
        '',
        '```sh',
        'npm i',
        '```',
        '',
        '- needs Node 18',
        '',
        ' * Linux',
        '   or macOS',
        ' * Windows',
        '',
        '2. Run it',
      ].join('\n'),
    );
  });

  it('moves a quoted fence with the closer md4c took from outside the quote', () => {
    const atRoot = splitListsAroundBlocks(
      nestedListReplies.quotedFenceClosedAtRoot,
    );
    const inItem = splitListsAroundBlocks(
      nestedListReplies.quotedFenceClosedInItem,
    );

    expect(atRoot).toBe('1. Note:\n\n> ```sh\n> run\n```\n\n2. Next\n3. Last');
    expect(rootBlockTypes(parseMarkdown(atRoot))).toEqual([
      'OrderedList',
      'Blockquote',
      'OrderedList',
    ]);
    expect(inItem).toBe(
      '1. Note:\n\n> ```sh\n> run\n```\n\nMore text here.\n\n2. Next',
    );
    expect(rootBlockTypes(parseMarkdown(inItem))).toEqual([
      'OrderedList',
      'Blockquote',
      'Paragraph',
      'OrderedList',
    ]);
  });

  it('leaves a fence that opens on the list marker line in its item', () => {
    const reply = '1. ```sh\n   make\n   ```\n2. Next';

    expect(splitListsAroundBlocks(reply)).toBe(reply);
  });

  it('measures a tab after a quote mark from its column', () => {
    const reply = '- Note:\n\n  > \tcode line\n      more code\n- Next';
    const output = splitListsAroundBlocks(reply);

    expect(output).toBe(
      '- Note:\n\n  > \tcode line\n\n```\nmore code\n```\n\n- Next',
    );
    expectSameReading(reply, output);
  });

  it('leaves the marker of a list before the first block as written', () => {
    const reply = '- a\n\nPara\n\n- b\n\n1. x\n\n   ```\n   c\n   ```\n2. y';

    expect(splitListsAroundBlocks(reply)).toBe(
      '- a\n\nPara\n\n- b\n\n1. x\n\n```\nc\n```\n\n2. y',
    );
  });

  describe('the md4c reading check', () => {
    const problems = (input: string, output: string) =>
      blockProblems(parseMarkdown(input), parseMarkdown(output));

    it('flags a block the split added', () => {
      expect(
        problems(
          '1. a\n\n   ```\n   x\n   ```\n2. b',
          '1. a\n\n```\nx\n```\n\n***\n\n2. b',
        ),
      ).toContain('leaf blocks');
    });

    it('flags a list item that got deeper', () => {
      expect(problems('- a\n- b', '- a\n  - b')).toContain('deeper item');
    });

    it('leaves out the root block with the last text and what follows it', () => {
      expect(settledRootBlocks(parseMarkdown('A\n\nB\n\n-'))).toEqual(
        rootBlocks(parseMarkdown('A')),
      );
    });
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
      '%s: every root block before the last text stays as it was',
      (_name, reply) => {
        let settled: string[] = [];
        for (const prefix of prefixes(reply)) {
          const after = parseMarkdown(splitListsAroundBlocks(prefix));
          expect(rootBlocks(after).slice(0, settled.length)).toEqual(settled);
          settled = settledRootBlocks(after);
        }
      },
    );
  });
});
