import {
  blockProblems,
  listItemsOf,
  loadMd4c,
  MdNode,
  nestedBlockCount,
  parseMarkdown,
  wordsOf,
} from '../../../../jest/md4c';

import {splitListsAroundBlocks} from '../splitListsAroundBlocks';

beforeAll(loadMd4c);

const DOCUMENTS = 300;

const seededRandom = (seed: number) => (n: number) => {
  seed = (seed * 48271) % 2147483647;
  return seed % n;
};

const textColumn = (indent: number, marker: string, gap: string) =>
  gap === '\t'
    ? (Math.floor((indent + marker.length) / 4) + 1) * 4
    : indent + marker.length + gap.length;

const randomReply = (random: (n: number) => number): string => {
  const pick = <T>(choices: T[]) => choices[random(choices.length)];
  const chance = (n: number) => random(n) === 0;
  const lines: string[] = [];
  let id = 0;
  const table = (indent: string) =>
    [
      `| h${++id}a | h${id}b |`,
      '|---|:--:|',
      `| c${id}x | c${id}y |`,
      `| d${id}x | d${id}y |`,
    ].map(line => indent + line);
  const code = (indent: string) => {
    const fence = pick(['```', '```', '~~~', '````']);
    const body = [`print(${++id})`, `1. not item ${id}`];
    if (chance(3)) {
      body.push(' '.repeat(1 + random(5)) + fence.slice(0, 3));
    }
    if (chance(4)) {
      body.push('', `\tindented${id}`);
    }
    return [
      indent + fence + pick(['py', '', 'sh']),
      ...body.map(line => (line === '' ? '' : indent + line)),
      indent + fence,
    ];
  };
  const quote = (indent: string) =>
    (chance(2) ? table('') : code('')).map(line => `${indent}> ${line}`);
  const block = (indent: string) => {
    const kind = random(6);
    if (kind < 2) {
      return table(indent);
    }
    if (kind < 4) {
      return code(indent);
    }
    if (kind === 4) {
      return quote(indent);
    }
    return [`${indent}### Heading ${++id}`];
  };
  const rootLines = () => {
    const indent = pick(['', ' ', '  ', '   ']);
    const kind = random(6);
    if (kind === 0) {
      return [`${indent}Then check ${++id}.`, `${3 + random(5)}. Run ${id}`];
    }
    if (kind === 1) {
      return [`${indent}* root${++id} item`, `${indent}  more${id}`];
    }
    if (kind === 2) {
      return [`${indent}## Section ${++id}`];
    }
    return block(indent);
  };
  const list = (depth: number, indent: number) => {
    const ordered = random(2) === 0;
    const allSame = random(4) === 0;
    const start = pick([1, 1, 1, 3, 9, 10, 99]);
    const delimiter = pick(['.', '.', ')']);
    const bullet = pick(['-', '-', '*', '+']);
    const gap = pick([' ', ' ', ' ', '  ', '   ', '\t']);
    const count = 1 + random(4);
    for (let k = 0; k < count; k++) {
      const marker = ordered
        ? `${allSame ? start : start + k}${delimiter}`
        : bullet;
      const content = ' '.repeat(textColumn(indent, marker, gap));
      lines.push(`${' '.repeat(indent)}${marker}${gap}item${++id} words here`);
      if (chance(3)) {
        lines.push(`${random(2) ? content : ''}lazy${id} continuation`);
      }
      const extras = random(4);
      for (let e = 0; e < extras; e++) {
        const kind = random(5);
        const blankAfter = random(4) !== 0;
        const over = pick(['', '', '', ' ', '  ', '   ']);
        if (kind < 3) {
          lines.push('', ...block(content + over), ...(blankAfter ? [''] : []));
        } else if (kind === 3 && depth < 3) {
          list(depth + 1, content.length + pick([0, 0, 1]));
        } else {
          lines.push('', `${content}para${++id} after block`);
        }
      }
      if (chance(3)) {
        lines.push('');
      }
      if (depth === 0 && chance(6)) {
        lines.push('', ...rootLines(), '');
      }
    }
  };
  if (random(2)) {
    lines.push('Intro text.', '');
  }
  list(0, 0);
  if (random(2)) {
    lines.push('', ...rootLines());
  }
  if (random(2)) {
    lines.push('', 'Closing text.');
  }
  const tabbed = chance(5)
    ? lines.map(line => line.replace(/^ {4}/, '\t'))
    : lines;
  return tabbed.join(chance(6) ? '\r\n' : '\n');
};

const MARKUP = /^[|:`~>#-]+(?:py|sh)?$/;

const numbers = (root: MdNode) =>
  listItemsOf(root)
    .map(item => `${item.text} = ${item.number}`)
    .sort();

const problemsOf = (
  input: string,
  output: string,
  after = parseMarkdown(output),
): string[] => {
  const before = parseMarkdown(input);
  const content = (words: string[]) => words.filter(w => !MARKUP.test(w));
  const markup = (words: string[]) => words.filter(w => MARKUP.test(w));
  const wordsBefore = wordsOf(before);
  const wordsAfter = wordsOf(after);
  return [
    nestedBlockCount(after) > 0 && 'nested',
    JSON.stringify(content(wordsAfter)) !==
      JSON.stringify(content(wordsBefore)) && 'words',
    markup(wordsAfter).length > markup(wordsBefore).length && 'markup',
    JSON.stringify(numbers(after)) !== JSON.stringify(numbers(before)) &&
      'numbers',
    ...blockProblems(before, after),
    splitListsAroundBlocks(output) !== output && 'not idempotent',
  ].filter((problem): problem is string => typeof problem === 'string');
};

// md4c's reading of a few deep, blank-heavy lists changes when an unrelated
// paragraph gets longer, so a prefix only counts as failing if it also fails
// with longer text.
const failsWithLongerText = (markdown: string) => {
  const longer = markdown.replace(/ words here/g, ' words here too');
  return problemsOf(longer, splitListsAroundBlocks(longer)).length > 0;
};

it('keeps md4c reading of random nested replies on every line prefix', () => {
  const random = seededRandom(42);
  const failures: string[] = [];
  let layoutDependent = 0;
  for (let d = 0; d < DOCUMENTS && failures.length < 3; d++) {
    const reply = randomReply(random);
    const eol = reply.includes('\r\n') ? '\r\n' : '\n';
    const lines = reply.split(eol);
    let unstable = false;
    let previous: string[] = [];
    for (let n = 1; n <= lines.length; n++) {
      const prefix = lines.slice(0, n).join(eol);
      const output = splitListsAroundBlocks(prefix);
      const after = parseMarkdown(output);
      const blocks = (after.children ?? []).map(node => JSON.stringify(node));
      const settled = previous.slice(0, -1);
      const problems = [
        ...problemsOf(prefix, output, after),
        JSON.stringify(blocks.slice(0, settled.length)) !==
          JSON.stringify(settled) && 'earlier root block changed',
      ].filter((problem): problem is string => typeof problem === 'string');
      previous = blocks;
      if (problems.length === 0) {
        continue;
      }
      if (failsWithLongerText(prefix)) {
        failures.push(`${problems.join()}\n${JSON.stringify(prefix)}`);
        break;
      }
      unstable = true;
    }
    layoutDependent += unstable ? 1 : 0;
  }

  expect(failures).toEqual([]);
  expect(layoutDependent).toBeLessThan(DOCUMENTS / 50);
});
